let settings = null;
let lastPayload = null;
let renderedSlotCount = 0;

const lyricsContainer = document.getElementById('lyrics-container');
const nowPlayingLabel = document.getElementById('now-playing-label');
const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('settings-btn');

function applyCssVars(s) {
  const root = document.documentElement;
  root.style.setProperty('--bg-opacity', s.opacity);
  root.style.setProperty('--bg-blur', s.blur + 'px');
  root.style.setProperty('--font-size', s.fontSize + 'px');
}

function buildSlots(count) {
  lyricsContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    div.className = 'line empty';
    lyricsContainer.appendChild(div);
  }
  renderedSlotCount = count;
}

function renderMessage(text) {
  lyricsContainer.innerHTML = `<div class="status-message">${escapeHtml(text)}</div>`;
  renderedSlotCount = 0;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPlaying(payload) {
  const count = settings.lineCount;
  if (renderedSlotCount !== count) buildSlots(count);

  const center = Math.floor(count / 2);
  const slots = lyricsContainer.children;

  for (let i = 0; i < count; i++) {
    const lineIndex = payload.activeIndex - center + i;
    const slot = slots[i];
    const line = payload.lines[lineIndex];

    if (!line) {
      slot.className = 'line empty';
      slot.innerHTML = '';
      continue;
    }

    const isActive = lineIndex === payload.activeIndex;
    const distance = Math.abs(i - center);
    const fade = Math.max(0.22, 1 - distance * 0.18);

    if (isActive) {
      slot.className = 'line active';
      slot.style.opacity = 1;
      slot.innerHTML =
        `<span class="line-base">${escapeHtml(line.text || '\u00A0')}</span>` +
        `<span class="line-fill">${escapeHtml(line.text || '\u00A0')}</span>`;
      slot.style.setProperty('--progress', Math.round(payload.progress * 100) + '%');
    } else {
      slot.className = 'line';
      slot.style.opacity = fade;
      slot.textContent = line.text || '\u00A0';
    }
  }
}

function handleNowPlaying(payload) {
  lastPayload = payload;

  if (settings.showTrackInfo && payload.trackName) {
    nowPlayingLabel.textContent = `${payload.trackName} — ${payload.artistName}`;
  } else {
    nowPlayingLabel.textContent = '';
  }

  switch (payload.status) {
    case 'idle':
      renderMessage('Nothing playing');
      break;
    case 'loading':
      renderMessage('Finding lyrics…');
      break;
    case 'instrumental':
      renderMessage('Instrumental track — no lyrics');
      break;
    case 'not-found':
      renderMessage('No synced lyrics found for this track');
      break;
    case 'playing':
      renderPlaying(payload);
      break;
  }
}

// ---------------- Settings panel ----------------

function fillSettingsForm(s) {
  document.getElementById('lineCount').value = s.lineCount;
  document.getElementById('lineCountVal').textContent = s.lineCount;
  document.getElementById('opacity').value = s.opacity;
  document.getElementById('opacityVal').textContent = Math.round(s.opacity * 100) + '%';
  document.getElementById('blur').value = s.blur;
  document.getElementById('blurVal').textContent = s.blur + 'px';
  document.getElementById('fontSize').value = s.fontSize;
  document.getElementById('fontSizeVal').textContent = s.fontSize + 'px';
  document.getElementById('showTrackInfo').checked = s.showTrackInfo;
  document.getElementById('spotifyClientId').value = s.spotifyClientId || '';
}

function wireSettingsForm() {
  const lineCount = document.getElementById('lineCount');
  const opacity = document.getElementById('opacity');
  const blur = document.getElementById('blur');
  const fontSize = document.getElementById('fontSize');
  const showTrackInfo = document.getElementById('showTrackInfo');
  const spotifyClientId = document.getElementById('spotifyClientId');

  lineCount.addEventListener('input', async () => {
    document.getElementById('lineCountVal').textContent = lineCount.value;
    settings = await window.api.setSettings({ lineCount: parseInt(lineCount.value, 10) });
    buildSlots(settings.lineCount);
  });

  opacity.addEventListener('input', async () => {
    document.getElementById('opacityVal').textContent = Math.round(opacity.value * 100) + '%';
    settings = await window.api.setSettings({ opacity: parseFloat(opacity.value) });
    applyCssVars(settings);
  });

  blur.addEventListener('input', async () => {
    document.getElementById('blurVal').textContent = blur.value + 'px';
    settings = await window.api.setSettings({ blur: parseInt(blur.value, 10) });
    applyCssVars(settings);
  });

  fontSize.addEventListener('input', async () => {
    document.getElementById('fontSizeVal').textContent = fontSize.value + 'px';
    settings = await window.api.setSettings({ fontSize: parseInt(fontSize.value, 10) });
    applyCssVars(settings);
  });

  showTrackInfo.addEventListener('change', async () => {
    settings = await window.api.setSettings({ showTrackInfo: showTrackInfo.checked });
  });

  document.getElementById('spotifyConnectBtn').addEventListener('click', async () => {
    const status = document.getElementById('spotifyStatus');
    status.textContent = 'Opening browser…';
    const res = await window.api.connectSpotify(spotifyClientId.value.trim());
    status.textContent = res.ok ? 'Connected ✅' : 'Failed: ' + res.error;
  });

  document.getElementById('spotifyDisconnectBtn').addEventListener('click', async () => {
    await window.api.disconnectSpotify();
    document.getElementById('spotifyStatus').textContent = 'Disconnected';
  });

  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });
}

async function init() {
  settings = await window.api.getSettings();
  applyCssVars(settings);
  fillSettingsForm(settings);
  wireSettingsForm();
  buildSlots(settings.lineCount);

  const spStatus = await window.api.getSpotifyStatus();
  document.getElementById('spotifyStatus').textContent = spStatus.connected ? 'Connected ✅' : '';

  window.api.onNowPlaying(handleNowPlaying);
}

init();
