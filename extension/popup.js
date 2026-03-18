/**
 * ContextBridge Popup Script
 */

const API_URL = 'http://localhost:3030';

let isEnabled = true;
let isConnected = false;

async function checkConnection() {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchStats() {
  try {
    const response = await fetch(`${API_URL}/stats`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    return null;
  }
  return null;
}

function updateUI() {
  const dot = document.getElementById('statusDot');
  const label = document.getElementById('statusLabel');
  const toggle = document.getElementById('toggle');
  
  if (!isEnabled) {
    dot.className = 'status-dot disabled';
    label.textContent = 'Disabled';
    toggle.classList.remove('active');
  } else if (!isConnected) {
    dot.className = 'status-dot disconnected';
    label.textContent = 'App not running';
    toggle.classList.add('active');
  } else {
    dot.className = 'status-dot connected';
    label.textContent = 'Connected';
    toggle.classList.add('active');
  }
}

async function init() {
  // Load settings
  const settings = await chrome.storage.local.get(['enabled']);
  isEnabled = settings.enabled !== false;
  
  // Check connection
  isConnected = await checkConnection();
  
  // Update UI
  updateUI();
  
  // Fetch and display stats
  if (isConnected) {
    const stats = await fetchStats();
    if (stats) {
      document.getElementById('memoryCount').textContent = stats.total_memories || 0;
      document.getElementById('todayCount').textContent = stats.memories_today || 0;
    }
  }
  
  // Toggle handler
  document.getElementById('toggle').addEventListener('click', async () => {
    isEnabled = !isEnabled;
    await chrome.storage.local.set({ enabled: isEnabled });
    updateUI();
    
    // Notify content scripts
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle', enabled: isEnabled }).catch(() => {});
    }
  });
  
  // Open app button
  document.getElementById('openApp').addEventListener('click', () => {
    // Try to open the Tauri app via custom protocol
    window.open('goldfish://', '_blank');
  });
}

document.addEventListener('DOMContentLoaded', init);
