/**
 * Goldfish API — Tauri command wrappers with browser-mode fallback
 * When running outside Tauri (e.g. `npm run dev`), returns mock data so the UI works.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Tauri Detection & Safe Invoke
// ═══════════════════════════════════════════════════════════════════════════════

const isTauri = () => !!(window as any).__TAURI__;

let _invoke: typeof import('@tauri-apps/api/core').invoke;
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Not running in Tauri');
  if (!_invoke) {
    const mod = await import('@tauri-apps/api/core');
    _invoke = mod.invoke;
  }
  return _invoke<T>(cmd, args);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Memory {
  id: string;
  content: string;
  tags: string[];
  source: string;
  source_app: string | null;
  timestamp: string;
  memory_tier: string;
  importance: number | null;
}

export interface MemoryStats {
  total_memories: number;
  memories_today: number;
  storage_bytes: number;
  sources: Record<string, number>;
}

export interface TodaySummary {
  apps: Record<string, number>;
  totalCaptures: number;
  totalChars: number;
}

export interface ActiveWindow {
  app_name: string;
  window_title: string;
  timestamp: string;
}

export interface ClipboardContent {
  content: string;
  timestamp: string;
}

export interface CaptureResult {
  success: boolean;
  changed: boolean;
  summary: string;
  saved_id: string | null;
  error: string | null;
}

export interface CaptureStatus {
  is_active: boolean;
  capture_count: number;
}

export interface RecordingStatus {
  is_recording: boolean;
  recording_path: string | null;
  recording_start: string | null;
  duration_seconds: number | null;
}

export interface RecordingResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Data (browser mode)
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_MEMORIES: Memory[] = [
  { id: '1', content: 'Working on Goldfish Tauri app — setting up the React frontend with Tailwind CSS and building the dashboard UI.', tags: ['project', 'goldfish'], source: 'app-tracking', source_app: 'VS Code', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), memory_tier: 'hot', importance: 3 },
  { id: '2', content: 'MCP server architecture: save_memory, recall_memory, forget_memory, list_memories. Uses SQLite with TF-IDF vectors. All local, privacy-first.', tags: ['architecture', 'mcp'], source: 'clipboard', source_app: null, timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), memory_tier: 'hot', importance: 4 },
  { id: '3', content: 'Screenshot of Figma design — new dashboard layout with memory timeline, search bar, and privacy controls. Dark theme with purple accents.', tags: ['design', 'figma'], source: 'screenshot', source_app: 'Figma', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), memory_tier: 'hot', importance: 3 },
  { id: '4', content: 'Researching Tauri v2 system tray API — TrayIconBuilder with menu events. Need to handle show/hide of main window.', tags: ['research', 'tauri'], source: 'smart-capture', source_app: 'Arc', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), memory_tier: 'warm', importance: 3 },
  { id: '5', content: 'Patent filing notes: Universal AI memory across operating systems. 38 pages covering cross-platform context persistence and semantic search.', tags: ['patent', 'important'], source: 'manual', source_app: null, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), memory_tier: 'warm', importance: 5 },
  { id: '6', content: 'Meeting notes: Discussed monetization — Free tier (100 memories), Pro $9/mo unlimited. Focus on HN launch and MCP directories.', tags: ['business', 'meeting'], source: 'manual', source_app: null, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), memory_tier: 'cold', importance: 4 },
  { id: '7', content: 'Clipboard: export default defineConfig({ plugins: [react(), tailwindcss()], clearScreen: false, server: { port: 5173 } })', tags: ['code', 'config'], source: 'clipboard', source_app: 'VS Code', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), memory_tier: 'cold', importance: 2 },
  { id: '8', content: 'Competitor analysis: Rewind.ai ($20/mo), Recall.ai (free beta), Mem.ai ($10/mo). Our edge: MCP integration + privacy-first + open protocol.', tags: ['competitors', 'market'], source: 'smart-capture', source_app: 'Arc', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), memory_tier: 'cold', importance: 4 },
];

let mockMemoryStore = [...MOCK_MEMORIES];
let mockCaptureActive = false;
let mockCaptureCount = 0;

// Simulated captures that get "recorded" while watching
// These mimic what the real OCR pipeline produces: [App] Window Title + full screen text
const SIMULATED_CAPTURES = [
  {
    content: `[VS Code] api.ts — goldfish\n\n---\nimport { useState, useEffect, useCallback } from 'react';\nimport { Search, Monitor, X, Trash2, Download, Copy, Check, RefreshCw } from 'lucide-react';\nimport { getAllMemories, searchMemories, deleteMemory, formatRelativeTime, type Memory } from '../lib/api';\n\nexport default function MemoryBrowser() {\n  const [memories, setMemories] = useState<Memory[]>([]);\n  const [search, setSearch] = useState('');\n  const [selected, setSelected] = useState<Memory | null>(null);\n  const [loading, setLoading] = useState(true);\n  const [filter, setFilter] = useState<'all' | 'ocr' | 'manual'>('all');\n\n  const fetchMemories = useCallback(async () => {\n    setLoading(true);\n    const data = search.trim() ? await searchMemories(search, 100) : await getAllMemories(100);\n    setMemories(data);\n    setLoading(false);\n  }, [search, filter]);`,
    source: 'ocr-capture', source_app: 'VS Code', tags: ['ocr-capture', 'coding']
  },
  {
    content: `[Terminal] zsh — npm run tauri:dev\n\n---\n$ npm run tauri:dev\n\n> goldfish@0.1.0 tauri:dev\n> tauri dev\n\n     Running \`cargo build --manifest-path src-tauri/Cargo.toml\`\n   Compiling goldfish v0.1.0\n    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 4.32s\n        Info Watching for changes...\n  VITE v7.0.0  ready in 342 ms\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: http://192.168.1.42:5173/`,
    source: 'ocr-capture', source_app: 'Terminal', tags: ['ocr-capture', 'coding']
  },
  {
    content: `[Arc] Google AI Studio — API Keys\n\n---\nGoogle AI Studio\nGet API key\n\nYour API keys\nAPI Key                              Created          Project\nAIzaSyB7x...mK4Qw                   Feb 12, 2026     Goldfish-prod\nAIzaSyD3p...nR8Lx                   Jan 28, 2026     memory-search-dev\nAIzaSyF9k...jT2Mm                   Dec 15, 2025     patent-demo\n\nUsage this month: 1,247 requests\nQuota: 1,500 RPM  |  1M TPM\n\nModels: gemini-2.0-flash, gemini-2.0-pro, gemini-1.5-flash\nDocumentation  |  Pricing  |  Support`,
    source: 'ocr-capture', source_app: 'Arc', tags: ['ocr-capture', 'browsing']
  },
  {
    content: `[Slack] #goldfish — Slack\n\n---\n#goldfish\n\nNiko Nadreau  10:42 AM\nJust pushed the new OCR pipeline — captures are 5x richer now. Full screen text instead of just app names.\n\nNiko Nadreau  10:43 AM\nThe capture loop runs two threads: context tracker (500ms) for app switches, and screenshot→OCR consumer for full text.\n\nNiko Nadreau  10:45 AM\nNext up: need to increase the Chat context window. Currently only sending 4000 chars to Gemini, which means most of the rich OCR data gets cut off.\n\nNiko Nadreau  10:48 AM\nAlso want to test the dedup — similarity threshold is 0.6 for the capture loop, 0.8 for manual captures. Should catch scrolling without missing new content.`,
    source: 'ocr-capture', source_app: 'Slack', tags: ['ocr-capture', 'communication']
  },
  {
    content: `[Arc] Tauri v2 — System Tray API\n\n---\nTauri Docs > API > Window > System Tray\n\nTrayIconBuilder\nCreates a new system tray icon.\n\nuse tauri::{\n    menu::{Menu, MenuItem},\n    tray::TrayIconBuilder,\n    Manager,\n};\n\nfn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {\n    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;\n    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;\n    let menu = Menu::with_items(app, &[&show, &quit])?;\n    TrayIconBuilder::new()\n        .menu(&menu)\n        .on_menu_event(|app, event| {\n            match event.id.as_ref() {\n                "quit" => app.exit(0),\n                "show" => { if let Some(w) = app.get_webview_window("main") { w.show().unwrap(); w.set_focus().unwrap(); } }\n                _ => {}\n            }\n        })\n        .build(app)?;\n    Ok(())\n}`,
    source: 'ocr-capture', source_app: 'Arc', tags: ['ocr-capture', 'browsing']
  },
  {
    content: `[Figma] Goldfish Dashboard — Design\n\n---\nGoldfish Dashboard v2.1\n\nFrame: Dashboard / Main\nWidth: 1280px  Height: 800px\n\nComponents:\n- Sidebar: 240px width, dark (#0a0a0f), nav items: Home, Memories, Chat, Settings\n- Header: "Your Memory" h1, stats row (142 memories, 23 today, 1.2 MB)\n- Memory Timeline: vertical list, each card shows timestamp, app icon, content preview\n- Capture Toggle: bottom-left, green pulse when active, "Watching" / "Paused" label\n- Quick Actions: Search bar (Cmd+K), Add Memory button, Export button\n\nColor Palette:\n- Background: #0a0a0f\n- Card: rgba(255,255,255,0.03)\n- Primary: indigo-500 (#6366f1)\n- Accent: violet-500 (#8b5cf6)\n- Text: slate-200 (#e2e8f0)\n- Muted: slate-500 (#64748b)`,
    source: 'ocr-capture', source_app: 'Figma', tags: ['ocr-capture', 'design']
  },
  {
    content: `Copied from clipboard:\n\nexport interface Memory {\n  id: string;\n  content: string;\n  tags: string[];\n  source: string;\n  source_app: string | null;\n  timestamp: string;\n}\n\nexport interface MemoryStats {\n  total_memories: number;\n  memories_today: number;\n  storage_bytes: number;\n  sources: Record<string, number>;\n}`,
    source: 'clipboard', source_app: 'VS Code', tags: ['clipboard', 'code']
  },
  {
    content: `[Notes] Meeting Notes — Monetization\n\n---\nGoldfish Monetization Discussion\nDate: March 5, 2026\n\nTier Structure:\n- Free: 100 memories, basic search, 1 device\n- Pro ($9/mo): Unlimited memories, semantic search, cross-device sync, MCP server\n- Team ($19/mo/user): Shared workspaces, admin controls, priority support\n\nLaunch Strategy:\n1. HN Show HN post — target front page\n2. MCP directories (Smithery, MCP Hub, awesome-mcp-servers)\n3. Product Hunt launch — schedule for Tuesday\n4. Twitter/X thread with demo video\n5. Reddit r/LocalLLaMA, r/ChatGPT, r/ClaudeAI\n\nKey Metrics to Track:\n- DAU/MAU ratio\n- Memories per user per day\n- Chat queries per session\n- Conversion rate free→pro\n\nCompetitor Pricing:\n- Rewind.ai: $20/mo\n- Recall.ai: free beta (no monetization yet)\n- Mem.ai: $10/mo`,
    source: 'ocr-capture', source_app: 'Notes', tags: ['ocr-capture']
  },
];
let simIndex = 0;

function addSimulatedCapture() {
  const sim = SIMULATED_CAPTURES[simIndex % SIMULATED_CAPTURES.length];
  simIndex++;
  const mem: Memory = {
    id: `sim-${Date.now()}-${simIndex}`,
    content: sim.content,
    tags: sim.tags,
    source: sim.source,
    source_app: sim.source_app,
    timestamp: new Date().toISOString(),
    memory_tier: 'hot',
    importance: 3,
  };
  mockMemoryStore = [mem, ...mockMemoryStore];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory API
// ═══════════════════════════════════════════════════════════════════════════════

export async function getAllMemories(limit?: number): Promise<Memory[]> {
  try { return await safeInvoke<Memory[]>('get_all_memories', { limit }); }
  catch { return mockMemoryStore.slice(0, limit ?? 50); }
}

export async function searchMemories(query: string, limit?: number): Promise<Memory[]> {
  try { return await safeInvoke<Memory[]>('search_memories', { query, limit }); }
  catch {
    const q = query.toLowerCase();
    return mockMemoryStore.filter(m =>
      m.content.toLowerCase().includes(q) || m.tags.some(t => t.includes(q))
    ).slice(0, limit ?? 50);
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  try { return await safeInvoke<MemoryStats>('get_memory_stats'); }
  catch {
    const now = new Date();
    return {
      total_memories: mockMemoryStore.length,
      memories_today: mockMemoryStore.filter(m => {
        const d = new Date(m.timestamp);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      }).length,
      storage_bytes: mockMemoryStore.reduce((a, m) => a + m.content.length, 0),
      sources: mockMemoryStore.reduce((acc, m) => { acc[m.source] = (acc[m.source] || 0) + 1; return acc; }, {} as Record<string, number>),
    };
  }
}

export async function saveMemory(
  content: string,
  tags: string[],
  source: string,
  sourceApp?: string
): Promise<Memory> {
  try {
    return await safeInvoke<Memory>('save_memory', { content, tags, source, source_app: sourceApp ?? null });
  } catch {
    const mem: Memory = { id: Date.now().toString(), content, tags, source, source_app: sourceApp ?? null, timestamp: new Date().toISOString(), memory_tier: 'hot', importance: null };
    mockMemoryStore = [mem, ...mockMemoryStore];
    return mem;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  try { return await safeInvoke<boolean>('delete_memory', { id }); }
  catch { mockMemoryStore = mockMemoryStore.filter(m => m.id !== id); return true; }
}

export async function deleteAllMemories(): Promise<number> {
  try { return await safeInvoke<number>('delete_all_memories'); }
  catch { const c = mockMemoryStore.length; mockMemoryStore = []; return c; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tiered Memory API
// ═══════════════════════════════════════════════════════════════════════════════

export async function getMemoriesByTier(tier: string, limit?: number): Promise<Memory[]> {
  try { return await safeInvoke<Memory[]>('get_memories_by_tier', { tier, limit }); }
  catch { return mockMemoryStore.filter(m => m.memory_tier === tier).slice(0, limit ?? 50); }
}

export async function getHotMemoriesOlderThan(hours: number, limit?: number): Promise<Memory[]> {
  try { return await safeInvoke<Memory[]>('get_hot_memories_older_than', { hours, limit }); }
  catch {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return mockMemoryStore.filter(m => m.memory_tier === 'hot' && new Date(m.timestamp).getTime() < cutoff).slice(0, limit ?? 200);
  }
}

export async function compactMemories(
  idsToDelete: string[],
  newContent: string,
  newTags: string[],
  newTier: string,
  newSourceApp?: string,
  newImportance?: number,
): Promise<Memory> {
  try {
    return await safeInvoke<Memory>('compact_memories', {
      ids_to_delete: idsToDelete,
      new_memory_content: newContent,
      new_memory_tags: newTags,
      new_memory_tier: newTier,
      new_memory_source_app: newSourceApp ?? null,
      new_memory_importance: newImportance ?? null,
    });
  } catch {
    mockMemoryStore = mockMemoryStore.filter(m => !idsToDelete.includes(m.id));
    const mem: Memory = { id: Date.now().toString(), content: newContent, tags: newTags, source: 'compacted', source_app: newSourceApp ?? null, timestamp: new Date().toISOString(), memory_tier: newTier, importance: newImportance ?? null };
    mockMemoryStore.unshift(mem);
    return mem;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture API
// ═══════════════════════════════════════════════════════════════════════════════

export async function getActiveWindow(): Promise<ActiveWindow> {
  try { return await safeInvoke<ActiveWindow>('get_active_window'); }
  catch { return { app_name: 'Browser', window_title: 'Goldfish Preview', timestamp: new Date().toISOString() }; }
}

export async function getClipboard(): Promise<ClipboardContent> {
  try { return await safeInvoke<ClipboardContent>('get_clipboard'); }
  catch { return { content: '', timestamp: new Date().toISOString() }; }
}

export async function captureScreenshot(): Promise<CaptureResult> {
  try { return await safeInvoke<CaptureResult>('capture_screenshot'); }
  catch { return { success: false, changed: false, summary: 'Not available in browser mode', saved_id: null, error: null }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Smart Capture API — The Main Feature
// ═══════════════════════════════════════════════════════════════════════════════

export async function smartCapture(): Promise<CaptureResult> {
  try { return await safeInvoke<CaptureResult>('smart_capture'); }
  catch { return { success: false, changed: false, summary: 'Not available in browser mode', saved_id: null, error: null }; }
}

export async function rapidCaptureWithOcr(): Promise<CaptureResult> {
  try { return await safeInvoke<CaptureResult>('rapid_capture_with_ocr'); }
  catch { return { success: false, changed: false, summary: 'Not available in browser mode', saved_id: null, error: null }; }
}

export async function startCapture(): Promise<CaptureStatus> {
  try { return await safeInvoke<CaptureStatus>('start_capture'); }
  catch { mockCaptureActive = true; mockCaptureCount = 0; return { is_active: true, capture_count: 0 }; }
}

export async function stopCapture(): Promise<CaptureStatus> {
  try { return await safeInvoke<CaptureStatus>('stop_capture'); }
  catch { mockCaptureActive = false; return { is_active: false, capture_count: mockCaptureCount }; }
}

export async function getCaptureStatus(): Promise<CaptureStatus> {
  try { return await safeInvoke<CaptureStatus>('get_capture_status'); }
  catch {
    if (mockCaptureActive) {
      mockCaptureCount++;
      // Simulate a new capture every ~3 polls
      if (mockCaptureCount % 3 === 0) addSimulatedCapture();
    }
    return { is_active: mockCaptureActive, capture_count: mockCaptureCount };
  }
}

export async function checkCapturePermission(): Promise<boolean> {
  try { return await safeInvoke<boolean>('check_capture_permission'); }
  catch { return true; }
}

export async function requestCapturePermission(): Promise<boolean> {
  try { return await safeInvoke<boolean>('request_capture_permission'); }
  catch { return false; }
}

export async function checkTesseractInstalled(): Promise<boolean> {
  try { return await safeInvoke<boolean>('check_tesseract_installed'); }
  catch { return true; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scene Buffer API — for AI scene understanding
// ═══════════════════════════════════════════════════════════════════════════════

export interface SceneSnapshot {
  app_name: string;
  window_title: string;
  ocr_text: string;
  timestamp: string;
  browser_url: string | null;
}

/** Drain the scene buffer — returns all buffered snapshots and clears it */
export async function getSceneBuffer(): Promise<SceneSnapshot[]> {
  try { return await safeInvoke<SceneSnapshot[]>('get_scene_buffer'); }
  catch { return []; }
}

