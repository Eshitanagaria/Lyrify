const USER_AGENT = 'EshaLyricsOverlay/1.0 (+personal desktop project)';

function parseLRC(lrcText) {
  const re = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)/;
  const lines = [];
  for (const raw of lrcText.split('\n')) {
    const m = raw.match(re);
    if (!m) continue;
    const min = parseInt(m[1], 10);
    const sec = parseFloat(m[2]);
    const timeMs = Math.round((min * 60 + sec) * 1000);
    const text = m[3].trim();
    lines.push({ timeMs, text });
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  return res.json();
}

// Tries an exact match first (track + artist [+ duration]), then falls back
// to a looser search. Returns a parsed lyrics array, or null if nothing synced was found.
async function fetchLyrics(trackName, artistName, durationSec) {
  if (trackName && artistName) {
    const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });
    if (durationSec) params.set('duration', String(Math.round(durationSec)));
    const data = await fetchJson(`https://lrclib.net/api/get?${params}`);
    if (data && data.syncedLyrics) {
      return { lines: parseLRC(data.syncedLyrics), instrumental: !!data.instrumental };
    }
    if (data && data.instrumental) {
      return { lines: [], instrumental: true };
    }
  }

  // Fallback: looser search, take the first result that actually has synced lyrics.
  const searchParams = new URLSearchParams();
  if (trackName) searchParams.set('track_name', trackName);
  if (artistName) searchParams.set('artist_name', artistName);
  if (!trackName && !artistName) return null;

  const results = await fetchJson(`https://lrclib.net/api/search?${searchParams}`);
  if (Array.isArray(results)) {
    const hit = results.find((r) => r.syncedLyrics);
    if (hit) return { lines: parseLRC(hit.syncedLyrics), instrumental: false };
  }
  return null;
}

module.exports = { fetchLyrics, parseLRC };
