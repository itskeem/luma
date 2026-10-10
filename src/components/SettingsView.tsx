import { useBackend } from "../lib/backend.ts";
import type { SettingsApi } from "../state/useSettings.ts";
import type { BaseView } from "../state/useIsland.ts";
import type { Animation, ClockFormat, Density, IdleBehavior, PetSize, PositionPreset, Theme } from "../types.ts";
import { Row, Section, Segmented, Stepper, Toggle } from "./controls.tsx";
import { Nav } from "./MusicView.tsx";

const THEMES: { value: Theme; label: string }[] = [
  { value: "adaptive", label: "Artwork" },
  { value: "luma", label: "Luma" },
  { value: "midnight", label: "Midnight" },
  { value: "graphite", label: "Graphite" },
];

export function SettingsView({ api, go }: { api: SettingsApi; go: (v: BaseView) => void }) {
  const backend = useBackend();
  const { settings: s, update, error } = api;
  const focus = (patch: Partial<typeof s.focus>) => update({ focus: { ...s.focus, ...patch } });
  const pet = (patch: Partial<typeof s.pet>) => update({ pet: { ...s.pet, ...patch } });

  return (
    <div className="panel settings">
      <div className="settings-head">
        <h2>Settings</h2>
        <Nav go={go} current="settings" />
      </div>

      <div className="settings-body">
        {error && <p className="notice" role="alert">{error}</p>}

        <Section title="Appearance">
          <div className="themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={s.theme === t.value} data-theme-swatch={t.value} onClick={() => update({ theme: t.value })}>
                <i />
                {t.label}
              </button>
            ))}
          </div>
          <Row label="Size">
            <Segmented<Density> label="Size" value={s.density} onChange={(density) => update({ density })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
          </Row>
          <Row label="Animation" hint="Equalizer and transitions">
            <Segmented<Animation> label="Animation" value={s.animation} onChange={(animation) => update({ animation })} options={[{ value: "off", label: "Off" }, { value: "subtle", label: "Subtle" }, { value: "full", label: "Full" }]} />
          </Row>
        </Section>

        <Section title="Clock &amp; Companion">
          <Row label="Time format">
            <Segmented<ClockFormat>
              label="Time format"
              value={s.clockFormat}
              onChange={(clockFormat) => update({ clockFormat })}
              options={[
                { value: "24h", label: "24-hour" },
                { value: "12h", label: "12-hour" },
              ]}
            />
          </Row>
          <Row label="Seconds display">
            <Toggle
              label="Show seconds"
              checked={s.showSeconds}
              onChange={(showSeconds) => update({ showSeconds })}
            />
          </Row>
          <Row label="Pause timeout" hint="Return to clock after music pauses">
            <Segmented<number>
              label="Pause timeout"
              value={s.pauseDelaySecs}
              onChange={(pauseDelaySecs) => update({ pauseDelaySecs })}
              options={[
                { value: 0, label: "Instant" },
                { value: 5, label: "5 s" },
                { value: 8, label: "8 s" },
                { value: 20, label: "20 s" },
              ]}
            />
          </Row>
        </Section>

        <Section title="Pet">
          <Row label="Show pet" hint="Floating companion that reacts to music &amp; focus">
            <Toggle label="Enable pet" checked={s.pet.enabled} onChange={(enabled) => {
              pet({ enabled });
              if (enabled) backend.showPet(); else backend.hidePet();
            }} />
          </Row>
          {s.pet.enabled && (
            <>
              <Row label="Size">
                <Segmented<PetSize>
                  label="Pet size"
                  value={s.pet.size}
                  onChange={(size) => pet({ size })}
                  options={[
                    { value: "small", label: "Small" },
                    { value: "medium", label: "Medium" },
                    { value: "large", label: "Large" },
                  ]}
                />
              </Row>
              <Row label="Reacts to music">
                <Toggle label="Reacts to music" checked={s.pet.reactsToMusic} onChange={(reactsToMusic) => pet({ reactsToMusic })} />
              </Row>
              <Row label="Reacts to focus timer">
                <Toggle label="Reacts to focus timer" checked={s.pet.reactsToFocus} onChange={(reactsToFocus) => pet({ reactsToFocus })} />
              </Row>
            </>
          )}
        </Section>

        <Section title="Position">
          <Row label="Home" hint={s.position === "custom" ? "You moved it. Pick a preset to snap back." : "Drag the island to place it anywhere."}>
            <Segmented<PositionPreset>
              label="Position"
              value={s.position}
              onChange={(position) => update({ position })}
              options={[
                { value: "top-left", label: "Left" },
                { value: "top-center", label: "Center" },
                { value: "top-right", label: "Right" },
                ...(s.position === "custom" ? [{ value: "custom" as const, label: "Custom", disabled: true }] : []),
              ]}
            />
          </Row>
        </Section>

        <Section title="Behavior">
          <Row label="Open on hover" hint="Opens when you point at it, folds when you leave">
            <Toggle label="Open on hover" checked={s.openOnHover} onChange={(openOnHover) => update({ openOnHover })} />
          </Row>
          <Row label="Fold after" hint="When not using hover (instant with hover)">
            <Segmented<number> label="Fold after" value={s.autoCollapseSecs} onChange={(autoCollapseSecs) => update({ autoCollapseSecs })} options={[{ value: 0, label: "Never" }, { value: 5, label: "5 s" }, { value: 8, label: "8 s" }, { value: 20, label: "20 s" }]} />
          </Row>
          <Row label="Show track changes" hint="A brief peek when the song changes">
            <Toggle label="Show track changes" checked={s.peekOnTrackChange} onChange={(peekOnTrackChange) => update({ peekOnTrackChange })} />
          </Row>
          <Row label="When idle" hint="No player running">
            <Segmented<IdleBehavior> label="When idle" value={s.idle} onChange={(idle) => update({ idle })} options={[{ value: "off", label: "Stay" }, { value: "dim", label: "Dim" }, { value: "hide", label: "Hide" }]} />
          </Row>
        </Section>

        <Section title="Startup">
          <Row label="Launch with Windows">
            <Toggle label="Launch with Windows" checked={s.launchAtStartup} onChange={(launchAtStartup) => update({ launchAtStartup })} />
          </Row>
        </Section>

        <Section title="Focus timer">
          <Row label="Focus">
            <Stepper label="focus length" value={s.focus.focusMin} min={1} max={180} unit="min" onChange={(focusMin) => focus({ focusMin })} />
          </Row>
          <Row label="Short break">
            <Stepper label="short break" value={s.focus.shortBreakMin} min={1} max={60} unit="min" onChange={(shortBreakMin) => focus({ shortBreakMin })} />
          </Row>
          <Row label="Long break" hint={`After every ${s.focus.roundsBeforeLong} sessions`}>
            <Stepper label="long break" value={s.focus.longBreakMin} min={1} max={120} unit="min" onChange={(longBreakMin) => focus({ longBreakMin })} />
          </Row>
          <Row label="Start next automatically">
            <Toggle label="Start next automatically" checked={s.focus.autoStartNext} onChange={(autoStartNext) => focus({ autoStartNext })} />
          </Row>
        </Section>

        <div className="settings-foot">
          <button type="button" className="btn-text" onClick={() => backend.hideIsland()}>Hide Luma</button>
          <button type="button" className="btn-text danger" onClick={() => backend.quitApp()}>Quit Luma</button>
        </div>
      </div>
    </div>
  );
}
