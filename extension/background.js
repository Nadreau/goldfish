/**
 * ContextBridge Background Service Worker
 * Handles cross-tab communication and persistent state
 */

const API_URL = 'http://localhost:3030';

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkConnection') {
    fetch(`${API_URL}/health`)
      .then(r => r.ok)
      .then(connected => sendResponse({ connected }))
      .catch(() => sendResponse({ connected: false }));
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'fetchMemories') {
    fetch(`${API_URL}/memories?limit=${message.limit || 50}`)
      .then(r => r.json())
      .then(memories => sendResponse({ memories }))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }
  
  if (message.type === 'searchMemories') {
    fetch(`${API_URL}/search?q=${encodeURIComponent(message.query)}&limit=${message.limit || 10}`)
      .then(r => r.json())
      .then(memories => sendResponse({ memories }))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }
});

// Badge update on connection status
async function updateBadge() {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (response.ok) {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setBadgeBackgroundColor({ color: '#34d399' });
    } else {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  } catch {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }
}

// Check connection periodically
setInterval(updateBadge, 30000);
updateBadge();

console.log('[ContextBridge] Background service worker started');
