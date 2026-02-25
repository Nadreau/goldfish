/**
 * ContextBridge Content Script
 * 
 * The magic: You type short, AI knows everything.
 * 
 * How it works:
 * 1. Watches for message input on AI sites (Claude, ChatGPT)
 * 2. When you type, analyzes for project references or context needs
 * 3. Before send, queries ContextBridge for relevant memories
 * 4. Injects context seamlessly - AI just... knows
 */

console.log('[ContextBridge] 🌉 Extension loaded');

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // ContextBridge local API
  apiUrl: 'http://localhost:3030',
  
  // How many recent memories to consider
  memoryLimit: 50,
  
  // Max characters of context to inject
  maxContextChars: 2000,
  
  // Keywords that trigger context injection
  contextTriggers: [
    'that project', 'the project', 'my project',
    'earlier', 'before', 'yesterday', 'today',
    'remember when', 'we talked about', 'you know',
    'the thing', 'that thing', 'working on',
    'help me with', 'continue', 'pick up where',
    'bluon', 'contextbridge', 'patent', // Niko's projects
  ],
  
  // Site-specific selectors
  sites: {
    'claude.ai': {
      inputSelector: '[contenteditable="true"]',
      submitSelector: 'button[aria-label="Send Message"], button[type="submit"]',
      messageContainer: '.prose',
    },
    'chat.openai.com': {
      inputSelector: '#prompt-textarea',
      submitSelector: 'button[data-testid="send-button"]',
      messageContainer: '.markdown',
    },
    'chatgpt.com': {
      inputSelector: '#prompt-textarea',
      submitSelector: 'button[data-testid="send-button"]',
      messageContainer: '.markdown',
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════════

let isConnected = false;
let isEnabled = true;
let lastInput = '';
let memories = [];
let statusIndicator = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Site Detection
// ═══════════════════════════════════════════════════════════════════════════════

function getCurrentSite() {
  const host = window.location.hostname;
  for (const [site, config] of Object.entries(CONFIG.sites)) {
    if (host.includes(site.replace('www.', ''))) {
      return { name: site, ...config };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ContextBridge API
// ═══════════════════════════════════════════════════════════════════════════════

async function checkConnection() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    isConnected = response.ok;
    updateStatusIndicator();
    return isConnected;
  } catch (e) {
    isConnected = false;
    updateStatusIndicator();
    return false;
  }
}

async function fetchMemories(limit = CONFIG.memoryLimit) {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/memories?limit=${limit}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (response.ok) {
      memories = await response.json();
      return memories;
    }
  } catch (e) {
    console.log('[ContextBridge] Could not fetch memories:', e);
  }
  return [];
}

async function searchMemories(query) {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/search?q=${encodeURIComponent(query)}&limit=10`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('[ContextBridge] Search failed:', e);
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Intelligence
// ═══════════════════════════════════════════════════════════════════════════════

function needsContext(text) {
  const lower = text.toLowerCase();
  
  // Check for trigger phrases
  for (const trigger of CONFIG.contextTriggers) {
    if (lower.includes(trigger)) {
      return { needed: true, reason: 'trigger', trigger };
    }
  }
  
  // Check for very short messages that seem to assume context
  if (text.length < 50 && (
    lower.includes('?') || 
    lower.startsWith('what') ||
    lower.startsWith('how') ||
    lower.startsWith('can you') ||
    lower.startsWith('help')
  )) {
    return { needed: true, reason: 'short_query' };
  }
  
  // Check for project/task references
  if (/\b(the|my|this|that)\s+(project|task|thing|issue|bug|feature|idea)\b/i.test(text)) {
    return { needed: true, reason: 'project_reference' };
  }
  
  return { needed: false };
}

function extractKeywords(text) {
  // Extract meaningful words for search
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'about', 'with',
    'help', 'me', 'my', 'please', 'thanks', 'thank'
  ]);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  return [...new Set(words)];
}

function findRelevantMemories(text, allMemories) {
  const keywords = extractKeywords(text);
  if (keywords.length === 0) return [];
  
  // Score each memory by keyword matches
  const scored = allMemories.map(memory => {
    const content = memory.content.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        score += 1;
        // Bonus for app name matches
        if (memory.source_app?.toLowerCase().includes(keyword)) {
          score += 2;
        }
      }
    }
    
    // Recency bonus (memories from today score higher)
    const memoryDate = new Date(memory.timestamp);
    const now = new Date();
    const hoursSince = (now - memoryDate) / (1000 * 60 * 60);
    if (hoursSince < 1) score += 3;
    else if (hoursSince < 24) score += 2;
    else if (hoursSince < 72) score += 1;
    
    return { memory, score };
  });
  
  // Return top matches
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.memory);
}

function buildContextBlock(memories) {
  if (memories.length === 0) return '';
  
  let context = '\n\n---\n📚 **Context from your recent work:**\n';
  
  for (const memory of memories) {
    const time = new Date(memory.timestamp).toLocaleString();
    const app = memory.source_app || 'Unknown';
    const preview = memory.content.slice(0, 300).replace(/\n+/g, ' ');
    context += `\n• [${app} @ ${time}]\n  ${preview}${memory.content.length > 300 ? '...' : ''}\n`;
  }
  
  context += '\n---\n\n';
  
  // Trim if too long
  if (context.length > CONFIG.maxContextChars) {
    context = context.slice(0, CONFIG.maxContextChars) + '\n...(truncated)\n---\n\n';
  }
  
  return context;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI Components
// ═══════════════════════════════════════════════════════════════════════════════

function createStatusIndicator() {
  // Remove existing if any
  if (statusIndicator) {
    statusIndicator.remove();
  }
  
  statusIndicator = document.createElement('div');
  statusIndicator.id = 'contextbridge-status';
  statusIndicator.innerHTML = `
    <div class="cb-indicator">
      <div class="cb-dot"></div>
      <span class="cb-text">ContextBridge</span>
      <span class="cb-status"></span>
    </div>
  `;
  
  document.body.appendChild(statusIndicator);
  updateStatusIndicator();
  
  // Click to toggle
  statusIndicator.addEventListener('click', () => {
    isEnabled = !isEnabled;
    chrome.storage.local.set({ enabled: isEnabled });
    updateStatusIndicator();
  });
}

function updateStatusIndicator() {
  if (!statusIndicator) return;
  
  const dot = statusIndicator.querySelector('.cb-dot');
  const status = statusIndicator.querySelector('.cb-status');
  
  if (!isEnabled) {
    dot.className = 'cb-dot cb-disabled';
    status.textContent = 'Off';
  } else if (!isConnected) {
    dot.className = 'cb-dot cb-disconnected';
    status.textContent = 'Disconnected';
  } else {
    dot.className = 'cb-dot cb-connected';
    status.textContent = `${memories.length} memories`;
  }
}

function showContextInjected(count) {
  const toast = document.createElement('div');
  toast.className = 'cb-toast';
  toast.innerHTML = `
    <span>🌉 Injected context from ${count} memories</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('cb-toast-fade');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input Interception
// ═══════════════════════════════════════════════════════════════════════════════

function setupInputWatcher(site) {
  // Watch for input changes
  const observer = new MutationObserver(() => {
    const input = document.querySelector(site.inputSelector);
    if (input && !input.dataset.cbWatched) {
      input.dataset.cbWatched = 'true';
      
      // Intercept form submission
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          await handleBeforeSend(input, site);
        }
      });
      
      console.log('[ContextBridge] Input watcher attached');
    }
    
    // Also watch submit button
    const submit = document.querySelector(site.submitSelector);
    if (submit && !submit.dataset.cbWatched) {
      submit.dataset.cbWatched = 'true';
      submit.addEventListener('click', async (e) => {
        const input = document.querySelector(site.inputSelector);
        if (input) {
          await handleBeforeSend(input, site);
        }
      }, true);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function handleBeforeSend(input, site) {
  if (!isEnabled || !isConnected) return;
  
  const text = input.innerText || input.value || '';
  if (!text.trim()) return;
  
  const analysis = needsContext(text);
  if (!analysis.needed) return;
  
  console.log('[ContextBridge] Context needed:', analysis);
  
  // Find relevant memories
  const relevant = findRelevantMemories(text, memories);
  if (relevant.length === 0) {
    // Try search API as fallback
    const keywords = extractKeywords(text);
    if (keywords.length > 0) {
      const searchResults = await searchMemories(keywords.join(' '));
      if (searchResults.length > 0) {
        relevant.push(...searchResults.slice(0, 3));
      }
    }
  }
  
  if (relevant.length === 0) return;
  
  // Build and inject context
  const contextBlock = buildContextBlock(relevant);
  
  // Prepend context to the message
  if (input.contentEditable === 'true') {
    // For contenteditable (Claude)
    input.innerHTML = contextBlock.replace(/\n/g, '<br>') + input.innerHTML;
  } else {
    // For textarea (ChatGPT)
    input.value = contextBlock + input.value;
  }
  
  // Dispatch input event so the site recognizes the change
  input.dispatchEvent(new Event('input', { bubbles: true }));
  
  showContextInjected(relevant.length);
  console.log('[ContextBridge] Injected context from', relevant.length, 'memories');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  const site = getCurrentSite();
  if (!site) {
    console.log('[ContextBridge] Not on a supported site');
    return;
  }
  
  console.log('[ContextBridge] Detected site:', site.name);
  
  // Load settings
  const settings = await chrome.storage.local.get(['enabled']);
  isEnabled = settings.enabled !== false;
  
  // Check connection and load memories
  await checkConnection();
  if (isConnected) {
    await fetchMemories();
  }
  
  // Create UI
  createStatusIndicator();
  
  // Setup watchers
  setupInputWatcher(site);
  
  // Periodic refresh
  setInterval(async () => {
    await checkConnection();
    if (isConnected) {
      await fetchMemories();
      updateStatusIndicator();
    }
  }, 30000);
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
