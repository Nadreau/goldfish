# ContextBridge Desktop App

**Universal AI Memory — Your context, everywhere.**

A beautiful desktop app to control your AI memory. Works alongside the ContextBridge MCP server to give any AI assistant persistent, cross-platform memory.

![Status](https://img.shields.io/badge/status-alpha-orange)
![Platform](https://img.shields.io/badge/platform-macOS-blue)

## Features

- 🧠 **Dashboard** — View all your memories in a clean timeline
- 🔍 **Semantic Search** — Find memories by content or tags
- 📋 **Clipboard Capture** — Save clipboard content as memories
- 🖥️ **Active Window Tracking** — Know which app created each memory
- 🔒 **Privacy Controls** — Choose what gets captured
- 📤 **Export/Import** — Backup and restore your memories
- 🗑️ **Delete All** — Full control over your data

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Rust + Tauri 2
- **Database:** SQLite (shared with MCP server at `~/.contextbridge/memories.db`)
- **Icons:** Lucide React

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npx tauri dev

# Build for production
npx tauri build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Dashboard  │  │   Privacy   │  │  Settings   │         │
│  │             │  │  Controls   │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                         │                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Rust Backend (Tauri Commands)          │   │
│  │  - get_all_memories    - save_memory               │   │
│  │  - search_memories     - delete_memory             │   │
│  │  - get_memory_stats    - capture_screenshot        │   │
│  │  - get_clipboard       - get_active_window         │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                    │
└─────────────────────────│────────────────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────────┐
            │   ~/.contextbridge/         │
            │      memories.db            │  ◄── Shared with MCP Server
            └─────────────────────────────┘
                          ▲
                          │
┌─────────────────────────│────────────────────────────────────┐
│                MCP Server (contextbridge)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Tools: save_memory, recall_memory, forget_memory,  │   │
│  │         list_memories                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ▲                                    │
└─────────────────────────│────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   Claude Desktop    ChatGPT (MCP)     Cursor IDE
```

## Database Schema

The app shares the SQLite database with the MCP server:

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,      -- TF-IDF vector for search
  tags TEXT NOT NULL,           -- JSON array
  source_app TEXT NOT NULL,     -- Which app saved this
  source TEXT,                  -- 'manual', 'clipboard', etc.
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Related

- [contextbridge](../contextbridge) — The MCP server
- [Patent](TODO) — Universal AI memory across operating systems

## License

MIT © Niko Nadreau
