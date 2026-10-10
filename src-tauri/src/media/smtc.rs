//! Windows System Media Transport Controls (SMTC) bridge.
//!
//! SMTC is the API behind the volume flyout's media card. Spotify, browsers
//! (YouTube Music, YouTube, SoundCloud, …), Apple Music, Media Player, VLC and
//! most others publish into it, which is why Luma needs no per-service login.
//!
//! One worker thread owns every WinRT object. It is event driven: the OS tells
//! it when sessions come and go and when metadata, playback state or timeline
//! change. Events only poke a channel; the worker coalesces bursts, rebuilds a
//! snapshot of all sessions, and tells the UI only if something it would notice
//! changed. A 5 s heartbeat re-syncs in case an event was ever missed.

use std::collections::HashMap;
use std::sync::mpsc::{channel, RecvTimeoutError, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use luma_core::artwork::{data_url, ArtworkCache};
use luma_core::media::{
    build_state, hash_id, materially_differs, timeline_from_raw, ActivityTracker, ControlAction, Controls,
    MediaState, PlaybackStatus, SessionSnapshot, Track,
};
use windows::core::Interface;
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProps,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as WinStatus, MediaPropertiesChangedEventArgs,
    PlaybackInfoChangedEventArgs, SessionsChangedEventArgs, TimelinePropertiesChangedEventArgs,
};
use windows::Storage::Streams::{DataReader, IInputStream};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

const HEARTBEAT: Duration = Duration::from_secs(5);
/// Bursts of events (a track change fires several) are folded into one refresh.
const COALESCE: Duration = Duration::from_millis(60);
/// Never refresh more often than this, whatever a chatty player sends.
const MIN_REFRESH_GAP: Duration = Duration::from_millis(200);
/// Artwork larger than this is ignored rather than shipped over IPC.
const MAX_ART_BYTES: u64 = 4 * 1024 * 1024;

enum Msg {
    Wake,
    Pin(Option<String>),
    Control(ControlAction),
    Shutdown,
}

pub struct Bridge {
    tx: Sender<Msg>,
}

impl Bridge {
    pub fn start(artwork: Arc<Mutex<ArtworkCache>>, on_state: Box<dyn Fn(MediaState) + Send>) -> Self {
        let (tx, rx) = channel();
        let worker_tx = tx.clone();
        thread::Builder::new()
            .name("luma-smtc".into())
            .spawn(move || run(rx, worker_tx, on_state, artwork))
            .expect("could not start the media thread");
        Bridge { tx }
    }

    pub fn control(&self, action: ControlAction) {
        let _ = self.tx.send(Msg::Control(action));
    }

    pub fn pin(&self, id: Option<String>) {
        let _ = self.tx.send(Msg::Pin(id));
    }

}

impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = self.tx.send(Msg::Shutdown);
    }
}

/// A session we listen to, with the tokens needed to stop listening.
struct Sub {
    session: Session,
    tokens: (i64, i64, i64),
}

impl Sub {
    fn new(session: &Session, tx: &Sender<Msg>) -> windows::core::Result<Self> {
        let (a, b, c) = (tx.clone(), tx.clone(), tx.clone());
        let t1 = session.MediaPropertiesChanged(&TypedEventHandler::<Session, MediaPropertiesChangedEventArgs>::new(
            move |_, _| {
                let _ = a.send(Msg::Wake);
                Ok(())
            },
        ))?;
        let t2 = session.PlaybackInfoChanged(&TypedEventHandler::<Session, PlaybackInfoChangedEventArgs>::new(
            move |_, _| {
                let _ = b.send(Msg::Wake);
                Ok(())
            },
        ))?;
        let t3 = session.TimelinePropertiesChanged(
            &TypedEventHandler::<Session, TimelinePropertiesChangedEventArgs>::new(move |_, _| {
                let _ = c.send(Msg::Wake);
                Ok(())
            }),
        )?;
        Ok(Sub { session: session.clone(), tokens: (t1, t2, t3) })
    }

