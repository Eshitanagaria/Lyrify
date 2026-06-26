# Synced Lyrics Overlay

A translucent, draggable, karaoke-style lyrics overlay that follows whatever's
playing on Spotify (app or web player) or YouTube.

Two pieces:
- `lyrics-overlay/` — the Electron overlay app (this is the thing you actually run)
- `youtube-lyrics-bridge/` — a tiny Chrome extension that feeds it YouTube timing
  (not needed for Spotify — that's handled directly via Spotify's own API)

## 1. Install Node.js

Get the LTS version from https://nodejs.org if you don't have it.

## 2. Install dependencies

```
cd lyrics-overlay
npm install
```

## 3. Set up Spotify (one-time, ~2 minutes)

1. Go to https://developer.spotify.com/dashboard and log in with your Spotify account.
2. Click "Create app". Name/description can be anything.
3. In **Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:8898/callback
   ```
   It must be that literal IP — Spotify no longer accepts `localhost`.
4. Save, then open the app and copy the **Client ID** (you don't need the secret —
   this app uses the PKCE flow, which doesn't require one).

## 4. Run the overlay

```
npm start
```

A translucent bar appears near the bottom of your screen. Click the ⚙ icon,
paste your Spotify Client ID into the settings panel, and click **Connect
Spotify**. Your browser opens — log in/approve, then come back to the app.
That's it — play anything on Spotify (desktop app or open.spotify.com, doesn't
matter which) and lyrics should appear within a couple seconds.

## 5. Set up the YouTube bridge (only needed for YouTube)

1. In Chrome, go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**, and select the `youtube-lyrics-bridge` folder.
4. Open any YouTube video — the extension quietly sends timing info to the
   overlay app whenever it's running. No popup, no UI, it just works in the background.

## Settings panel

- **Lines shown** — how many lines of lyrics are visible at once (1–9)
- **Background opacity / blur** — controls the frosted-glass translucency
- **Font size**
- **Show track name** — toggles the small title in the drag bar

## Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+L` | Show/hide the overlay |
| `Ctrl+Alt+K` | Toggle click-through (so clicks pass through to whatever's behind it) |
| `Ctrl+Alt+Q` | Quit |

The window itself is draggable from the thin top strip, and resizable from its edges.

## How it actually works

- **Spotify**: polls Spotify's official `/me/player/currently-playing` endpoint
  once a second. This is tied to your *account*, not a specific app, so it
  works identically whether you're playing from the desktop app or the website.
- **YouTube**: the extension's content script reads the page's `<video>` element
  directly (current time, duration, paused state) and the video title, and
  forwards it over a local WebSocket (`ws://127.0.0.1:8765`) to the overlay app.
  The title is parsed with a heuristic ("Artist - Title", stripping things like
  "(Official Video)") — works best on official music uploads, less reliably on
  random video titles.
- **Lyrics**: fetched from lrclib.net (free, no key needed), which has
  line-timestamped LRC lyrics for a large catalog. If Spotify/YouTube isn't
  playing, or no synced lyrics exist for a track, the overlay says so instead
  of guessing.
- **Sync**: between API polls, the app extrapolates playback position from
  elapsed wall-clock time, so the highlighted line stays smooth even though
  Spotify is only polled once a second.
- **Karaoke fill**: lrclib only has per-line timestamps, not per-word, so the
  "karaoke" effect is a left-to-right color sweep across the current line
  (calculated from how far you are between this line's timestamp and the next
  one) rather than true word-by-word — it reads as karaoke without needing
  data that doesn't exist for free.

## Known limitations

- If a YouTube video's title doesn't follow an "Artist - Title" pattern, lyric
  matching can fail or grab the wrong song — you can sanity-check this since
  the drag bar shows what it thinks is playing.
- True OS-level exclusive fullscreen (rare for browsers/Spotify) can cover the
  overlay, since it sits above normal windows but not below the OS's fullscreen
  compositor layer. Browser "fullscreen" (F11) is fine.
- Works on Windows, macOS, and Linux — translucency renders slightly differently
  per OS/GPU but the core look holds up everywhere.
