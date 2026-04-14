# Goldfish

**Your AI finally has a memory.**

[![Download](https://img.shields.io/badge/Download-macOS-blue)](https://github.com/Nadreau/goldfish/releases/latest)
[![npm](https://img.shields.io/npm/v/goldfish-mcp)](https://www.npmjs.com/package/goldfish-mcp)
[![Patent Pending](https://img.shields.io/badge/Patent-Pending-orange)](https://www.uspto.gov)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](LICENSE)

Goldfish captures your desktop activity and gives any AI assistant persistent memory. Everything stays local on your machine.

> **macOS only** right now. Windows and Linux are planned — [star the repo](https://github.com/Nadreau/goldfish) to get notified.

- **Captures context** from your screen via OCR — knows what you're working on
- **Connects to any MCP-compatible AI** — Claude Desktop, Claude Code, Cursor, Windsurf
- **Local-first** — your memory database lives on your machine. Optional Gemini enhancement (BYO API key) is available for richer scene analysis; skip it and everything stays offline.
- **Works automatically** — your AI decides when to pull context, no copy-paste needed

## Download

**[Download Goldfish for macOS →](https://github.com/Nadreau/goldfish/releases/latest)**

> **macOS will block the app on first launch** since it isn't code-signed yet. After installing, run this in Terminal:
> ```bash
> xattr -cr /Applications/Goldfish.app
> ```
> Then open Goldfish normally.

## Quick Start

1. **Install** — Open the DMG, drag Goldfish to Applications
2. **Unblock** — Run `xattr -cr /Applications/Goldfish.app` in Terminal (one-time only)
3. **Launch** — Open Goldfish, follow the onboarding (set up Gemini API key for the vision engine)
4. **Connect your AI** — The onboarding auto-detects your installed AI tools and connects them

That's it. Open Claude Desktop or Cursor and your AI now has access to your screen memory.

## CLI Setup (Alternative)

If you prefer the command line, or want to connect additional tools:

```bash
npx goldfish-mcp setup
```

This auto-detects Claude Desktop, Claude Code, Cursor, and Windsurf, then writes their MCP config files. Restart your AI tool after running setup.

## How It Works

```
Goldfish Desktop App (captures screen → OCR → SQLite)
         │
         ▼
   ~/.goldfish/memories.db
         │
         ▼
   goldfish-mcp server (stdio, launched by your AI tool)
         │
         ▼
   Claude Desktop / Claude Code / Cursor / Windsurf
```

Your AI tool spawns `goldfish-mcp` as a local subprocess. The server reads your memory database and exposes three tools:

| Tool | What it does |
|------|-------------|
| `goldfish_context` | Recent activity — what apps you're using, what's on screen |
| `goldfish_recall` | Search memories by keyword or topic |
| `goldfish_summary` | Daily summary of everything you did |

Your AI calls these tools automatically when it thinks context would help.

## Manual MCP Configuration

If you want to configure MCP manually instead of using `npx goldfish-mcp setup`:

<details>
<summary>Claude Desktop</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "goldfish": {
      "command": "npx",
      "args": ["-y", "goldfish-mcp"]
    }
  }
}
```
</details>

<details>
<summary>Claude Code</summary>

Edit `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "goldfish": {
      "command": "npx",
      "args": ["-y", "goldfish-mcp"]
    }
  }
}
```
</details>

<details>
<summary>Cursor</summary>

Edit `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "goldfish": {
      "command": "npx",
      "args": ["-y", "goldfish-mcp"]
    }
  }
}
```
</details>

<details>
<summary>Windsurf</summary>

Edit `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "goldfish": {
      "command": "npx",
      "args": ["-y", "goldfish-mcp"]
    }
  }
}
```
</details>

## Development

```bash
git clone https://github.com/Nadreau/goldfish.git
cd goldfish
npm install

# Frontend only (browser)
npm run dev

# Full app (Tauri + React)
npm run tauri:dev

# Production build
npm run tauri:build
```

**Tech stack:** Tauri 2 (Rust) + React 19 + TypeScript + Tailwind CSS 4 + SQLite

## Intellectual Property

This project implements technology described in U.S. Provisional Patent Application No. 63/950,192 ("Universal AI Memory Across Operating Systems"), filed December 29, 2025.

## License

Apache 2.0 © 2025-2026 Nicholas Nadreau — see [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

---

*Built by [Niko Nadreau](https://github.com/Nadreau)*
