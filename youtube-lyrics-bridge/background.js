let ws = null;

function connect() {
  try {
    ws = new WebSocket('ws://127.0.0.1:8765');
    ws.onclose = () => {
      ws = null;
    };
    ws.onerror = () => {
      ws = null;
    };
  } catch {
    ws = null;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    connect();
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else if (ws) {
    // socket still connecting; attach a one-time send once open
    ws.addEventListener('open', () => ws.send(JSON.stringify(msg)), { once: true });
  }
});

// Keep the service worker alive a bit longer so the websocket survives
// brief idle periods between messages.
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
  if (!ws || ws.readyState === WebSocket.CLOSED) connect();
});
