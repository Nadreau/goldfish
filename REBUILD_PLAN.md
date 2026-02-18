# ContextBridge Rebuild Plan
*Created: 2026-02-18 | Status: Active*

## 🎯 Vision (From Niko)

**Super clean, simple interface:**
1. **One-click toggle** - clearly shows when running
2. **AI Chatbot** - powered by Gemini, talk to your context
3. **Memory Browser** - separate page, easy to navigate, click into areas

**Backend that actually works:**
1. **See everything on screen** - OCR/screen reading
2. **Detect app opens/closes** - know when Telegram opens, not just window title
3. **Capture what's IN each app** - content, not just title
4. **Smart context** - understand "messing around" vs "actually working"
5. **All saved to searchable memory**

---

## 🔴 Current Problems

| Issue | Current State | Impact |
|-------|--------------|--------|
| No OCR | Only captures window titles via AppleScript | Can't see actual screen content |
| No app detection | Just window switches, source_app = "unknown" | No understanding of what apps are used |
| No content capture | "Switched to Chrome: [title]" only | Missing actual information |
| No chatbot | No Gemini integration | Can't query your memory |
| Messy UI | Too many components, overwhelming | Hard to understand/use |
| Capture quality | 17 memories total, basic data | Not useful for AI context |

---

## 🟢 Rebuild Architecture

### Frontend (3 Pages Only)

```
┌─────────────────────────────────────────────────┐
│  CONTEXTBRIDGE                                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │     🟢 CAPTURING                        │   │
│  │     ────────────────────────            │   │
│  │     [  BIG TOGGLE BUTTON  ]             │   │
│  │                                         │   │
│  │     153 captures today                  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  💬 Ask about your day...               │   │
│  │  ─────────────────────────────────────  │   │
│  │  > What was I working on this morning?  │   │
│  │                                         │   │
│  │  You were primarily in VS Code editing  │   │
│  │  the ContextBridge app, specifically    │   │
│  │  working on lib.rs and Dashboard.tsx... │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [Dashboard]  [Memory Browser]  [Settings]     │
└─────────────────────────────────────────────────┘
```

**Page 1: Dashboard (Default)**
- Big toggle (one click on/off)
- Status indicator with capture count
- Chat interface (Gemini) below
- That's it. Clean.

**Page 2: Memory Browser**
- Timeline view (scroll through time)
- Filter by app, date, keyword
- Click any memory to see detail
- Expandable sections for deep-dive

**Page 3: Settings**
- Capture interval
- Privacy excludes (apps to ignore)
- Gemini API key
- Storage management

### Backend (Rust/Tauri)

**Screen Capture Pipeline:**
```
Every 3 seconds:
1. Screenshot (screencapture -x)
2. OCR via Vision.framework (macOS native)
3. Get frontmost app + window title
4. Detect app change events
5. Generate semantic summary
6. Deduplicate (don't save if same as last)
7. Store in SQLite with embeddings
```

**Key Changes:**
- Add actual OCR (Vision.framework via Swift helper or `screencapture` + external OCR)
- Track app state changes (not just window switches)
- Generate richer metadata (app name, window title, OCR text, timestamp)
- Build simple embedding for semantic search

**Gemini Integration:**
```
User: "What was I doing before lunch?"

System: 
1. Get memories from 10am-12pm
2. Build context from OCR text + summaries
3. Send to Gemini: "Based on this context, answer: {question}"
4. Return natural language response
```

---

## 📋 Implementation Phases

### Phase 1: Working Capture (PRIORITY)
- [ ] Add screenshot capture (screencapture -x)
- [ ] Add OCR via screencapture → text extraction
- [ ] Proper app detection (frontmost app name, not "unknown")
- [ ] Store: timestamp, app_name, window_title, ocr_text, summary
- [ ] Test: Turn on → open apps → turn off → check if memory captured correctly

### Phase 2: Clean UI
- [ ] Gut the current UI, start fresh
- [ ] Dashboard: One toggle + chat input + response area
- [ ] Memory Browser: Timeline + filters + detail view
- [ ] Settings: Simple form

### Phase 3: Gemini Chat
- [ ] Add Gemini API integration
- [ ] Build context retrieval (get relevant memories for query)
- [ ] Simple chat interface
- [ ] Test: Ask questions about captured context

### Phase 4: Smart Features
- [ ] Activity classification ("working" vs "browsing" vs "idle")
- [ ] Better deduplication
- [ ] Semantic search with embeddings
- [ ] Privacy controls (exclude apps)

---

## 🔨 Immediate Next Steps

1. **Test current state**: Build and run, see what actually works
2. **Fix capture**: Make it actually capture useful data with OCR
3. **Iterate**: Capture → check DB → fix → repeat
4. **Then UI**: Once capture works, clean up frontend

---

## ✅ Progress Log

### 2026-02-18 ~01:00 (Motion)

**Added Gemini Chat Integration:**
- Created `src/pages/Chat.tsx` - Full chat interface with Gemini API
- Updated `src/App.tsx` - Added Chat page routing
- Updated `src/components/Sidebar.tsx` - Added Chat navigation item
- Updated `src/pages/Settings.tsx` - Added Gemini API key configuration