/** Get current scene buffer count */
export async function getSceneBufferCount(): Promise<number> {
  try { return await safeInvoke<number>('get_scene_buffer_count'); }
  catch { return 0; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording API
// ═══════════════════════════════════════════════════════════════════════════════

export async function startRecording(): Promise<RecordingResult> {
  try { return await safeInvoke<RecordingResult>('start_recording'); }
  catch { return { success: false, path: null, error: 'Not available in browser mode' }; }
}

export async function stopRecording(): Promise<RecordingResult> {
  try { return await safeInvoke<RecordingResult>('stop_recording'); }
  catch { return { success: false, path: null, error: 'Not available in browser mode' }; }
}

export async function getRecordingStatus(): Promise<RecordingStatus> {
  try { return await safeInvoke<RecordingStatus>('get_recording_status'); }
  catch { return { is_recording: false, recording_path: null, recording_start: null, duration_seconds: null }; }
}

export async function listRecordings(): Promise<string[]> {
  try { return await safeInvoke<string[]>('list_recordings'); }
  catch { return []; }
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/**
 * Clean OCR artifacts from any display string.
 * Fixes: "Goldf ish" → "Goldfish", strips "< ->]" nav arrows, menu bar junk, etc.
 */
function cleanOcrText(text: string): string {
  return text
    // Fix common OCR word splits (handles "Goldf ish", "Gold fish", "Gold ish" where f is lost)
    .replace(/G\s*old\s*f?\s*i\s*sh/gi, 'Goldfish')
    .replace(/Cont\s*ext/gi, 'Context')
    // Fix common OCR name misspellings
    .replace(/\bNlko\b/g, 'Niko')
    .replace(/\bNadreau\s*'?\s*s\b/g, "Nadreau's")
    // Fix mismatched bracket artifacts from OCR: "{DM)" → "(DM)", "{Char" → ""
    .replace(/\{(\w+)\)/g, '($1)')
    .replace(/\{[A-Za-z]{0,4}$/g, '')
    // Strip navigation arrow/bracket artifacts
    .replace(/\[?\s*<\s*-+\s*>?\s*\]?/g, '')
    .replace(/\btE\s*\]/g, '')
    .replace(/-+\s*>\s*\]/g, '')
    // Strip stray bracket fragments at start/end
    .replace(/^[\[\]<>(){}\s]{1,4}|[\[\]<>(){}\s]{1,4}$/g, '')
    // Strip leading OCR garble: single letters with dots/spaces at start ("L. I " prefix)
    .replace(/^([A-Z]\.?\s+){1,3}(?=[a-z])/g, '')
    // Clean trailing unmatched brackets/parens from OCR truncation: "Blu(" → "Blu"
    .replace(/[\[({]+\s*$/, '')
    // Strip trailing "X" (close button OCR artifact on notifications)
    .replace(/\s+X\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Returns true if the line is menu bar / UI chrome junk or OCR garble. */
function isUiJunk(line: string): boolean {
  const l = line.trim();
  if (!l) return true;

  const alphaOnly = l.replace(/[^a-zA-Z]/g, '');
  const alphaRatio = alphaOnly.length / l.length;

  // Very short with less than 3 alpha chars
  if (alphaOnly.length < 3) return true;

  // Menu bar words (expanded — these appear in macOS menu bar OCR)
  const menuWords = /^(File|Edit|View|Insert|Format|Table|Organize|Arrange|Share|Window|Help|History|Bookmarks|Profiles|Tab|Go|Navigate|Run|Debug|Terminal|Extensions|Source Control|Chrome|Safari|Firefox|Arc|Edge|Build|Product|Apple|System|Preferences|Services|Select|Selection|Search|Tools|Actions|Account)$/i;
  const words = l.split(/\s+/).filter(w => w.length > 0);

  // If line is ALL menu words (regardless of count), it's junk.
  // Catches "Chrome File Edit View History Bookmarks Profiles Tab Window Help" (10+ words).
  if (words.length >= 2 && words.every(w => menuWords.test(w))) return true;

  // If line starts with 4+ menu words and MOST of the line is menu words, it's junk (e.g. "Chrome File Edit View History Bookmarks gibberish ocr stuff")
  const menuCount = words.filter(w => menuWords.test(w)).length;
  if (words.length >= 4 && menuCount >= 4 && menuCount / words.length > 0.55) return true;

  // Clock/date patterns (including "Mon Apr 13")
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}/i.test(l)) return true;
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/i.test(l)) return true;

  // System UI text
  if (/^(HIGH RISK|Preview|Scheduled|New session|\+ New|\.\.\.\s*\/|Search|Apps|Dashboard)$/i.test(l)) return true;

  // URL bar / breadcrumb junk (e.g. "github.com/settings/security" on its own)
  if (/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?\s*$/i.test(l) && l.length < 80) return true;

  // OCR garble: "* e• Q•UO * Q GI*J, Q" — macOS menu bar icons read as text
  const symbolChars = (l.match(/[*•·°×÷±§†‡¶©®™{}()\[\]<>|\\\/~`^#@!]/g) || []).length;
  if (symbolChars >= 3) return true;

  // Mostly non-alpha (< 50% letters) = likely OCR noise
  if (alphaRatio < 0.5 && l.length > 5) return true;

  // Dominated by single-char words
  const singleCharWords = words.filter(w => w.length === 1).length;
  if (words.length >= 3 && singleCharWords / words.length > 0.5) return true;

  return false;
}

/**
 * Extract a clean, short title from app name + window title.
 * Mirrors the Rust generate_smart_summary logic so the UI can produce
 * LinkedIn-style clean labels like "Slack", "LinkedIn — Your Feed",
 * "VS Code — api.ts" from raw OCR content.
 */
function smartTitleFromApp(app: string | null | undefined, windowTitle: string): string | undefined {
  const appName = cleanSourceApp(app);
  if (!appName) return undefined;
  const appLower = appName.toLowerCase();
  const titleClean = cleanOcrText(windowTitle || '').replace(/^\[.+?\]\s*/, '').trim();
  const titleLower = titleClean.toLowerCase();

  // Browsers — extract the site and page
  if (/chrome|safari|firefox|arc|edge|brave|vivaldi/.test(appLower)) {
    if (!titleClean || isUiJunk(titleClean)) return appName;
    // Strip trailing " - Chrome" / " - Google Chrome" etc.
    let t = titleClean.replace(/\s*[-—]\s*(Google\s+)?(Chrome|Safari|Firefox|Arc|Edge|Brave)(\s+Browser)?\s*$/i, '').trim();
    if (titleLower.includes('gmail') || titleLower.includes('inbox')) return 'Gmail' + (t && t.length < 60 ? ` — ${t.split(' - ')[0]}` : '');
    if (titleLower.includes('youtube')) {
      const vid = t.replace(/\s*[-—]\s*YouTube.*$/i, '').trim();
      return vid && vid.length < 70 ? `YouTube — ${vid}` : 'YouTube';
    }
    if (titleLower.includes('github')) {
      const repo = t.replace(/\s*·\s*GitHub.*$/i, '').trim();
      return repo && repo.length < 70 ? `GitHub — ${repo}` : 'GitHub';
    }
    if (titleLower.includes('slack')) return 'Slack';
    if (titleLower.includes('discord')) return 'Discord';
    if (titleLower.includes('notion')) {
      const page = t.replace(/\s*[-—]\s*Notion.*$/i, '').trim();
      return page && page.length < 70 ? `Notion — ${page}` : 'Notion';
    }
    if (titleLower.includes('linkedin')) return 'LinkedIn';
    if (titleLower.includes('reddit')) {
      const sub = t.match(/r\/[a-z0-9_]+/i)?.[0];
      return sub ? `Reddit — ${sub}` : 'Reddit';
    }
    if (titleLower.includes('twitter') || titleLower.includes(' / x') || titleLower.includes('x.com')) return 'X / Twitter';
    if (titleLower.includes('stack overflow')) return 'Stack Overflow';
    if (titleLower.includes('google docs') || titleLower.includes('google sheets') || titleLower.includes('google slides')) {
      const kind = titleLower.includes('sheets') ? 'Google Sheets' : titleLower.includes('slides') ? 'Google Slides' : 'Google Docs';
      const name = t.split(' - ')[0]?.trim();
      return name && name.length < 60 ? `${kind} — ${name}` : kind;
    }
    // Generic: use page title, capped
    if (t && t.length >= 4 && t.length <= 80 && !isUiJunk(t)) return t;
    return appName;
  }

  // Code editors
  if (/vs code|cursor|xcode|sublime|atom|vim|nvim|zed|windsurf/.test(appLower)) {
    const file = titleClean.split(/\s*[-—]\s*/)[0]?.trim();
    if (file && !isUiJunk(file) && file.length < 60) return `${appName} — ${file}`;
    return appName;
  }

  // Communication apps with channel/person
  if (/slack|discord|messages|telegram|whatsapp|teams/.test(appLower)) {
    const channel = titleClean.match(/#\S+/)?.[0] || titleClean.split(/\s*[-—]\s*/)[0]?.trim();
    if (channel && !isUiJunk(channel) && channel.length < 50) return `${appName} — ${channel}`;
    return appName;
  }

  // Terminal
  if (/terminal|iterm|warp|alacritty/.test(appLower)) {
    return appName;
  }

  // Default: app name + window title if it's meaningful
  if (titleClean && !isUiJunk(titleClean) && titleClean.length < 60) {
    return `${appName} — ${titleClean}`;
  }
  return appName;
}

/**
 * Clean source_app for display. Strips OCR artifacts, menu text appended to app names.
 */
export function cleanSourceApp(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = cleanOcrText(raw);
  // Strip trailing menu bar words appended by OCR (e.g. "Goldfish File" → "Goldfish")
  cleaned = cleaned.replace(/\s+(File|Edit|View|Window|Help|Insert|Format|Share)$/i, '');
  // Fix mismatched brackets from OCR: "{DM)" → "(DM)", "{Char" → ""
  cleaned = cleaned.replace(/\{(\w+)\)/g, '($1)');
  cleaned = cleaned.replace(/\{[A-Za-z]{0,4}$/, '');
  // Strip IP addresses (127.0.0.1, localhost, etc.) — these are dev server artifacts
  if (/^(127\.0\.0\.\d+|localhost|0\.0\.0\.0|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.test(cleaned)) return undefined;
  // Strip generic OS-level names that aren't informative
  if (/^(Desktop|Dock|SystemUIServer|loginwindow|Finder)$/i.test(cleaned)) return undefined;
  if (!cleaned || cleaned.length < 2 || isUiJunk(cleaned)) return undefined;
  return cleaned;
}

/**
 * Smart memory preview — extracts a clean, user-friendly title + detail from raw memory content.
 * Handles all source types: OCR captures, scene analysis, clipboard, compacted, manual.
 */
export function getMemoryPreview(memory: Memory): { title: string; detail?: string } {
  const { content, source } = memory;
  const lines = content.split('\n');
  const nonEmpty = lines.filter(l => l.trim());

  // Scene analysis: "## Title" format with bullet details
  if (source === 'scene-analysis') {
    const titleLine = nonEmpty.find(l => l.startsWith('## '));
    if (titleLine) {
      const title = cleanOcrText(titleLine.replace(/^##\s*/, ''));
      const bullets = nonEmpty.filter(l => l.startsWith('- ')).slice(0, 2);
      return {
        title,
        detail: bullets.length > 0 ? bullets.map(b => cleanOcrText(b.replace(/^-\s*/, ''))).join(' · ') : undefined,
      };
    }
  }

  // OCR / smart captures: "[AppName] Window Title\n\n---\nfull screen OCR text..."
  if (source === 'ocr-capture' || source === 'smart-capture') {
    const firstLine = (nonEmpty[0] || '').trim();
    const bracketMatch = firstLine.match(/^\[(.+?)\]\s*(.+)?/);
    const appFromBracket = bracketMatch?.[1]?.trim();
    const windowTitle = bracketMatch?.[2]?.trim() || '';

    // 1) Try the smart title generator (LinkedIn-style clean label)
    const smart = smartTitleFromApp(memory.source_app || appFromBracket, windowTitle);

    // Find a meaningful body line to use as a detail/subtitle
    const separatorIdx = content.indexOf('\n---\n');
    const bodyLines = separatorIdx > -1
      ? content.slice(separatorIdx + 5).split('\n').map(l => l.trim()).filter(Boolean)
      : [];
    const meaningfulLine = bodyLines
      .map(l => cleanOcrText(l))
      .find(l => {
        if (l.length < 15) return false;
        if (isUiJunk(l)) return false;
        const words = l.split(/\s+/).filter(w => w.length > 1);
        if (words.length < 3) return false;
        const wordChars = (l.match(/\w/g) || []).length;
        if (wordChars / l.length < 0.4) return false;
        return true;
      });

    if (smart && !isUiJunk(smart)) {
      return {
        title: smart,
        detail: meaningfulLine ? meaningfulLine.slice(0, 80) : undefined,
      };
    }

    // 2) Fallback: use the window title if it's clean
    const cleanedWindowTitle = cleanOcrText(windowTitle);
    const isGenericTitle = !cleanedWindowTitle || cleanedWindowTitle.length < 4 || isUiJunk(cleanedWindowTitle);

    if (isGenericTitle && meaningfulLine) {
      return { title: meaningfulLine.slice(0, 80), detail: cleanSourceApp(memory.source_app) };
    }

    return {
      title: isGenericTitle ? (cleanSourceApp(memory.source_app) || 'Screen Capture') : cleanedWindowTitle,
      detail: meaningfulLine ? meaningfulLine.slice(0, 80) : undefined,
    };
  }

  // Clipboard: strip common prefixes like "Copied from clipboard:" or "Clipboard:"
  if (source === 'clipboard') {
    const cleaned = content.replace(/^(Copied from )?clipboard:\s*/i, '').trim();
    const firstLine = cleaned.split('\n').find(l => l.trim());
    return { title: cleanOcrText(firstLine?.slice(0, 80) || 'Clipboard') };
  }

  // Compacted / warm / cold tier summaries
  if (source === 'compacted') {
    const titleLine = nonEmpty.find(l => l.startsWith('## '));
    if (titleLine) return { title: cleanOcrText(titleLine.replace(/^##\s*/, '')) };
    return { title: cleanOcrText(nonEmpty[0]?.slice(0, 80) || 'Session Summary') };
  }

  // Default: manual, app-tracking, etc — first line as-is
  return { title: cleanOcrText(nonEmpty[0]?.slice(0, 80) || 'Memory') };
}

export function getSourceIcon(source: string): string {
  switch (source) {
    case 'screenshot': return '📸';
    case 'clipboard': return '📋';
    case 'app-tracking': return '🖥️';
    case 'browser': return '🌐';
    case 'manual': return '✍️';
    case 'smart-capture': return '🧠';
    default: return '💾';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Tool Connections
// ═══════════════════════════════════════════════════════════════════════════════

export interface AiToolStatus {
  id: string;
  name: string;
  installed: boolean;
  connected: boolean;
  config_path: string;
}

export async function detectAiTools(): Promise<AiToolStatus[]> {
  try { return await safeInvoke<AiToolStatus[]>('detect_ai_tools'); }
  catch {
    // Mock data for browser dev mode
    return [
      { id: 'claude-desktop', name: 'Claude Desktop', installed: true, connected: false, config_path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      { id: 'claude-code', name: 'Claude Code', installed: true, connected: true, config_path: '~/.claude/mcp.json' },
      { id: 'cursor', name: 'Cursor', installed: false, connected: false, config_path: '~/.cursor/mcp.json' },
      { id: 'windsurf', name: 'Windsurf', installed: false, connected: false, config_path: '~/.codeium/windsurf/mcp_config.json' },
    ];
  }
}

export async function connectAiTool(toolId: string): Promise<void> {
  try { await safeInvoke<void>('connect_ai_tool', { toolId }); }
  catch { console.log(`[Mock] Connected ${toolId}`); }
}

export async function disconnectAiTool(toolId: string): Promise<void> {
  try { await safeInvoke<void>('disconnect_ai_tool', { toolId }); }
  catch { console.log(`[Mock] Disconnected ${toolId}`); }
}
