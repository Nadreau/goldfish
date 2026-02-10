export type MemorySource = 'screenshot' | 'clipboard' | 'browser' | 'manual';

export interface Memory {
  id: string;
  title: string;
  content: string;
  source: MemorySource;
  tags: string[];
  timestamp: string;
  preview?: string;
}

export const mockMemories: Memory[] = [
  {
    id: '1',
    title: 'React Server Components Architecture',
    content: 'Explored the new React Server Components pattern. Key insight: RSCs render on the server and stream HTML to the client. They can access backend resources directly without API calls. Client components are still needed for interactivity. The mental model is: server components for data fetching, client components for state and effects.',
    source: 'browser',
    tags: ['react', 'architecture', 'frontend'],
    timestamp: '2025-01-27T14:32:00Z',
    preview: 'Explored the new React Server Components pattern. Key insight: RSCs render on the server...',
  },
  {
    id: '2',
    title: 'Meeting Notes: Q1 Planning',
    content: 'Q1 priorities discussed:\n1. Launch ContextBridge v1.0 by Feb 15\n2. Integrate with 3 major LLM providers\n3. Build Chrome extension for browser context capture\n4. Hire 2 senior engineers\n\nBudget approved for cloud infrastructure. Sarah will lead the Chrome extension effort.',
    source: 'manual',
    tags: ['meeting', 'planning', 'q1'],
    timestamp: '2025-01-27T11:00:00Z',
    preview: 'Q1 priorities discussed: Launch ContextBridge v1.0 by Feb 15...',
  },
  {
    id: '3',
    title: 'API Key for OpenAI Project',
    content: 'New API key generated for the ContextBridge embedding pipeline. Using text-embedding-3-small model. Rate limit: 3000 RPM. Cost estimate: ~$0.02 per 1M tokens.',
    source: 'clipboard',
    tags: ['api', 'openai', 'config'],
    timestamp: '2025-01-27T09:45:00Z',
    preview: 'New API key generated for the ContextBridge embedding pipeline...',
  },
  {
    id: '4',
    title: 'Figma Design Review Screenshot',
    content: 'Captured the latest Figma mockup for the ContextBridge dashboard. The new card layout uses a 3-column grid with gradient borders. Sidebar navigation is 64px wide with icon-only mode. Color palette confirmed: deep violet primary (#7c3aed), dark backgrounds (#11111b).',
    source: 'screenshot',
    tags: ['design', 'figma', 'ui'],
    timestamp: '2025-01-26T16:20:00Z',
    preview: 'Captured the latest Figma mockup for the ContextBridge dashboard...',
  },
  {
    id: '5',
    title: 'Docker Compose for Dev Environment',
    content: 'docker-compose.yml with PostgreSQL 16, Redis 7, and MinIO for local S3-compatible storage. Volumes mapped to ./data/ for persistence. Health checks configured for all services.',
    source: 'clipboard',
    tags: ['docker', 'devops', 'config'],
    timestamp: '2025-01-26T14:10:00Z',
    preview: 'docker-compose.yml with PostgreSQL 16, Redis 7, and MinIO...',
  },
  {
    id: '6',
    title: 'Rust Tauri IPC Pattern',
    content: 'Discovered an elegant pattern for Tauri IPC commands. Use invoke() with typed responses and error handling. The #[tauri::command] macro handles serialization automatically. For streaming data, use event system with app.emit_all().',
    source: 'browser',
    tags: ['rust', 'tauri', 'ipc'],
    timestamp: '2025-01-26T11:30:00Z',
    preview: 'Discovered an elegant pattern for Tauri IPC commands...',
  },
  {
    id: '7',
    title: 'VS Code with ContextBridge Plugin',
    content: 'Screenshot of VS Code running the ContextBridge plugin prototype. Shows the sidebar panel with recent memories, inline code suggestions based on past context, and the status bar indicator showing capture status.',
    source: 'screenshot',
    tags: ['vscode', 'plugin', 'prototype'],
    timestamp: '2025-01-26T09:15:00Z',
    preview: 'Screenshot of VS Code running the ContextBridge plugin prototype...',
  },
  {
    id: '8',
    title: 'Embedding Vector Dimensions Research',
    content: 'Compared embedding models:\n- text-embedding-3-small: 1536 dims, fast, cheap\n- text-embedding-3-large: 3072 dims, better quality\n- Cohere embed-v3: 1024 dims, multilingual\n\nConclusion: Start with OpenAI small, migrate to large if quality needs improve.',
    source: 'browser',
    tags: ['embeddings', 'research', 'ai'],
    timestamp: '2025-01-25T15:45:00Z',
    preview: 'Compared embedding models: text-embedding-3-small: 1536 dims...',
  },
  {
    id: '9',
    title: 'Slack Thread: Privacy Architecture',
    content: 'Key decisions from the privacy discussion:\n- All raw screenshots deleted after embedding extraction\n- Embeddings stored locally by default\n- Optional cloud sync with E2E encryption\n- User can export/delete all data at any time\n- GDPR compliant by design',
    source: 'clipboard',
    tags: ['privacy', 'architecture', 'slack'],
    timestamp: '2025-01-25T13:20:00Z',
    preview: 'Key decisions from the privacy discussion: All raw screenshots deleted...',
  },
  {
    id: '10',
    title: 'Terminal: Database Migration Output',
    content: 'Ran the initial database migration. Created tables: memories, embeddings, tags, sources, capture_sessions. All with proper indexes and foreign keys. Migration took 0.3s on SQLite.',
    source: 'screenshot',
    tags: ['database', 'migration', 'terminal'],
    timestamp: '2025-01-25T10:00:00Z',
    preview: 'Ran the initial database migration. Created tables: memories, embeddings...',
  },
  {
    id: '11',
    title: 'MCP Protocol Specification Notes',
    content: 'MCP (Model Context Protocol) key points:\n- JSON-RPC 2.0 based\n- Tools, Resources, and Prompts as primitives\n- Stateful sessions with capability negotiation\n- Transport agnostic (stdio, HTTP+SSE)\n\nContextBridge will expose memories as MCP resources.',
    source: 'browser',
    tags: ['mcp', 'protocol', 'specification'],
    timestamp: '2025-01-24T16:30:00Z',
    preview: 'MCP (Model Context Protocol) key points: JSON-RPC 2.0 based...',
  },
  {
    id: '12',
    title: 'Coffee Shop Whiteboard Ideas',
    content: 'Brainstorming session photo. Ideas captured:\n- "Memory lanes" - grouped context threads\n- Auto-tagging with LLM classification\n- "Time travel" slider to see context at any point\n- Ambient capture mode vs active capture\n- Privacy-first: process locally, store locally',
    source: 'screenshot',
    tags: ['brainstorm', 'ideas', 'product'],
    timestamp: '2025-01-24T14:00:00Z',
    preview: 'Brainstorming session photo. Ideas captured: Memory lanes...',
  },
  {
    id: '13',
    title: 'Tailwind CSS v4 Migration Guide',
    content: 'Tailwind v4 changes: CSS-first configuration, no more tailwind.config.js. Use @theme directive for custom values. Vite plugin replaces PostCSS. Automatic content detection. New color palette system.',
    source: 'browser',
    tags: ['tailwind', 'css', 'migration'],
    timestamp: '2025-01-24T11:15:00Z',
    preview: 'Tailwind v4 changes: CSS-first configuration, no more tailwind.config.js...',
  },
  {
    id: '14',
    title: 'GitHub Issue: Memory Deduplication',
    content: 'Opened issue #47 for memory deduplication. Proposed approach: compute cosine similarity on embeddings, merge memories with >0.95 similarity. Keep the richer content version. Add "merged from" metadata.',
    source: 'browser',
    tags: ['github', 'dedup', 'feature'],
    timestamp: '2025-01-23T17:00:00Z',
    preview: 'Opened issue #47 for memory deduplication. Proposed approach...',
  },
  {
    id: '15',
    title: 'Personal Note: Book Recommendation',
    content: 'Alex recommended "Designing Data-Intensive Applications" by Martin Kleppmann. Relevant chapters for ContextBridge: Ch 3 (Storage), Ch 5 (Replication), Ch 10 (Batch Processing). Available on O\'Reilly.',
    source: 'manual',
    tags: ['book', 'recommendation', 'learning'],
    timestamp: '2025-01-23T12:30:00Z',
    preview: 'Alex recommended "Designing Data-Intensive Applications"...',
  },
  {
    id: '16',
    title: 'Screenshot: Competitor Analysis',
    content: 'Captured comparison table of competitors: Rewind.ai (macOS only, $20/mo), Recall.ai (Windows, free beta), Mem.ai (notes focused, $10/mo). Our differentiator: MCP integration, cross-platform, privacy-first, open protocol.',
    source: 'screenshot',
    tags: ['competitors', 'analysis', 'market'],
    timestamp: '2025-01-23T09:45:00Z',
    preview: 'Captured comparison table of competitors: Rewind.ai, Recall.ai...',
  },
  {
    id: '17',
    title: 'Clipboard: SSH Config Snippet',
    content: 'Host contextbridge-staging\n  HostName 10.0.1.42\n  User deploy\n  IdentityFile ~/.ssh/cb_staging\n  ForwardAgent yes',
    source: 'clipboard',
    tags: ['ssh', 'config', 'staging'],
    timestamp: '2025-01-22T16:00:00Z',
    preview: 'Host contextbridge-staging HostName 10.0.1.42...',
  },
  {
    id: '18',
    title: 'Weekly Standup Summary',
    content: 'This week: Completed Tauri app scaffold, integrated SQLite via rusqlite, built initial capture pipeline for screenshots (macOS CGWindowListCreateImage). Next week: clipboard monitoring, browser extension MVP, and privacy controls UI.',
    source: 'manual',
    tags: ['standup', 'progress', 'weekly'],
    timestamp: '2025-01-22T10:00:00Z',
    preview: 'This week: Completed Tauri app scaffold, integrated SQLite...',
  },
];

export const getMemoriesToday = () => {
  const today = new Date().toISOString().split('T')[0];
  return mockMemories.filter(m => m.timestamp.startsWith(today));
};

export const getRecentMemories = (count: number) => mockMemories.slice(0, count);
