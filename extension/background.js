// Background service worker
let eventCount = 0;
let isRecording = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startRecording') {
    isRecording = true;
    eventCount = 0;
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
    sendResponse({ status: 'ok' });
  } else if (msg.action === 'stopRecording') {
    isRecording = false;
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ status: 'ok', eventCount });
  } else if (msg.action === 'getEventCount') {
    sendResponse({ count: eventCount });
  } else if (msg.action === 'incrementCount') {
    eventCount++;
    sendResponse({ count: eventCount });
  }
  return true;
});
