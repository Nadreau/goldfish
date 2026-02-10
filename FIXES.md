# ContextBridge Fixes - Stability & Simplicity Overhaul

**Date:** February 2025  
**Focus:** Fix crashes, dramatically simplify UX

---

## Problems Fixed

### 1. 🐛 App Crashes / Instability

**Root Cause:** The capture context had a problematic `useEffect` dependency loop:
- `doCapture` was recreated on every render because it depended on `settings` and `isCapturing`
- This caused the interval to be cleared and reset constantly
- Could lead to memory leaks and inconsistent behavior

**Fix in `src/lib/captureContext.tsx`:**
```typescript
// BEFORE: doCapture depended on settings/isCapturing (changed every render)
const doCapture = useCallback(async () => {
  if (isCapturing) return;
  // ...used settings directly
}, [settings, isCapturing, addEvent]);

// AFTER: Use refs for stable values
const settingsRef = useRef<CaptureSettings>(settings);
const isCapturingRef = useRef<boolean>(false);

// Keep refs in sync
useEffect(() => { settingsRef.current = settings; }, [settings]);

// doCapture now has stable dependencies
const doCapture = useCallback(async () => {
  if (isCapturingRef.current) return;
  const currentSettings = settingsRef.current;
  // ...
}, [addEvent]); // Only depends on stable addEvent
```

**Additional stability fixes:**
- Added proper cleanup for event listener (Tauri `listen`)
- Wrapped localStorage operations in try/catch
- Added `statusRef` to prevent stale closure issues in intervals
- Fixed interval not being cleared when status changes

### 2. 🎨 UI Too Complex / Confusing

**Problems:**
- Dashboard had too many elements: stats, "How it works", status indicator, search, activity feed, memory list
- Multiple ways to toggle capture (Dashboard, Sidebar, Privacy page) - confusing
- Not immediately obvious what the app does or its current state

**Solution: Radically Simplified Dashboard**

**New Dashboard Layout:**
```
┌──────────────────────────────────────────────────┬─────────────────┐
│  ┌───────────────────────────────────────────┐   │                 │
│  │  ● RECORDING              [POWER BUTTON]  │   │  Live Activity  │
│  │  Capturing clipboard & app activity...    │   │                 │
│  └───────────────────────────────────────────┘   │  📋 Clipboard   │
│                                                   │  🖥️ App Switch  │
│  128 total memories  │  24 captured today        │  📋 Clipboard   │
│                                    [+ Add Memory]│  ...            │
│  ┌─────────────────────────────────────────┐    │                 │
│  │ 🔍 Search your memories...               │    │                 │
│  └─────────────────────────────────────────┘    │  [Capture Now]  │
│                                                   │                 │
│  📋 Copied text from Safari - 2m ago            │                 │
│  🖥️ Switched to VS Code - 5m ago                │                 │
│  ...                                             │                 │
└──────────────────────────────────────────────────┴─────────────────┘
```

**Key Changes:**
1. **ONE BIG TOGGLE** - Giant button at top, impossible to miss
2. **Clear status** - "● RECORDING" or "○ PAUSED" in bold
3. **Simple activity sidebar** - Shows live captures as they happen
4. **Removed clutter:**
   - Removed "How it works" panel (can add tooltip if needed)
   - Removed redundant stats (kept only total + today)
   - Removed complex CaptureStatusIndicator component (replaced with big toggle)
   - Removed ActivityFeed component from main area (moved to sidebar)

### 3. 🧭 Sidebar Simplified

**Before:** Had its own capture toggle + status card + multiple indicators  
**After:** Clean navigation only, status shows in logo badge

**Removed from Sidebar:**
- Quick capture button
- Capture toggle button
- Status card with description
- Redundant status indicators

**Kept:**
- Navigation (Dashboard, Privacy, Settings)
- Memory count and storage stats
- Status indicator on logo (green dot = recording)

---

## Files Changed

### `src/lib/captureContext.tsx`
- Added refs (`statusRef`, `settingsRef`, `isCapturingRef`) for stable capture loop
- Fixed interval cleanup on status/frequency changes
- Fixed event listener cleanup
- Added error handling for localStorage
- Exposed `setStatus` function for manual control

### `src/pages/Dashboard.tsx`
- Complete rewrite for simplicity
- Removed: CaptureStatusIndicator, ActivityFeed component imports
- Added: Inline activity list, big toggle button
- Simplified memory display
- Integrated activity feed into sidebar area

### `src/components/Sidebar.tsx`
- Removed capture toggle button
- Removed status card
- Removed quick capture button
- Simplified to just navigation + stats

---

## Testing Checklist

- [x] App builds without errors (`npm run build`)
- [x] App starts without crashing (`npm run tauri dev`)
- [ ] Click big toggle → status changes to "RECORDING"
- [ ] Copy text → appears in activity sidebar
- [ ] Copy text → appears in memories list
- [ ] Switch apps → app-switch appears in activity
- [ ] Click toggle again → status changes to "PAUSED"
- [ ] Reload page → settings persist, status = paused
- [ ] Search works
- [ ] Add manual memory works
- [ ] Delete memory works
- [ ] Privacy page controls work
- [ ] No crashes after 10+ minutes of use

---

## User Experience Summary

**Before:**
- User sees complex dashboard with many elements
- Has to figure out where the ON/OFF is
- Multiple conflicting controls
- Not clear what's being captured

**After:**
- User sees ONE BIG BUTTON that says "● RECORDING" or "○ PAUSED"
- Click it to toggle
- Activity sidebar shows exactly what's being captured in real-time
- Simple memory list below
- Privacy page for advanced settings

**The 3-second test:** A user should understand what the app does and how to use it within 3 seconds of opening it. The big toggle accomplishes this.

---

## Future Improvements

1. **Keyboard shortcut** - ⌘K to toggle capture
2. **Notification** - Toast when capture starts/stops
3. **App exclusions** - Auto-pause for password managers
4. **Onboarding** - First-time tooltip explaining the toggle
5. **Status in menu bar** - Show recording status in system tray

---

## Update: February 2025 - AI Explainer & Continuous Recording

### Added: "How AI Accesses Your Memory" Explainer (Dashboard)

**Problem:** Users didn't understand how AI assistants could use their captured memories.

**Solution:** Added a collapsible explainer panel on Dashboard showing:
1. **Capture & Store Locally** - Data stays on device
2. **MCP Server Bridge** - Local server lets AI query memories
3. **Ask Your AI** - Example prompts to use

The explainer shows by default on first visit, then remembers if dismissed.

### Added: Continuous Screen Recording (Privacy Controls)

**Problem:** Screenshots every N seconds isn't enough context. Users need continuous capture.

**Solution:** Added screen recording feature:
- Uses macOS `screencapture -V` for video capture
- Start/Stop toggle in Privacy Controls
- Recordings saved to `~/.contextbridge/recordings/`
- Visual indicator when recording is active
- Graceful stop (SIGINT) to save files properly

**Files Changed:**
- `src-tauri/src/lib.rs` - Added `start_screen_recording`, `stop_screen_recording`, `get_recording_status` commands
- `src-tauri/Cargo.toml` - Added `libc` dependency for Unix signals
- `src/lib/api.ts` - Added frontend API functions
- `src/pages/Dashboard.tsx` - Added AI Explainer component
- `src/pages/PrivacyControls.tsx` - Added Continuous Recording section

**Note:** Screen recording requires Screen Recording permission in System Preferences.
