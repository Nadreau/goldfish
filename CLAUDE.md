# Goldfish — Project Memory for Claude Code

## What This Is
Universal AI memory system — captures desktop context and makes it available to any AI assistant.
Your AI finally has a memory.
**Patent:** U.S. Provisional Patent Application No. 63/950,192 (filed Dec 29, 2025)
**Non-provisional deadline:** December 29, 2026

## Tech Stack
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Rust + Tauri 2
- **Database:** SQLite with TF-IDF vectors (at ~/.goldfish/memories.db)
- **Protocol:** Model Context Protocol (MCP)
- **Icons:** lucide-react
- **Routing:** react-router-dom v7
- **Theme:** Gold/amber accent palette

## Commands
```bash
npm run dev          # Vite dev server (frontend only)
npm run build        # TypeScript check + Vite build
npm run tauri:dev    # Full Tauri dev (Rust backend + React frontend)
npm run tauri:build  # Production build
npm run lint         # ESLint
```

## Project Structure
- `src/` — React frontend (dashboard, memory search, privacy controls, settings)
- `src-tauri/` — Rust backend (screen capture, clipboard monitoring, window tracking, SQLite)
- `extension/` — Chrome browser extension (auto-injects context into Claude.ai, ChatGPT)
- `extension-server/` — Node.js REST API (localhost:3030) bridging extension to SQLite
- `mcp-server/` — MCP server (goldfish-mcp) for AI tool integration

## MCP Server
- 3 tools: `goldfish_recall`, `goldfish_context`, `goldfish_summary`
- Local TF-IDF keyword matching
- Shared database with desktop app (better-sqlite3 with WAL support)

## Architecture
```
Desktop App (Tauri) → SQLite DB ← MCP Server → Any AI Client
                          ↑
Browser Extension → Extension Server (localhost:3030)
```

## Current Status (Mar 2026)
- Core capture working (OCR via Vision.framework)
- Memory storage functional (SQLite with tiered compaction)
- MCP server ready (goldfish-mcp)
- Browser extension built (needs testing)
- UI polished with gold/amber theme and Goldfish branding
- Animated goldfish overlay when minimized to tray
- Close-to-tray with dock/tray icon recovery

## Key Design Decisions
- Privacy-first: all data local, AES-256-GCM encryption, PII detection
- Zero-integration injection: works with any AI without their API
- Knowledge graph (semantic relationships) vs flat memory — this is the patent moat
- The moat is intelligent retrieval, not capture

## Patent Claims (5 defensive clusters)
1. Universal Multi-App Context Capture (Claims 1-8)
2. Semantic Knowledge Graph (Claims 9-16)
3. Zero-Integration AI Injection (Claims 25-32)
4. Privacy-First Local Architecture (Claims 33-40)
5. Local Model Fine-Tuning Pipeline (Claims 51-54)

## Related Files
- Patent docs: ~/Desktop/clawd/patent/
- Patent war room: ~/Desktop/Clawd Creations/patent-war-room/
- Full patent PDF: ~/Desktop/niko-patent.pdf
- Monetization plan: ~/Desktop/clawd/patent/monetization-plan-v2.md
- Competitive intel: ~/Desktop/clawd/patent/competitive-intel.md

## Niko's North Star
> "I want it to feel like there's just an AI that's watching my whole screen
> and that I'm able to interact with like a person"
>
> "I want to be able to type in very short what I am thinking
> and it be able to automatically consider the memory"
