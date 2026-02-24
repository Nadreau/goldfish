# ContextBridge

**Universal AI Memory — Your context, everywhere.**

[![Patent Pending](https://img.shields.io/badge/Patent-Pending-blue)](https://www.uspto.gov)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://www.apple.com/macos)
[![Status](https://img.shields.io/badge/status-alpha-orange)](#)

ContextBridge is an OS-level memory system that enables AI assistants to maintain persistent, privacy-first context across all your applications and devices.

## The Problem

Every AI conversation starts from zero. Your AI doesn't remember what you worked on yesterday, what files you opened, or the context that matters. You waste time re-explaining.

## The Solution

ContextBridge provides a **universal memory layer** that:

- 🧠 **Captures context** from your desktop activity (privacy-controlled)
- 🔍 **Enables semantic search** across all your memories
- 🔗 **Works with any AI** via MCP (Model Context Protocol)
- 🔒 **Keeps data local** — your memories never leave your machine
- 📱 **Syncs across devices** (coming soon)

Unlike app-specific memory solutions, ContextBridge operates at the **operating system level**, providing universal context regardless of which AI assistant you use.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Any AI Assistant                         │
│         (Claude, ChatGPT, Cursor, Custom)                │
└────────────────────────┬─────────────────────────────────┘
                         │ MCP Protocol
                         ▼
┌──────────────────────────────────────────────────────────┐
│                ContextBridge MCP Server                   │
│  save_memory | recall_memory | search | forget           │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Universal Memory Store                       │
│     ~/.contextbridge/memories.db (SQLite + Vectors)      │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│            ContextBridge Desktop App                      │
│  Dashboard | Privacy Controls | Search | Export          │
│        Screen Recording | Clipboard Capture              │
└──────────────────────────────────────────────────────────┘
```

## Features

### Memory Capture
- **Clipboard monitoring** — Automatically save copied content
- **Screen recording** — Continuous visual context (privacy-controlled)
- **Active window tracking** — Know which app created each memory
- **Manual notes** — Add context yourself

### Privacy First
- All data stored locally in SQLite
- Granular controls over what gets captured
- Easy deletion (individual or bulk)
- Full data export

### AI Integration
- Works via MCP with Claude Desktop, Cursor, and any MCP-compatible client
- Semantic search over memories
- Tag-based organization
- Source attribution

## Installation

*Alpha release coming soon. Star the repo to be notified.*

## Development

```bash
# Clone the repo
git clone https://github.com/Nadreau/contextbridge.git
cd contextbridge

# Install dependencies
npm install

# Run in development mode
npx tauri dev

# Build for production
npx tauri build
```

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Rust + Tauri 2
- **Database:** SQLite with TF-IDF vectors
- **Protocol:** Model Context Protocol (MCP)

## Related Work

ContextBridge differs from existing solutions:

| Solution | Scope | Privacy | AI Integration |
|----------|-------|---------|----------------|
| Apple Continuity | Clipboard only | Local | None |
| Windows Recall | Screenshots | Cloud | Windows Copilot only |
| Rewind.ai | Mac recordings | Local | App-specific |
| **ContextBridge** | **Universal memory** | **Local** | **Any AI via MCP** |

## Intellectual Property

This project implements technology described in U.S. Provisional Patent Application No. 63/950,192 ("Universal AI Memory Across Operating Systems"), filed December 29, 2025.

## License

MIT © 2025-2026 Nicholas Nadreau

---

*Built by [Niko Nadreau](https://github.com/Nadreau)*
