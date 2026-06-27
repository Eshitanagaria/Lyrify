# 🎤 Lyrify

A translucent, draggable, **karaoke-style lyrics overlay** that floats above everything else on your screen and follows whatever's playing on Spotify (app or web player) or YouTube.

No solid background. No clicking back and forth. Just lyrics, synced, sitting quietly on top of whatever you're doing.

![license](https://img.shields.io/badge/license-MIT-green) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue) ![made with](https://img.shields.io/badge/made%20with-Electron-9feaf9)

---

## ✨ Features

-  Translucent, frosted-glass overlay that stays on top of every app, doesn't need re-clicking
-  Works with **Spotify** (desktop app *and* web player, same mechanism) **and YouTube**
-  Karaoke-style line-fill highlighting synced to playback position
-  Pick your own text color and highlight color
-  Choose how many lines of lyrics are visible at once (1–9)
-  Click-through mode which lets you interact with whatever's behind it without moving the overlay
-  Global hotkeys to show/hide, toggle click-through, and quit
-  Free lyrics database (lrclib.net) so no scraping, no paid API

## ⚡ Quick start

```bash
git clone https://github.com/Eshitanagaria/Lyrify.git
cd Lyrify/lyrify
npm install
npm start
```

Then click the ⚙ on the overlay and connect Spotify (one-time setup, ~2 minutes — see below).

## 🛠 Setup

### 1. Install Node.js
Get the LTS version from [nodejs.org](https://nodejs.org) if you don't have it.

### 2. Install dependencies
```bash
cd lyrify
npm install
```

### 3. Set up Spotify (one-time, ~2 minutes)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**. Name/description can be anything.
3. In **Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:8898/callback
   ```
   It must be that literal IP — Spotify no longer accepts `localhost`.
4. Save, then copy the **Client ID** from the app's overview page (you don't need the secret — this uses the PKCE flow).

> ⚠️ **As of February 2026, Spotify requires the account that creates the Developer app to have an active Premium subscription** — Development Mode apps stop working if that lapses. This is a Spotify-side policy change, not something this project controls. The YouTube side of this app is unaffected either way.

### 4. Run it
```bash
npm start
```
Click ⚙ → paste your Client ID → **Connect Spotify** → approve in the browser that opens.

### 5. YouTube bridge (only needed for YouTube)
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `youtube-lyrics-bridge` folder
3. That's it — no popup, it just quietly feeds the overlay whenever you're on a YouTube video

## 🎛 Settings panel

| Setting | What it does |
|---|---|
| Lines shown | How many lyric lines are visible at once (1–9) |
| Background opacity / blur | Frosted-glass translucency |
| Text color / Highlight color | Pick any colors you want |
| Font size | Self-explanatory |
| Show track name | Toggles the small title in the drag bar |

## ⌨️ Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+L` | Show/hide the overlay |
| `Ctrl+Alt+K` | Toggle click-through |
| `Ctrl+Alt+Q` | Quit |

The window is draggable from its top strip and resizable from its edges. There's also a ✕ button on the overlay itself to quit.

## ❓ FAQ

**Will this break if a lot of people use it / am I going to run into Spotify's rate limits?**
No — and this is worth understanding if you're contributing or just curious. There's no shared backend and no shared Spotify app. Every person who runs this creates **their own** Spotify Developer app and Client ID, and authenticates with **their own** Spotify account. Spotify's rate limits and quotas are scoped per Client ID, so your usage and someone else's are completely isolated — one person playing music all day doesn't put anyone else closer to a limit. The 30-second-rolling-window rate limit only matters for *your own* polling behavior, and the app already backs off and respects `Retry-After` if it's ever hit.

**Why did I get a 429 error?**
Almost always from rapid dev-testing (restarting the app over and over in a short window). Normal day-to-day use (open laptop, play music, occasionally restart the app) won't come close to the limit.

**Do I need Spotify Premium?**
To create the Developer app, yes (Spotify's February 2026 policy, not this project's choice). To just use the YouTube side, no.

**Why not just bundle one shared Spotify app for everyone?**
Spotify explicitly disallows this for Development Mode apps (one Client ID is meant for one developer's personal use, capped at 5 authorized users) — distributing a single Client ID to many people violates their terms and gets it revoked quickly. Everyone creating their own app is the only way this scales safely and stays within the rules.

## 🧠 How it actually works

- **Spotify**: polls the official `/me/player/currently-playing` endpoint every 2 seconds. This is tied to your *account*, not a specific app, so it works identically whether you're playing from the desktop app or the website.
- **YouTube**: a small content script reads the page's `<video>` element directly (current time, duration, paused state) and the video title, forwarding it over a local WebSocket to the overlay app. Title parsing is heuristic ("Artist - Title") — most reliable on official music uploads.
- **Lyrics**: fetched from [lrclib.net](https://lrclib.net), a free, open lyrics database with line-level timestamps.
- **Sync**: between API polls, playback position is extrapolated from elapsed wall-clock time, so the highlight stays smooth even with infrequent polling.
- **Karaoke fill**: since timestamps are per-line (not per-word), the "karaoke" effect is a left-to-right color sweep across the current line, timed against how far you are between this line's timestamp and the next one.

## 🐞 Known limitations

- YouTube title parsing can mismatch on videos that don't follow an "Artist - Title" naming pattern
- True OS-level exclusive fullscreen (rare for browsers) can cover the overlay
- Tested primarily on Windows; macOS/Linux translucency may render slightly differently

## 🤝 Contributing

Issues and PRs welcome — this started as a personal weekend project, so there's plenty of room to make the title-parsing smarter, add more music sources, or polish the UI further.

## ⭐ If you found this useful

Consider starring the repo — it genuinely helps other people find it, and helps me know if it's worth continuing to build on.

## License

MIT — see [LICENSE](LICENSE).