    fn unsubscribe(&self) {
        let _ = self.session.RemoveMediaPropertiesChanged(self.tokens.0);
        let _ = self.session.RemovePlaybackInfoChanged(self.tokens.1);
        let _ = self.session.RemoveTimelinePropertiesChanged(self.tokens.2);
    }
}

struct Worker {
    tx: Sender<Msg>,
    on_state: Box<dyn Fn(MediaState) + Send>,
    artwork: Arc<Mutex<ArtworkCache>>,
    manager: Option<Manager>,
    manager_tokens: (i64, i64),
    subs: HashMap<String, Sub>,
    activity: ActivityTracker,
    pinned: Option<String>,
    last: Option<MediaState>,
    /// track key → artwork id, so unchanged tracks never re-read their image.
    art_by_key: HashMap<String, String>,
    /// session → (track key, artwork id) of the previous read, to spot stale art.
    art_last: HashMap<String, (String, String)>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn run(rx: Receiver<Msg>, tx: Sender<Msg>, on_state: Box<dyn Fn(MediaState) + Send>, artwork: Arc<Mutex<ArtworkCache>>) {
    // WinRT async results are awaited with `.get()`, which wants a multithreaded apartment.
    // It fails harmlessly if the thread is already initialised.
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let mut w = Worker {
        tx,
        on_state,
        artwork,
        manager: None,
        manager_tokens: (0, 0),
        subs: HashMap::new(),
        activity: ActivityTracker::default(),
        pinned: None,
        last: None,
        art_by_key: HashMap::new(),
        art_last: HashMap::new(),
    };
    let mut last_refresh = Instant::now() - MIN_REFRESH_GAP;

    loop {
        if w.manager.is_none() {
            if let Err(e) = w.connect() {
                w.publish(MediaState::unavailable(format!("Windows media controls are unavailable: {e}")));
                // Retry later: the Media Feature Pack may be missing or the service restarting.
                match rx.recv_timeout(Duration::from_secs(15)) {
                    Ok(Msg::Shutdown) | Err(RecvTimeoutError::Disconnected) => return,
                    _ => continue,
                }
            }
            w.refresh();
            last_refresh = Instant::now();
        }

        let first = rx.recv_timeout(HEARTBEAT);
        match first {
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
            Ok(msg) => {
                if w.handle(msg) {
                    break;
                }
                // Fold the rest of the burst into this one refresh.
                let wait = COALESCE.max(MIN_REFRESH_GAP.saturating_sub(last_refresh.elapsed()));
                thread::sleep(wait);
                let mut shutdown = false;
                while let Ok(m) = rx.try_recv() {
                    if w.handle(m) {
                        shutdown = true;
                        break;
                    }
                }
                if shutdown {
                    break;
                }
            }
        }
        w.refresh();
        last_refresh = Instant::now();
    }
    w.disconnect();
}

impl Worker {
    /// Returns true to stop.
    fn handle(&mut self, msg: Msg) -> bool {
        match msg {
            Msg::Wake => {}
            Msg::Shutdown => return true,
            Msg::Pin(id) => self.pinned = id,
            Msg::Control(action) => self.control(action),
        }
        false
    }

    fn connect(&mut self) -> windows::core::Result<()> {
        let manager = Manager::RequestAsync()?.get()?;
        let (a, b) = (self.tx.clone(), self.tx.clone());
        let t1 = manager.SessionsChanged(&TypedEventHandler::<Manager, SessionsChangedEventArgs>::new(
            move |_, _| {
                let _ = a.send(Msg::Wake);
                Ok(())
            },
        ))?;
        let t2 = manager.CurrentSessionChanged(&TypedEventHandler::<Manager, CurrentSessionChangedEventArgs>::new(
            move |_, _| {
                let _ = b.send(Msg::Wake);
                Ok(())
            },
        ))?;
        self.manager_tokens = (t1, t2);
        self.manager = Some(manager);
        Ok(())
    }

