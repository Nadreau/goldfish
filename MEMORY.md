# ContextBridge — Project Memory

## What This Is
Universal AI memory system that captures screen context and makes it available to any AI.
**Patent filed:** 38 pages, focuses on privacy-first cross-OS memory.

## Architecture
- **Tauri app** (Rust backend + React frontend)
- Screen recording via macOS `screencapture -V`
- Recordings stored in `~/.contextbridge/recordings/`
- MCP server for AI access to memories

## What's Built

### ✅ Core App
- Screen recording: start/stop/status/list commands in Rust
- Recording section in Privacy Controls UI
- Live duration counter, red pulsing indicator when active
- Recent recordings list with "Open Folder" button

### ✅ Browser Extension (Ready to Test)
- Location: `extension/` folder
- Auto-context injection for Claude.ai and ChatGPT
- Detects trigger phrases: "that project", "remember when", "yesterday", etc.
- Queries local ContextBridge memories → injects before sending
- API server in `extension-server/`

### To Test
1. Load extension: `chrome://extensions` → Load unpacked → select `extension/`
2. Start API server: `cd extension-server && npm start`
3. Try on claude.ai — type "help me with that project"
4. Should see green indicator + context auto-injected

## Recent Work (Mar 2026)
- **Browser-mode fallback**: `api.ts` now detects Tauri vs browser, returns mock data in browser mode
- **Zero console errors** when running `npm run dev` without Tauri backend
- **Mock data layer**: Full CRUD support (add/delete/search memories) in browser mode
- **Mock capture state**: Start/stop/poll all work in browser mode with incrementing counter
- **All 4 pages verified**: Home, Memories, Chat, Settings — all render cleanly
- **Interactions tested**: Toggle capture, search, add memory, memory detail modal, delete

## Still Needs Work
- OCR/Transcription — video recordings need processing to be searchable
- Permission handling — Screen Recording permission UX could be better
- Intelligent retrieval — the moat isn't capture, it's smart retrieval

## Market Context
- Multiple startups building "memory beyond context window"
- Key insight: "1M token context window is not memory. Real memory = accumulate, consolidate, evolve across sessions"
- Differentiation: Video recording alone won't cut it → intelligent retrieval is the moat

## Key Files
- `README.md` — Setup instructions
- `ROADMAP.md` — Feature roadmap
- `extension/` — Chrome extension
- `extension-server/` — Local API for extension
- `src-tauri/` — Rust backend
- `src/` — React frontend
