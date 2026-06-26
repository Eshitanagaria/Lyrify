function getVideoInfo() {
  const video = document.querySelector('video');
  if (!video || !isFinite(video.duration)) return null;

  const titleEl =
    document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
    document.querySelector('#title h1');
  const rawTitle = titleEl
    ? titleEl.textContent.trim()
    : document.title.replace(/\s*-\s*YouTube$/, '');

  return {
    type: 'youtube',
    title: rawTitle,
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    url: location.href,
  };
}

setInterval(() => {
  const info = getVideoInfo();
  if (info) {
    chrome.runtime.sendMessage(info).catch(() => {});
  }
}, 500);