    fn disconnect(&mut self) {
        for sub in self.subs.values() {
            sub.unsubscribe();
        }
        self.subs.clear();
        if let Some(m) = self.manager.take() {
            let _ = m.RemoveSessionsChanged(self.manager_tokens.0);
            let _ = m.RemoveCurrentSessionChanged(self.manager_tokens.1);
        }
    }

    fn publish(&mut self, state: MediaState) {
        let changed = self.last.as_ref().map_or(true, |old| materially_differs(old, &state));
        if changed {
            self.last = Some(state.clone());
            (self.on_state)(state);
        }
    }

    fn live_sessions(manager: &Manager) -> windows::core::Result<Vec<Session>> {
        let list = manager.GetSessions()?;
        let mut out = Vec::new();
        for i in 0..list.Size()? {
            if let Ok(s) = list.GetAt(i) {
                out.push(s);
            }
        }
        Ok(out)
    }

    fn refresh(&mut self) {
        let Some(manager) = self.manager.clone() else { return };
        let live = match Self::live_sessions(&manager) {
            Ok(l) => l,
            Err(e) => {
                // The service went away: drop everything and reconnect on the next loop.
                self.disconnect();
                self.publish(MediaState::unavailable(format!("Lost the Windows media service: {e}")));
                return;
            }
        };
        let current_id =
            manager.GetCurrentSession().ok().and_then(|s| s.SourceAppUserModelId().ok()).map(|h| h.to_string());

        self.sync_subscriptions(&live);

        let now = now_ms();
        let mut snaps = Vec::with_capacity(live.len());
        for s in &live {
            if let Some(snap) = self.snapshot(s, current_id.as_deref(), now) {
                snaps.push(snap);
            }
        }
        self.activity.observe(&snaps, now);
        let state = build_state(&snaps, self.pinned.as_deref(), &self.activity);
        self.publish(state);
    }

    fn sync_subscriptions(&mut self, live: &[Session]) {
        let ids: Vec<(String, &Session)> =
            live.iter().filter_map(|s| s.SourceAppUserModelId().ok().map(|h| (h.to_string(), s))).collect();
        self.subs.retain(|id, sub| {
            let keep = ids.iter().any(|(i, _)| i == id);
            if !keep {
                sub.unsubscribe();
            }
            keep
        });
        self.art_last.retain(|id, _| ids.iter().any(|(i, _)| i == id));
        for (id, session) in ids {
            if self.subs.contains_key(&id) {
                continue;
            }
            if let Ok(sub) = Sub::new(session, &self.tx) {
                self.subs.insert(id, sub);
            }
        }
    }

    fn snapshot(&mut self, s: &Session, current: Option<&str>, now: u64) -> Option<SessionSnapshot> {
        let id = s.SourceAppUserModelId().ok()?.to_string();
        let info = s.GetPlaybackInfo().ok()?;
        let status = match info.PlaybackStatus().ok()? {
            WinStatus::Playing => PlaybackStatus::Playing,
            WinStatus::Paused => PlaybackStatus::Paused,
            WinStatus::Changing => PlaybackStatus::Loading,
            _ => PlaybackStatus::Stopped,
        };
        let controls = info
            .Controls()
            .map(|c| Controls {
                play: c.IsPlayEnabled().unwrap_or(false),
                pause: c.IsPauseEnabled().unwrap_or(false),
                next: c.IsNextEnabled().unwrap_or(false),
                previous: c.IsPreviousEnabled().unwrap_or(false),
                seek: c.IsPlaybackPositionEnabled().unwrap_or(false),
            })
            .unwrap_or_default();
        let rate = info.PlaybackRate().ok().and_then(|r| r.Value().ok()).unwrap_or(1.0);

        // Metadata can legitimately be missing; every field falls back to empty.
        let props = s.TryGetMediaPropertiesAsync().ok().and_then(|op| op.get().ok());
        let get = |r: windows::core::Result<windows::core::HSTRING>| r.map(|h| h.to_string()).unwrap_or_default();
        let (title, artist, album) = match &props {
            Some(p) => (get(p.Title()), get(p.Artist()), get(p.AlbumTitle())),
            None => Default::default(),
        };
        let artwork_id = props.as_ref().and_then(|p| self.artwork_for(&id, &title, &artist, &album, p));

        let timeline = s.GetTimelineProperties().ok().and_then(|t| {
            timeline_from_raw(
                t.StartTime().ok()?.Duration,
                t.EndTime().ok()?.Duration,
                t.Position().ok()?.Duration,
                t.LastUpdatedTime().ok()?.UniversalTime,
                now,
                status == PlaybackStatus::Playing,
                rate,
            )
        });

        Some(SessionSnapshot {
            is_system_current: current == Some(id.as_str()),
            id,
            track: Track { title, artist, album, artwork_id },
            status,
            controls,
            timeline,
        })
    }

