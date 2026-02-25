# ContextBridge Roadmap
*Updated: Feb 24, 2026 — Night work session*

## Current State
- ✅ Core capture working (OCR via Tesseract)
- ✅ Memory storage (SQLite)
- ✅ Chat interface (Gemini)
- ✅ Basic MCP server integration
- ⚠️ UI feels technical/terminal-like
- ⚠️ Settings page overwhelming
- ❌ No minimal indicator mode
- ❌ No universal AI integration (Phase 2)

---

## Phase 1: Polish & Simplification (This Session)

### 1.1 Settings Page Cleanup
**Goal:** 5-year-old could understand it

**Keep (Essential):**
- System Health status (permission checks)
- Capture On/Off toggle + interval slider  
- Gemini API key input
- Export/Import data buttons
- Delete all (danger zone)

**Remove/Hide (Advanced):**
- MCP config snippet (move to docs/tooltip)
- Tesseract install instructions (move to onboarding)
- Keyboard shortcuts (move to help modal)
- Storage location display (who cares?)
- About section (move to menu)

**New Layout:**
```
┌─────────────────────────────────┐
│ ⚡ Quick Settings               │
│ ┌─────────────────────────────┐ │
│ │ 🟢 System Ready             │ │
│ └─────────────────────────────┘ │
│                                 │
│ Capture Speed: [====○----] 2s  │
│                                 │
│ [Start Automatically] [  ON  ] │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ AI Chat Key                     │
│ [••••••••••••••••] [Save]      │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ Your Data                       │
│ [Export] [Import] [Delete All] │
└─────────────────────────────────┘
```

### 1.2 Minimal Pill Indicator
**Goal:** Always visible, never intrusive

When app is running but minimized/backgrounded, show floating pill:

```
┌──────────────┐
│ 🟢 CB Active │  ← Draggable, click to expand
└──────────────┘
```

Or even simpler:
```
┌────┐
│ 🟢 │  ← Just a dot that pulses when capturing
└────┘
```

**Implementation:**
- Tauri's `set_decorations(false)` for borderless window
- Small 40x40px always-on-top window
- Click to restore main window
- Right-click for quick menu (pause/quit)

### 1.3 "Seamless" Feel
**Goal:** Feel like "AI watching screen" not "taking screenshots"

Current: "Taking screenshot... OCR processing... saved!"
Better: Silent capture, only show activity when relevant

**Changes:**
- Remove toast notifications for every save
- Activity feed shows less detail (just app changes)
- No flash/pulse on capture
- Status just shows "Active" with subtle breathing glow

---

## Phase 2: Universal AI Integration (The Patent Magic)

### The Problem
When user types in Claude/ChatGPT, they have to manually:
1. Remember what context they need
2. Copy it from ContextBridge
3. Paste into the AI

### The Vision
Type naturally, context auto-injects.

### Approach Options

#### Option A: Browser Extension
```
User types: "Help me with that project"
Extension detects AI site (claude.ai, chatgpt.com)
Extension queries ContextBridge MCP for relevant memories
Extension injects context into prompt before send
```

**Pros:** Works with any web AI
**Cons:** Needs extension install, prompt manipulation visible

#### Option B: System-level Clipboard Hook
```
User copies text → ContextBridge captures
User types in any AI → detects intent
ContextBridge clipboard-injects context
```

**Pros:** Works everywhere
**Cons:** Invasive, privacy concerns

#### Option C: MCP-Native (Best for Claude)
```
Claude Desktop + MCP → Already connected
User asks Claude about work → Claude queries ContextBridge
Seamless, native integration
```

**Pros:** Native feel, no hacks
**Cons:** Only works with MCP-compatible clients

#### Option D: Keyboard Shortcut Injection
```
User types prompt
Hits ⌘+Shift+B (Bridge shortcut)
ContextBridge injects relevant context at cursor
```

**Pros:** User-controlled, predictable
**Cons:** Extra step, need to remember shortcut

### Recommended Approach: Hybrid

**Short-term:** MCP-native for Claude (already works!)
**Medium-term:** Browser extension for ChatGPT/others
**Long-term:** OS-level memory API (the patent vision)

---

## Implementation Priority

### Tonight:
1. [ ] Simplify Settings page
2. [ ] Reduce capture feedback noise
3. [ ] Document MCP integration better

### This Week:
4. [ ] Minimal pill indicator (Tauri system tray?)
5. [ ] Browser extension MVP for Claude.ai
6. [ ] Onboarding flow for first-time users

### This Month:
7. [ ] ChatGPT browser extension
8. [ ] Memory tagging by project
9. [ ] Smart context relevance scoring

---

## Notes from Niko (Feb 24)

> "I want it to feel like there's just an AI that's watching my whole screen 
> and that I'm able to interact with like a person"

> "The big stuff that's coming is... if I ever go to any AI... 
> I want to be able to type in very short what I am thinking 
> and it be able to automatically consider the memory"

This is the North Star. Everything we build should work toward this.
