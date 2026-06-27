const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const WebSocket = require('ws');

const config = require('./config');
const spotify = require('./spotify');
const lyricsApi = require('./lyrics');

let mainWindow;
let cfg = config.DEFAULTS;
let clickThroughEnabled = false;

// ---- Now-playing state ----
const state = {
  spotify: {
    accessToken: null,
    accessTokenExpiresAt: 0,
    connected: false,
    lastError: null,
    rateLimitedUntil: 0,
    lastPoll: null, // { trackId, trackName, artistName, durationMs, progressMs, isPlaying, fetchedAtMs }
  },
  youtube: {
    lastMessage: null, // { title, currentTime, duration, paused, receivedAtMs }
  },
  lyrics: {
    trackKey: null,
    lines: [],
    loading: false,
    instrumental: false,
    notFound: false,
  },
};

// ---------------- Window ----------------

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const winWidth = 760;
  const winHeight = 230;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((sw - winWidth) / 2),
    y: sh - winHeight - 60,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ---------------- YouTube bridge (local websocket server) ----------------

function startBridgeServer() {
  const wss = new WebSocket.Server({ host: '127.0.0.1', port: 8765 });
  wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data && data.type === 'youtube') {
          state.youtube.lastMessage = { ...data, receivedAtMs: Date.now() };
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
  wss.on('error', (err) => {
    console.error('Bridge server error (is port 8765 already in use?):', err.message);
  });
}

// ---------------- Spotify polling ----------------

async function ensureSpotifyToken() {
  if (!cfg.spotifyRefreshToken || !cfg.spotifyClientId) return null;
  if (state.spotify.accessToken && Date.now() < state.spotify.accessTokenExpiresAt - 5000) {
    return state.spotify.accessToken;
  }
  try {
    const tokens = await spotify.refreshAccessToken(cfg.spotifyClientId, cfg.spotifyRefreshToken);
    state.spotify.accessToken = tokens.access_token;
    state.spotify.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    if (tokens.refresh_token) {
      cfg.spotifyRefreshToken = tokens.refresh_token;
      config.save(cfg);
    }
    state.spotify.connected = true;
    state.spotify.lastError = null;
    return state.spotify.accessToken;
  } catch (e) {
    console.error('[Spotify] token refresh failed:', e.message);
    state.spotify.lastError = e.message;
    state.spotify.connected = false;
    return null;
  }
}

async function pollSpotify() {
  if (state.spotify.rateLimitedUntil && Date.now() < state.spotify.rateLimitedUntil) {
    return; // still backing off from a previous 429
  }
  const token = await ensureSpotifyToken();
  if (!token) return;
  try {
    const data = await spotify.getCurrentlyPlaying(token);
    if (!data || !data.item) {
      state.spotify.lastPoll = null;
      return;
    }
    state.spotify.lastPoll = {
      trackId: data.item.id,
      trackName: data.item.name,
      artistName: (data.item.artists || []).map((a) => a.name).join(', '),
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms || 0,
      isPlaying: !!data.is_playing,
      fetchedAtMs: Date.now(),
    };
    state.spotify.lastError = null;
    if (state.spotify.rateLimitedUntil) {
      state.spotify.rateLimitedUntil = 0;
      cfg.spotifyRateLimitedUntil = 0;
      config.save(cfg);
    }
  } catch (e) {
    if (e.code === 'RATE_LIMITED') {
      const waitMs = Math.max(5000, (e.retryAfterSec || 5) * 1000);
      state.spotify.rateLimitedUntil = Date.now() + waitMs;
      cfg.spotifyRateLimitedUntil = state.spotify.rateLimitedUntil;
      config.save(cfg);
      const waitLabel = waitMs >= 60000 ? `${Math.ceil(waitMs / 60000)}m` : `${Math.round(waitMs / 1000)}s`;
      state.spotify.lastError = `Rate limited by Spotify — retrying in ${waitLabel}`;
      console.error(`[Spotify] 429 rate limited — backing off ${waitLabel}`);
    } else {
      console.error('[Spotify] poll failed:', e.message);
      state.spotify.lastError = e.message;
    }
  }
}