    /// The artwork id for this track, reading the image only when it is new.
    fn artwork_for(&mut self, session: &str, title: &str, artist: &str, album: &str, props: &MediaProps) -> Option<String> {
        let key = hash_id(&[session.as_bytes(), title.as_bytes(), artist.as_bytes(), album.as_bytes()]);
        if let Some(id) = self.art_by_key.get(&key) {
            if self.artwork.lock().ok()?.contains(id) {
                return Some(id.clone());
            }
        }
        let bytes = read_thumbnail(props)?;
        let art_id = hash_id(&[&bytes]);
        self.artwork.lock().ok()?.insert(art_id.clone(), data_url(&bytes));

        // Some players publish the new title before the new image. If the image is
        // byte-identical to the previous track's, don't trust it yet: serve it, but
        // read again on the next refresh instead of caching it under this track.
        let stale = self.art_last.get(session).is_some_and(|(k, a)| *k != key && *a == art_id);
        self.art_last.insert(session.to_string(), (key.clone(), art_id.clone()));
        if !stale {
            if self.art_by_key.len() > 64 {
                self.art_by_key.clear();
            }
            self.art_by_key.insert(key, art_id.clone());
        }
        Some(art_id)
    }

    fn control(&self, action: ControlAction) {
        let Some(manager) = &self.manager else { return };
        let target = self.last.as_ref().and_then(|s| s.active.as_ref()).map(|a| a.id.clone());
        let Some(target) = target else { return };
        let Ok(sessions) = Self::live_sessions(manager) else { return };
        let Some(session) = sessions
            .iter()
            .find(|s| s.SourceAppUserModelId().map(|h| h.to_string()).ok().as_deref() == Some(target.as_str()))
        else {
            return;
        };
        // A false/Err result just means the player refused; the next refresh shows the truth.
        let _accepted: windows::core::Result<bool> = match action {
            ControlAction::Play => session.TryPlayAsync().and_then(|op| op.get()),
            ControlAction::Pause => session.TryPauseAsync().and_then(|op| op.get()),
            ControlAction::Toggle => session.TryTogglePlayPauseAsync().and_then(|op| op.get()),
            ControlAction::Next => session.TrySkipNextAsync().and_then(|op| op.get()),
            ControlAction::Previous => session.TrySkipPreviousAsync().and_then(|op| op.get()),
            ControlAction::Seek { position_ms } => session
                .TryChangePlaybackPositionAsync((position_ms as i64).saturating_mul(10_000))
                .and_then(|op| op.get()),
        };
    }
}

fn read_thumbnail(props: &MediaProps) -> Option<Vec<u8>> {
    let reference = props.Thumbnail().ok()?;
    let stream = reference.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()?;
    if size == 0 || size > MAX_ART_BYTES {
        return None;
    }
    let input: IInputStream = stream.cast().ok()?;
    let reader = DataReader::CreateDataReader(&input).ok()?;
    let loaded = reader.LoadAsync(size as u32).ok()?.get().ok()?;
    let mut buf = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut buf).ok()?;
    if buf.is_empty() {
        None
    } else {
        Some(buf)
    }
}
