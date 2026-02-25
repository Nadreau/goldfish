# ContextBridge Browser Extension

**Your AI remembers everything. Type naturally, context flows automatically.**

This extension connects Claude.ai and ChatGPT to your ContextBridge memory. When you type a message that references past work, projects, or context, the extension automatically pulls relevant memories and injects them into your prompt.

## How It Works

1. **You type naturally:** "Help me with that project" or "Remember what we discussed about the patent?"
2. **Extension detects context needs:** Analyzes your message for references to past work
3. **Memories are retrieved:** Queries your ContextBridge database for relevant memories
4. **Context is injected:** Before sending, relevant context is added to your message
5. **AI just knows:** The AI responds as if it remembers everything

## Installation

### Prerequisites

1. **ContextBridge app** must be running with memories captured
2. **Extension API server** must be running on `localhost:3030`

### Start the API Server

```bash
cd extension-server
npm install
npm start
```

### Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder
5. Pin the extension for easy access

### Load Extension in Firefox

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `extension/manifest.json`

## Usage

Once installed, you'll see a small status indicator on Claude.ai and ChatGPT:

- 🟢 **Green** = Connected to ContextBridge (memories available)
- 🟡 **Yellow** = App not running (start ContextBridge)
- ⚫ **Gray** = Extension disabled (click to enable)

### Trigger Phrases

The extension activates when you mention:
- "that project", "the project", "my project"
- "earlier", "before", "yesterday", "today"
- "remember when", "we talked about"
- "the thing", "that thing", "working on"
- "help me with", "continue", "pick up where"
- Specific project names (e.g., "bluon", "contextbridge", "patent")

### Manual Context Injection

Click the extension icon to:
- See your memory count
- Toggle context injection on/off
- Open the ContextBridge app

## Privacy

- **All data stays local** — nothing is sent to external servers
- Memories are only injected into your prompts, not collected
- You can disable the extension at any time

## Troubleshooting

### "Disconnected" Status

1. Make sure ContextBridge app is running
2. Make sure the API server is running (`npm start` in extension-server)
3. Check if `http://localhost:3030/health` returns OK

### No Context Being Injected

1. Try using explicit trigger phrases
2. Check that you have relevant memories in ContextBridge
3. Make sure the extension is enabled (green indicator)

### Extension Not Loading

1. Check Chrome/Firefox console for errors
2. Make sure manifest.json is valid
3. Reload the extension

## Development

### Structure

```
extension/
├── manifest.json      # Extension configuration
├── content.js         # Injected into AI sites
├── background.js      # Service worker
├── popup.html/js      # Extension popup UI
├── styles.css         # Injected styles
└── icons/             # Extension icons
```

### Testing

1. Load extension as unpacked
2. Open Claude.ai or ChatGPT
3. Check browser console for `[ContextBridge]` logs
4. Try typing a message with trigger phrases

## License

MIT License — ContextBridge