// ---------------- YouTube title parsing ----------------

function parseYoutubeTitle(rawTitle) {
  let t = rawTitle
    .replace(/\((?:official\s*)?(?:lyric|audio|video|visualizer|music\s*video|mv|hd|4k)[^)]*\)/gi, '')
    .replace(/\[(?:official\s*)?(?:lyric|audio|video|visualizer|music\s*video|mv|hd|4k)[^\]]*\]/gi, '')
    .replace(/\|.*$/, '')
    .trim();

  const sepMatch = t.match(/^(.*?)\s*[-–—]\s*(.+)$/);
  if (sepMatch) {
    return { artist: sepMatch[1].trim(), track: sepMatch[2].trim() };
  }
  return { artist: '', track: t };
}

// ---------------- Source arbitration + lyrics loading ----------------

function getActiveSource() {
  const yt = state.youtube.lastMessage;
  const ytFresh = yt && Date.now() - yt.receivedAtMs < 2500;
  if (ytFresh && !yt.paused) {
    return 'youtube';
  }
  const sp = state.spotify.lastPoll;
  if (sp && sp.isPlaying) {
    return 'spotify';
  }
  if (ytFresh) return 'youtube'; // paused YouTube, still show it
  if (sp) return 'spotify'; // paused Spotify
  return null;
}

function getNowPlayingInfo(source) {
  if (source === 'youtube') {
    const yt = state.youtube.lastMessage;
    const { artist, track } = parseYoutubeTitle(yt.title || '');
    const elapsedSinceMsg = yt.paused ? 0 : Date.now() - yt.receivedAtMs;
    const positionMs = Math.max(0, (yt.currentTime || 0) * 1000 + elapsedSinceMsg);
    return {
      trackKey: `yt:${track}|${artist}`,
      trackName: track,
      artistName: artist,
      durationSec: yt.duration || null,
      positionMs,
      isPlaying: !yt.paused,
    };
  }
  if (source === 'spotify') {
    const sp = state.spotify.lastPoll;
    const elapsedSinceFetch = sp.isPlaying ? Date.now() - sp.fetchedAtMs : 0;
    const positionMs = Math.min(sp.durationMs, sp.progressMs + elapsedSinceFetch);
    return {
      trackKey: `sp:${sp.trackId}`,
      trackName: sp.trackName,
      artistName: sp.artistName,
      durationSec: sp.durationMs / 1000,
      positionMs,
      isPlaying: sp.isPlaying,
    };
  }
  return null;
}

async function ensureLyricsLoaded(info) {
  if (!info) return;
  if (state.lyrics.trackKey === info.trackKey) return; // already loaded/loading for this track
  state.lyrics.trackKey = info.trackKey;
  state.lyrics.loading = true;
  state.lyrics.lines = [];
  state.lyrics.instrumental = false;
  state.lyrics.notFound = false;

  try {
    const result = await lyricsApi.fetchLyrics(info.trackName, info.artistName, info.durationSec);
    if (state.lyrics.trackKey !== info.trackKey) return; // track changed while fetching
    if (!result) {
      state.lyrics.notFound = true;
    } else if (result.instrumental) {
      state.lyrics.instrumental = true;
    } else {
      state.lyrics.lines = result.lines;
      state.lyrics.notFound = result.lines.length === 0;
    }
  } catch (e) {
    state.lyrics.notFound = true;
  } finally {
    state.lyrics.loading = false;
  }
}

