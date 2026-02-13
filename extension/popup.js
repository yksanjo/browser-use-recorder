// Popup controller
const btnRecord = document.getElementById('btnRecord');
const btnStop = document.getElementById('btnStop');
const btnDecision = document.getElementById('btnDecision');
const decisionForm = document.getElementById('decisionForm');
const btnAddDecision = document.getElementById('btnAddDecision');
const statusEl = document.getElementById('status');
const eventCountEl = document.getElementById('eventCount');

let isRecording = false;
let eventCount = 0;

// Poll event count from background
setInterval(async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getEventCount' });
  if (response) {
    eventCountEl.textContent = response.count || 0;
  }
}, 1000);

// Check initial status
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
    if (response && response.isRecording) {
      setRecordingUI(true);
    }
  });
});

btnRecord.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'startRecording' }, (response) => {
      if (response && response.status === 'recording') {
        setRecordingUI(true);
        chrome.runtime.sendMessage({ action: 'startRecording' });
      }
    });
  });
});

btnStop.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRecording' }, (response) => {
      if (response && response.status === 'stopped') {
        setRecordingUI(false);
        chrome.runtime.sendMessage({ action: 'stopRecording' });
      }
    });
  });
});

btnDecision.addEventListener('click', () => {
  decisionForm.classList.toggle('show');
});

btnAddDecision.addEventListener('click', () => {
  const condition = document.getElementById('condition').value;
  const ifTrue = document.getElementById('ifTrue').value;
  const ifFalse = document.getElementById('ifFalse').value;
  const targetSelector = document.getElementById('targetSelector').value;
  const description = document.getElementById('description').value;

  if (!condition) {
    alert('Please enter a condition');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'addDecisionPoint',
      condition,
      ifTrue,
      ifFalse,
      targetSelector,
      description,
    }, () => {
      // Clear form
      document.getElementById('condition').value = '';
      document.getElementById('ifTrue').value = '';
      document.getElementById('ifFalse').value = '';
      document.getElementById('targetSelector').value = '';
      document.getElementById('description').value = '';
      decisionForm.classList.remove('show');
    });
  });
});

function setRecordingUI(recording) {
  isRecording = recording;
  btnRecord.disabled = recording;
  btnStop.disabled = !recording;
  btnDecision.disabled = !recording;
  
  if (recording) {
    statusEl.className = 'status recording';
    statusEl.innerHTML = 'Status: <strong>Recording</strong> — Capturing interactions...';
  } else {
    statusEl.className = 'status idle';
    statusEl.innerHTML = 'Status: <strong>Idle</strong> — Ready to record';
    decisionForm.classList.remove('show');
  }
}
