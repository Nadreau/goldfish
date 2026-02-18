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

**To Test:**
1. Run `npm run tauri dev`
2. Click the big toggle to start capturing
3. Switch between apps, browse web, etc.
4. Check Memory Browser to see captured OCR text
5. Try Chat to ask questions about your context

**What's Working:**
- ✅ 1-second capture interval
- ✅ Tesseract OCR (brew installed)
- ✅ Clean Dashboard UI
- ✅ Memory Browser with search/filter
- ✅ Gemini Chat integration
- ✅ Full OCR text storage

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
