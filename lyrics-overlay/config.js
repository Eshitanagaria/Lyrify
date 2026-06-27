const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  lineCount: 5,
  opacity: 0.35,       // background opacity 0-0.8
  blur: 14,            // backdrop blur in px
  fontSize: 22,
  showTrackInfo: true,
  textColor: '#ffffff',
  accentColor: '#1ed760',
  spotifyClientId: '',
  spotifyRefreshToken: null,
  spotifyRateLimitedUntil: 0,
};

function configPath() {
  return path.join(app.getPath('userData'), 'lyrics-overlay-config.json');
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

module.exports = { load, save, DEFAULTS };