function findActiveIndex(lines, positionMs) {
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

// ---------------- Main tick loop ----------------

function tick() {
  const source = getActiveSource();
  if (!source) {
    let reason = null;
    if (!cfg.spotifyRefreshToken) {
      reason = 'Spotify not connected (and no YouTube tab detected)';
    } else if (state.spotify.lastError) {
      reason = `Spotify error: ${state.spotify.lastError}`;
    }
    sendToRenderer({ status: 'idle', reason });
    return;
  }

  const info = getNowPlayingInfo(source);
  ensureLyricsLoaded(info); // fire and forget; updates state asynchronously

  if (state.lyrics.loading && state.lyrics.trackKey === info.trackKey) {
    sendToRenderer({ status: 'loading', trackName: info.trackName, artistName: info.artistName, source });
    return;
  }
  if (state.lyrics.instrumental && state.lyrics.trackKey === info.trackKey) {
    sendToRenderer({ status: 'instrumental', trackName: info.trackName, artistName: info.artistName, source });
    return;
  }
  if (state.lyrics.notFound && state.lyrics.trackKey === info.trackKey) {
    sendToRenderer({ status: 'not-found', trackName: info.trackName, artistName: info.artistName, source });
    return;
  }
  if (state.lyrics.trackKey !== info.trackKey) {
    // stale frame while a new track is being resolved
    sendToRenderer({ status: 'loading', trackName: info.trackName, artistName: info.artistName, source });
    return;
  }

  const lines = state.lyrics.lines;
  const activeIndex = findActiveIndex(lines, info.positionMs);

  let progress = 0;
  if (activeIndex >= 0) {
    const start = lines[activeIndex].timeMs;
    const end = activeIndex + 1 < lines.length ? lines[activeIndex + 1].timeMs : start + 4000;
    progress = Math.min(1, Math.max(0, (info.positionMs - start) / Math.max(1, end - start)));
  }

  sendToRenderer({
    status: 'playing',
    source,
    trackName: info.trackName,
    artistName: info.artistName,
    isPlaying: info.isPlaying,
    lines,
    activeIndex,
    progress,
  });
}

function sendToRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('now-playing', payload);
  }
}

// ---------------- IPC ----------------

function registerIpc() {
  ipcMain.handle('get-settings', () => cfg);

  ipcMain.handle('set-settings', (event, partial) => {
    cfg = { ...cfg, ...partial };
    config.save(cfg);
    return cfg;
  });

  ipcMain.handle('spotify-connect', async (event, clientId) => {
    cfg.spotifyClientId = clientId;
    config.save(cfg);
    try {
      const tokens = await spotify.startLogin(clientId);
      cfg.spotifyRefreshToken = tokens.refresh_token;
      config.save(cfg);
      state.spotify.accessToken = tokens.access_token;
      state.spotify.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
      state.spotify.connected = true;
      state.spotify.lastError = null;
      return { ok: true };
    } catch (e) {
      state.spotify.lastError = e.message;
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('spotify-disconnect', () => {
    cfg.spotifyRefreshToken = null;
    config.save(cfg);
    state.spotify.accessToken = null;
    state.spotify.connected = false;
    state.spotify.lastPoll = null;
    return { ok: true };
  });

  ipcMain.handle('get-spotify-status', () => ({
    connected: state.spotify.connected,
    error: state.spotify.lastError,
  }));

  ipcMain.handle('toggle-click-through', () => {
    clickThroughEnabled = !clickThroughEnabled;
    mainWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
    return clickThroughEnabled;
  });

  ipcMain.handle('quit-app', () => {
    app.quit();
  });
}

// ---------------- App lifecycle ----------------

app.whenReady().then(() => {
  cfg = config.load();
  state.spotify.rateLimitedUntil = cfg.spotifyRateLimitedUntil || 0;
  createWindow();
  registerIpc();
  startBridgeServer();

  setInterval(pollSpotify, 2000);
  setInterval(tick, 200);

  globalShortcut.register('CommandOrControl+Alt+L', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
  globalShortcut.register('CommandOrControl+Alt+K', () => {
    clickThroughEnabled = !clickThroughEnabled;
    mainWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
  });
  globalShortcut.register('CommandOrControl+Alt+Q', () => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
