//! Album artwork: a tiny LRU cache of `data:` URLs, so metadata events stay
//! small and the image crosses the IPC boundary only when it changes.

use std::collections::VecDeque;

pub struct ArtworkCache {
    cap: usize,
    /// Most recently used last.
    items: VecDeque<(String, String)>,
}

impl ArtworkCache {
    pub fn new(cap: usize) -> Self {
        Self { cap: cap.max(1), items: VecDeque::new() }
    }

    pub fn contains(&self, id: &str) -> bool {
        self.items.iter().any(|(k, _)| k == id)
    }

    pub fn get(&mut self, id: &str) -> Option<String> {
        let pos = self.items.iter().position(|(k, _)| k == id)?;
        let item = self.items.remove(pos)?;
        let url = item.1.clone();
        self.items.push_back(item);
        Some(url)
    }

    pub fn insert(&mut self, id: String, data_url: String) {
        if let Some(pos) = self.items.iter().position(|(k, _)| *k == id) {
            self.items.remove(pos);
        }
        self.items.push_back((id, data_url));
        while self.items.len() > self.cap {
            self.items.pop_front();
        }
    }
}

/// Image MIME type from the leading bytes; the stream's own content type is
/// sometimes empty or wrong.
pub fn sniff_mime(bytes: &[u8]) -> &'static str {
    match bytes {
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [0xFF, 0xD8, 0xFF, ..] => "image/jpeg",
        [b'G', b'I', b'F', b'8', ..] => "image/gif",
        [b'B', b'M', ..] => "image/bmp",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "image/webp",
        _ => "image/jpeg",
    }
}

pub fn data_url(bytes: &[u8]) -> String {
    format!("data:{};base64,{}", sniff_mime(bytes), base64(bytes))
}

pub fn base64(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let n = match chunk.len() {
            3 => (chunk[0] as u32) << 16 | (chunk[1] as u32) << 8 | chunk[2] as u32,
            2 => (chunk[0] as u32) << 16 | (chunk[1] as u32) << 8,
            _ => (chunk[0] as u32) << 16,
        };
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_rfc_4648_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn mime_types_are_sniffed_from_bytes() {
        assert_eq!(sniff_mime(&[0x89, b'P', b'N', b'G', 0, 0]), "image/png");
        assert_eq!(sniff_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), "image/jpeg");
        assert_eq!(sniff_mime(b"RIFF\0\0\0\0WEBPVP8 "), "image/webp");
        assert_eq!(sniff_mime(b""), "image/jpeg");
        assert!(data_url(&[0xFF, 0xD8, 0xFF]).starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn the_cache_evicts_the_least_recently_used() {
        let mut c = ArtworkCache::new(2);
        c.insert("a".into(), "1".into());
        c.insert("b".into(), "2".into());
        assert_eq!(c.get("a").as_deref(), Some("1")); // a is now newest
        c.insert("c".into(), "3".into()); // evicts b
        assert!(c.contains("a") && c.contains("c") && !c.contains("b"));
        c.insert("a".into(), "9".into()); // replace, no growth
        assert_eq!(c.get("a").as_deref(), Some("9"));
        assert_eq!(c.get("zzz"), None);
    }
}
