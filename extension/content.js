// Browser Use Recorder - Content Script
// Captures all user interactions on web pages

(function () {
  'use strict';

  let isRecording = false;
  let ws = null;
  let eventQueue = [];

  // Generate a robust CSS selector for an element
  function getSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
    if (el.getAttribute('name')) return `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
    if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
    if (el.getAttribute('placeholder')) return `[placeholder="${el.getAttribute('placeholder')}"]`;

    // Build path from tag + classes + nth-child
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c && !c.startsWith('_'));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).map(CSS.escape).join('.');
        }
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // Get element text content (truncated)
  function getElementText(el) {
    const text = (el.textContent || el.innerText || '').trim();
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  }

  // Get element metadata
  function getElementInfo(el) {
    return {
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      selector: getSelector(el),
      text: getElementText(el),
      value: el.value || null,
      href: el.href || null,
      placeholder: el.placeholder || null,
      ariaLabel: el.getAttribute('aria-label'),
      name: el.name || null,
      id: el.id || null,
      className: el.className || null,
      rect: el.getBoundingClientRect().toJSON(),
    };
  }

  // Send event to recorder server
  function sendEvent(event) {
    if (!isRecording) return;
    const payload = {
      ...event,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      eventQueue.push(payload);
    }
  }

  // Flush queued events
  function flushQueue() {
    while (eventQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(eventQueue.shift()));
    }
  }

  // Connect to recorder server
  function connectWS() {
    try {
      ws = new WebSocket('ws://localhost:3456');
      ws.onopen = () => {
        console.log('[BrowserRecorder] Connected to server');
        flushQueue();
      };
      ws.onclose = () => {
        console.log('[BrowserRecorder] Disconnected, retrying in 2s...');
        setTimeout(connectWS, 2000);
      };
      ws.onerror = () => {};
    } catch (e) {
      setTimeout(connectWS, 2000);
    }
  }

  // --- Event Listeners ---

  // Click events
  document.addEventListener('click', (e) => {
    const el = e.target;
    sendEvent({
      type: 'click',
      element: getElementInfo(el),
      x: e.clientX,
      y: e.clientY,
      button: e.button,
    });
  }, true);

  // Double click
  document.addEventListener('dblclick', (e) => {
    sendEvent({
      type: 'dblclick',
      element: getElementInfo(e.target),
      x: e.clientX,
      y: e.clientY,
    });
  }, true);

  // Input/change events (form fills)
  const inputDebounce = new Map();
  document.addEventListener('input', (e) => {
    const el = e.target;
    const key = getSelector(el);
    clearTimeout(inputDebounce.get(key));
    inputDebounce.set(key, setTimeout(() => {
      sendEvent({
        type: 'input',
        element: getElementInfo(el),
        inputValue: el.value,
        inputType: el.type,
      });
      inputDebounce.delete(key);
    }, 500));
  }, true);

  // Select/dropdown changes
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.tagName === 'SELECT') {
      sendEvent({
        type: 'select',
        element: getElementInfo(el),
        selectedValue: el.value,
        selectedText: el.options[el.selectedIndex]?.text,
      });
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      sendEvent({
        type: 'check',
        element: getElementInfo(el),
        checked: el.checked,
      });
    }
  }, true);

  // Form submissions
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const formData = {};
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.name) {
        formData[input.name] = input.value;
      }
    });
    sendEvent({
      type: 'submit',
      element: getElementInfo(form),
      formData,
    });
  }, true);

  // Keyboard events (Enter, Escape, Tab)
  document.addEventListener('keydown', (e) => {
    if (['Enter', 'Escape', 'Tab'].includes(e.key)) {
      sendEvent({
        type: 'keydown',
        element: getElementInfo(e.target),
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    }
  }, true);

  // Scroll events (debounced)
  let scrollTimeout;
  document.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      sendEvent({
        type: 'scroll',
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      });
    }, 300);
  }, true);

  // Navigation events
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    sendEvent({
      type: 'navigation',
      navigationType: 'pushState',
      url: window.location.href,
    });
  };

  window.addEventListener('popstate', () => {
    sendEvent({
      type: 'navigation',
      navigationType: 'popstate',
      url: window.location.href,
    });
  });

  window.addEventListener('hashchange', () => {
    sendEvent({
      type: 'navigation',
      navigationType: 'hashchange',
      url: window.location.href,
    });
  });

  // Page load
  window.addEventListener('load', () => {
    sendEvent({
      type: 'pageload',
      url: window.location.href,
      title: document.title,
    });
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'startRecording') {
      isRecording = true;
      connectWS();
      sendResponse({ status: 'recording' });
    } else if (msg.action === 'stopRecording') {
      isRecording = false;
      if (ws) ws.close();
      sendResponse({ status: 'stopped' });
    } else if (msg.action === 'getStatus') {
      sendResponse({ isRecording });
    } else if (msg.action === 'addDecisionPoint') {
      sendEvent({
        type: 'ai_decision',
        condition: msg.condition,
        ifTrue: msg.ifTrue,
        ifFalse: msg.ifFalse,
        targetSelector: msg.targetSelector,
        description: msg.description,
      });
      sendResponse({ status: 'added' });
    }
    return true;
  });
})();
