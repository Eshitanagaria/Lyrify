const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('set-settings', partial),
  connectSpotify: (clientId) => ipcRenderer.invoke('spotify-connect', clientId),
  disconnectSpotify: () => ipcRenderer.invoke('spotify-disconnect'),
  getSpotifyStatus: () => ipcRenderer.invoke('get-spotify-status'),
  toggleClickThrough: () => ipcRenderer.invoke('toggle-click-through'),
  onNowPlaying: (cb) => ipcRenderer.on('now-playing', (event, data) => cb(data)),
});
