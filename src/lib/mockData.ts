export interface Memory {
  id: string;
  content: string;
  tags: string[];
  source: 'screenshot' | 'clipboard' | 'app-tracking' | 'browser' | 'manual';
  sourceApp?: string;
  timestamp: string;
  preview?: string;
}

export const mockMemories: Memory[] = [
  {
    id: '1',
    content: 'Working on ContextBridge Tauri app — setting up the React frontend with Tailwind CSS and building the dashboard UI. The app will be a menu bar app on Mac with screenshot capture, clipboard monitoring, and active window tracking.',
    tags: ['project', 'contextbridge', 'development'],
    source: 'app-tracking',
    sourceApp: 'VS Code',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: '2',
    content: 'MCP server architecture: save_memory, recall_memory, forget_memory, list_memories. Uses SQLite with TF-IDF vector search. All local, privacy-first.',
    tags: ['architecture', 'mcp', 'design'],
    source: 'clipboard',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '3',
    content: 'Screenshot of Figma design — new dashboard layout with memory timeline, search bar, and privacy controls panel. Dark theme with purple accents.',
    tags: ['design', 'ui', 'figma'],
    source: 'screenshot',
    sourceApp: 'Figma',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: '4',
    content: 'Researching Tauri v2 system tray API — TrayIconBuilder with menu events. Need to handle show/hide of main window and quit action.',
    tags: ['research', 'tauri', 'system-tray'],
    source: 'browser',
    sourceApp: 'Arc',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: '5',
    content: 'Patent filing notes: Universal AI memory across operating systems. 38 pages covering cross-platform context persistence, semantic search, and privacy controls.',
    tags: ['patent', 'legal', 'important'],
    source: 'manual',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: '6',
    content: 'npm create tauri-app — scaffolding with React + TypeScript + Vite template. Adding tailwindcss, lucide-react for icons.',
    tags: ['setup', 'development'],
    source: 'clipboard',
    sourceApp: 'Terminal',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: '7',
    content: 'Meeting notes: Discussed ContextBridge monetization — Free tier (100 memories), Pro $9/mo unlimited, Teams $29/seat/mo. Focus on HackerNews launch and MCP directories for distribution.',
    tags: ['business', 'monetization', 'meeting'],
    source: 'manual',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: '8',
    content: 'Clipboard: export default defineConfig({ plugins: [react(), tailwindcss()], clearScreen: false, server: { port: 5173 } })',
    tags: ['code', 'config'],
    source: 'clipboard',
    sourceApp: 'VS Code',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

export const mockStats = {
  totalMemories: 247,
  memoriestoday: 18,
  storageUsed: '12.4 MB',
  avgPerDay: 23,
};