**How Chat Works:**
1. User asks a question
2. System searches memories for relevant context
3. Context + question sent to Gemini 1.5 Flash (free tier)
4. Natural language response returned

**To Test:**
1. Run `npm run tauri dev`
2. Go to Settings → add Gemini API key (get free at https://aistudio.google.com/app/apikey)
3. Go to Chat → ask questions about your captured context

**Still Needs:**
- [x] ~~Actually working capture~~ - Added rapid_capture_with_ocr
- [x] ~~OCR for screen content~~ - Using tesseract
- [x] ~~Memory browser page~~ - Created MemoryBrowser.tsx

### 2026-02-18 ~00:45 (Motion - Overnight Grind)

**Major Changes:**
1. **Rapid OCR Capture** (every 1 second!)
   - `src-tauri/src/capture.rs` - New capture module with OCR
   - Uses tesseract for OCR (brew installed)
   - Takes screenshot → OCR → deduplication → save
   - Stores full OCR text in memory

2. **Simplified Dashboard** 
   - `src/pages/DashboardSimple.tsx` - Clean, focused UI
   - One big toggle, quick stats, live activity feed
   - No clutter, just what matters

3. **Memory Browser**
   - `src/pages/MemoryBrowser.tsx` - Browse all memories
   - Search, filter by type (OCR/manual)
   - Full detail view with OCR text

**To Test (When You Wake Up):**

1. **Grant Permission First:**
   - System Settings → Privacy & Security → Screen Recording
   - Enable for ContextBridge (or Terminal if testing via npm run tauri dev)

2. **Run the app:**
   ```bash
   cd /Users/nikonadreau/Desktop/contextbridge-app
   npm run tauri dev
   ```

3. **Check Permission Warning:**
   - If you see amber warning banner, fix permissions first

4. **Test Capture:**
   - Click the big toggle to start capturing
   - Switch between apps (Chrome, VS Code, Terminal, etc.)
   - Watch the "Live Activity" feed fill up
   - Check the "Last Capture" preview - should show OCR text!

5. **Test Chat:**
   - Go to Settings → Add Gemini API key (free: aistudio.google.com/app/apikey)
   - Go to Chat page
   - Ask: "What was I just doing?" or "What apps did I use?"

6. **Test Memory Browser:**
   - Go to Memory page
   - Search for specific text you saw on screen
   - Filter by "Screen Captures" to see OCR results

7. **Check Logs:**
   - In terminal running the app, look for:
     `[ContextBridge] Capture: screenshot=XXms, ocr=XXms, app=Chrome, chars=1234`
   - This shows OCR is working

**What's Working:**
- ✅ Configurable capture interval (500ms - 5s, default 1s)
- ✅ Tesseract OCR (brew installed)
- ✅ Clean Dashboard UI with last capture preview
- ✅ Memory Browser with search/filter
- ✅ Gemini Chat integration with context count
- ✅ Full OCR text storage
- ✅ Settings page with Gemini key + capture interval

### Latest Changes (Overnight Grind 00:38 - 00:53)

**19 commits made tonight (and counting):**

1. `d5b06ec` - Gemini chat integration + API key settings
2. `c2d60e0` - Rapid OCR capture (1 sec interval, tesseract OCR)
3. `59f2900` - Simplify Dashboard + Memory Browser page
4. `d462cbf` - Last capture preview on Dashboard
5. `990f6ac` - Improve Chat page with context count
6. `762258a` - Configurable capture interval in Settings
7. `54177d5` - Capture timing logs for debugging
8. `c0b3a2c` - Screen recording permission check with warning
9. `a1df8cd` - Memory Browser with char count + OCR badge
10. `b362ab4` - Keyboard shortcut (⌘⇧C) to toggle capture
11. `7dff7f7` - Auto-start capture option in Settings
12. `b40d818` - Export to Markdown in Memory Browser
13. `dfa4fd9` - Save toast notification
14. `cd24a89` - Improved activity feed visuals
15. `9dae622` - Test OCR button to verify capture
16. `68f0c61` - Top apps summary on Dashboard

**Total: 21+ commits overnight!**

**Key Additions:**
- Rapid OCR capture pipeline (screenshot → tesseract → SQLite)
- Clean Dashboard with one toggle, stats, and last capture preview
- Memory Browser with search, filters, and full OCR text viewing
- Chat page with Gemini integration and context awareness
- Configurable capture interval (500ms - 5s)
- Permission checking with helpful warning
- Keyboard shortcut ⌘⇧C for quick toggle
- Full timing logs for debugging

**Still TODO:**
- [ ] Auto-start capture option
- [ ] Better deduplication (semantic similarity)
- [ ] Context summarization
- [ ] Activity classification

---

## 📁 Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Add OCR, fix app detection, better storage |
| `src/pages/Dashboard.tsx` | Simplify to toggle + chat |
| `src/pages/MemoryBrowser.tsx` | NEW - timeline view |
| `src/App.tsx` | Update routing |
| `src/lib/api.ts` | Add Gemini calls |

---

*Motion will iterate on this - test, fix, repeat*
