#!/usr/bin/env node

/**
 * Goldfish MCP Server
 *
 * Gives any MCP-compatible AI tool (Claude Desktop, Claude Code, Cursor,
 * Windsurf, etc.) access to the user's screen memory from Goldfish.
 *
 * The server reads from the same SQLite database that the Goldfish
 * desktop app writes to — no extra setup, no cloud, everything local.
 *
 * Tools:
 *   goldfish_recall   — Search memories by keyword/topic
 *   goldfish_context  — Smart context: recent activity, apps, current focus
 *   goldfish_summary  — Daily summary of what the user did
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { homedir, platform } from 'os';
import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

// ═══════════════════════════════════════════════════════════════════════════════
// CLI — setup, --help, --version
// ═══════════════════════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

// ANSI color helpers (no dependencies needed)
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgCyan: '\x1b[46m',
  bgBlue: '\x1b[44m',
};

/** Prompt the user for yes/no confirmation (returns true for yes) */
function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

interface ToolConfig {
  name: string;
  configPath: string;
  format: 'standard' | 'claudecode' | 'skip';
}

function getToolConfigs(): ToolConfig[] {
  const home = homedir();
  const isMac = platform() === 'darwin';
  const isWin = platform() === 'win32';

  const tools: ToolConfig[] = [];

  // Claude Desktop
  if (isMac) {
    tools.push({
      name: 'Claude Desktop',
      configPath: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      format: 'standard',
    });
  } else if (isWin) {
    tools.push({
      name: 'Claude Desktop',
      configPath: join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json'),
      format: 'standard',
    });
  }

  // Claude Code
  tools.push({
    name: 'Claude Code',
    configPath: join(home, '.claude', 'mcp.json'),
    format: 'claudecode',
  });

  // Cursor
  tools.push({
    name: 'Cursor',
    configPath: join(home, '.cursor', 'mcp.json'),
    format: 'standard',
  });

  // Windsurf
  tools.push({
    name: 'Windsurf',
    configPath: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    format: 'standard',
  });

  // VS Code (Continue) — detect only, skip config
  tools.push({
    name: 'VS Code (Continue)',
    configPath: join(home, '.continue', 'config.json'),
    format: 'skip',
  });

  return tools;
}

type ToolStatus = 'connected' | 'ready' | 'not_installed';

function getToolStatus(tool: ToolConfig): ToolStatus {
  if (!existsSync(tool.configPath)) {
    // For Claude Code, check if the directory exists (the file might not yet)
    const dir = dirname(tool.configPath);
    if (existsSync(dir) && tool.format !== 'skip') {
      return 'ready';
    }
    return 'not_installed';
  }

  // File exists — check if goldfish is already configured
  try {
    const raw = readFileSync(tool.configPath, 'utf-8');
    const config = JSON.parse(raw);
    const servers = config.mcpServers || config.mcpservers || {};
    if (servers.goldfish) {
      return 'connected';
    }
    return 'ready';
  } catch {
    // File exists but is invalid JSON — treat as ready (we'll overwrite)
    return 'ready';
  }
}

function statusIcon(status: ToolStatus): string {
  switch (status) {
    case 'connected': return '\u2705';      // white check in green box
    case 'ready': return '\u{1F50C}';        // electric plug
    case 'not_installed': return '\u26AA';    // white circle
  }
}

function statusLabel(status: ToolStatus): string {
  switch (status) {
    case 'connected': return 'Already connected';
    case 'ready': return 'Ready to connect';
    case 'not_installed': return 'Not installed';
  }
}

const GOLDFISH_MCP_ENTRY = {
  command: 'npx',
  args: ['-y', 'goldfish-mcp'],
};

function connectTool(tool: ToolConfig): boolean {
  if (tool.format === 'skip') return false;

  try {
    let config: any;

    if (existsSync(tool.configPath)) {
      try {
        const raw = readFileSync(tool.configPath, 'utf-8');
        config = JSON.parse(raw);
      } catch {
        config = {};
      }
    } else {
      config = {};
      // Ensure directory exists
      const dir = dirname(tool.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Ensure mcpServers key exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Add goldfish entry
    config.mcpServers.goldfish = { ...GOLDFISH_MCP_ENTRY };

    // Write back with pretty formatting
    writeFileSync(tool.configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return true;
  } catch (err: any) {
    console.error(`  ${c.red}Error configuring ${tool.name}: ${err.message}${c.reset}`);
    return false;
  }
}

async function runSetup(autoYes: boolean): Promise<void> {
  const home = homedir();
  const dbPath = join(home, '.goldfish', 'memories.db');

  // ── Header ──
  console.log();
  console.log(`  ${c.bold}${c.cyan}\u{1F420} Goldfish Setup${c.reset}`);
  console.log(`  ${c.dim}Connect your AI tools to your screen memory${c.reset}`);
  console.log();

  // ── Check database ──
  if (!existsSync(dbPath)) {
    console.log(`  ${c.yellow}\u26A0  Goldfish desktop app hasn't been run yet.${c.reset}`);
    console.log(`  ${c.dim}Install it first from ${c.cyan}https://github.com/Nadreau/goldfish${c.reset}`);
    console.log();
    console.log(`  ${c.dim}Setup will still configure your AI tools so they're ready${c.reset}`);
    console.log(`  ${c.dim}when you install the desktop app.${c.reset}`);
    console.log();
  } else {
    console.log(`  ${c.green}\u2713${c.reset} Goldfish database found at ${c.dim}${dbPath}${c.reset}`);
    console.log();
  }

  // ── Detect tools ──
  const tools = getToolConfigs();
  const statuses = tools.map(t => ({ tool: t, status: getToolStatus(t) }));

  console.log(`  ${c.bold}Detected AI Tools:${c.reset}`);
  console.log();

  for (const { tool, status } of statuses) {
    const icon = statusIcon(status);
    const label = statusLabel(status);
    const nameStr = `${c.bold}${tool.name}${c.reset}`;
    const statusColor = status === 'connected' ? c.green : status === 'ready' ? c.yellow : c.dim;
    console.log(`  ${icon}  ${nameStr}  ${statusColor}${label}${c.reset}`);
    if (status !== 'not_installed') {
      console.log(`     ${c.dim}${tool.configPath}${c.reset}`);
    }
  }
  console.log();

  // ── Connect tools ──
  const toConnect = statuses.filter(s => s.status === 'ready' && s.tool.format !== 'skip');

  if (toConnect.length === 0) {
    const connectedCount = statuses.filter(s => s.status === 'connected').length;
    if (connectedCount > 0) {
      console.log(`  ${c.green}\u2713 Already connected to ${connectedCount} tool${connectedCount > 1 ? 's' : ''}. You're all set!${c.reset}`);
    } else {
      console.log(`  ${c.dim}No AI tools found to configure. Install one of the supported tools first.${c.reset}`);
    }
    console.log();
    return;
  }

  // Ask for confirmation unless --yes
  const toolNames = toConnect.map(s => s.tool.name).join(', ');
  let shouldConnect = autoYes;

  if (!autoYes) {
    console.log(`  ${c.bold}Ready to connect Goldfish to: ${c.cyan}${toolNames}${c.reset}`);
    console.log();
    shouldConnect = await confirm(`  ${c.bold}Proceed? ${c.dim}(Y/n)${c.reset} `);
    console.log();
  }

  if (!shouldConnect) {
    console.log(`  ${c.dim}Setup cancelled. Run again when you're ready.${c.reset}`);
    console.log();
    return;
  }

  // Perform connections
  let connectedCount = 0;
  for (const { tool } of toConnect) {
    process.stdout.write(`  Configuring ${c.bold}${tool.name}${c.reset}... `);
    if (connectTool(tool)) {
      console.log(`${c.green}\u2713${c.reset}`);
      connectedCount++;
    } else {
      console.log(`${c.red}\u2717${c.reset}`);
    }
  }

  const alreadyConnected = statuses.filter(s => s.status === 'connected').length;
  const total = connectedCount + alreadyConnected;

  console.log();
  console.log(`  ${c.green}${c.bold}\u2705 Connected to ${total} tool${total > 1 ? 's' : ''}.${c.reset} Restart them to activate Goldfish.`);
  console.log();
  console.log(`  ${c.dim}Config added:${c.reset}`);
  console.log(`  ${c.dim}"goldfish": { "command": "npx", "args": ["-y", "goldfish-mcp"] }${c.reset}`);
  console.log();
}

function printHelp(): void {
  console.log();
  console.log(`  ${c.bold}${c.cyan}\u{1F420} goldfish-mcp${c.reset} v${PKG_VERSION}`);
  console.log(`  ${c.dim}MCP server for Goldfish — your AI finally has a memory${c.reset}`);
  console.log();
  console.log(`  ${c.bold}USAGE${c.reset}`);
  console.log(`    ${c.cyan}npx goldfish-mcp${c.reset}              Start the MCP server (stdio)`);
  console.log(`    ${c.cyan}npx goldfish-mcp setup${c.reset}        Configure AI tools to use Goldfish`);
  console.log(`    ${c.cyan}npx goldfish-mcp setup -y${c.reset}     Auto-connect without prompting`);
  console.log(`    ${c.cyan}npx goldfish-mcp --help${c.reset}       Show this help message`);
  console.log(`    ${c.cyan}npx goldfish-mcp --version${c.reset}    Show version number`);
  console.log();
  console.log(`  ${c.bold}TOOLS PROVIDED${c.reset}`);
  console.log(`    ${c.green}goldfish_recall${c.reset}    Search screen memory by keyword/topic`);
  console.log(`    ${c.green}goldfish_context${c.reset}   Get current activity and focus`);
  console.log(`    ${c.green}goldfish_summary${c.reset}   Get a full daily summary`);
  console.log();
  console.log(`  ${c.bold}SUPPORTED AI CLIENTS${c.reset}`);
  console.log(`    Claude Desktop, Claude Code, Cursor, Windsurf`);
  console.log();
  console.log(`  ${c.dim}https://github.com/Nadreau/goldfish${c.reset}`);
  console.log();
}

function printVersion(): void {
  console.log(PKG_VERSION);
}

/** Handle CLI subcommands. Returns true if a CLI command was handled (caller should exit). */
async function handleCli(): Promise<boolean> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return true;
  }

  if (args.includes('--version') || args.includes('-v')) {
    printVersion();
    return true;
  }

  if (args.includes('setup')) {
    const autoYes = args.includes('--yes') || args.includes('-y');
    await runSetup(autoYes);
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Database — uses better-sqlite3 which properly reads WAL mode databases
// ═══════════════════════════════════════════════════════════════════════════════

const DB_PATH = join(homedir(), '.goldfish', 'memories.db');
let db: Database.Database | null = null;

/** Open (or return existing) database connection */
function getDb(): Database.Database {
  if (db) return db;

  if (!existsSync(DB_PATH)) {
    throw new Error(
      `Goldfish database not found at ${DB_PATH}. ` +
      `Make sure the Goldfish desktop app is running.`
    );
  }

  // Open read-only — the Goldfish desktop app owns writes
  db = new Database(DB_PATH, { readonly: true });
  // Ensure we can read WAL-mode databases written by the Rust backend
  db.pragma('journal_mode = WAL');
  return db;
}

interface MemoryRow {
  id: string;
  content: string;
  tags: string;
  source: string;
  source_app: string | null;
  timestamp: string;
  memory_tier: string | null;
  importance: number | null;
  [key: string]: any;
}

function queryAll(sql: string, params: any[] = []): MemoryRow[] {
  const database = getDb();
  return database.prepare(sql).all(...params) as MemoryRow[];
}

function queryOne(sql: string, params: any[] = []): any {
  const database = getDb();
  return database.prepare(sql).get(...params);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'when', 'where', 'why', 'how', 'help', 'me', 'my', 'please', 'about',
  'for', 'with', 'from', 'into', 'on', 'at', 'to', 'in', 'of', 'and',
  'or', 'not', 'but', 'if', 'than', 'then', 'so', 'just', 'very',
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function formatMemory(m: MemoryRow): string {
  const time = new Date(m.timestamp).toLocaleString();
  const app = m.source_app || 'Unknown';
  const tier = m.memory_tier || 'hot';
  return `[${time}] ${app} (${m.source}, ${tier}):\n${m.content}`;
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Server
// ═══════════════════════════════════════════════════════════════════════════════

const server = new McpServer(
  {
    name: 'goldfish',
    version: '0.1.0',
  },
  {
    instructions: `You have access to Goldfish — the user's AI memory. Goldfish continuously watches the user's screen via OCR and knows every app, file, website, document, and conversation they've looked at.

CRITICAL RULES:
1. ALWAYS call goldfish_context at the START of every conversation to understand what the user is working on right now. Do this before responding to their first message.
2. ALWAYS call goldfish_recall when the user mentions ANY project, file, person, website, app, or past work. Never ask "what project?" or "can you give me more context?" — check Goldfish first.
3. The user expects you to already know their context. They should never have to explain something Goldfish already captured.
4. When uncertain about what the user is referring to, search Goldfish before asking clarifying questions.`,
  }
);

// ─── Tool: goldfish_recall ─────────────────────────────────────────────────────
// Search memories by keyword/topic. The AI calls this when it needs to know
// about something specific the user was looking at or working on.

server.tool(
  'goldfish_recall',
  `Search the user's screen memory. IMPORTANT: Call this tool whenever the user mentions a project, file, codebase, website, app, meeting, or any past work — Goldfish has been continuously recording their screen and can tell you exactly what they were looking at. This is the user's photographic memory. If they reference something and you don't have context, check here first before asking them to explain.`,
  {
    query: z.string().describe('What to search for — a project name, app, file, URL, person, topic, or keyword the user mentioned'),
    limit: z.number().optional().default(15).describe('Max results to return (default 15)'),
  },
  async ({ query, limit }) => {
    try {
      const keywords = extractKeywords(query);
      if (keywords.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No meaningful search terms found. Try a more specific query.' }] };
      }

      // Get recent memories and score them
      const all = queryAll(`
        SELECT id, content, tags, source, source_app, created_at as timestamp,
               memory_tier, importance
        FROM memories
        ORDER BY created_at DESC
        LIMIT 500
      `);

      const scored = all.map(m => {
        const content = m.content.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (content.includes(kw)) score += 1;
          if (m.source_app?.toLowerCase().includes(kw)) score += 2;
          if (m.tags?.toLowerCase().includes(kw)) score += 1;
        }
        // Boost scene analyses and compacted summaries
        if (m.source === 'scene-analysis' || m.source === 'compacted') score += 1;
        // Recency bonus
        const hours = (Date.now() - new Date(m.timestamp).getTime()) / 3600000;
        if (hours < 1) score += 3;
        else if (hours < 6) score += 2;
        else if (hours < 24) score += 1;
        return { ...m, score };
      });

      const results = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No memories found matching "${query}". The user may not have been working on this topic recently.` }] };
      }

      const output = results.map(m => formatMemory(m)).join('\n\n---\n\n');
      return {
        content: [{
          type: 'text' as const,
          text: `Found ${results.length} memories matching "${query}":\n\n${output}`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: goldfish_context ────────────────────────────────────────────────────
// Smart context dump — what the user is doing right now + recent activity.
// The AI calls this to get situational awareness at the start of a conversation.

server.tool(
  'goldfish_context',
  `Get what the user is doing RIGHT NOW — their active apps, recent screen activity, and current focus. Call this at the start of any conversation to understand what the user has been working on. This gives you situational awareness so you can provide relevant help without the user having to explain their context. Think of this as looking over their shoulder.`,
  {
    hours: z.number().optional().default(2).describe('How many hours back to look (default 2)'),
  },
  async ({ hours }) => {
    try {
      const cutoff = new Date(Date.now() - hours * 3600000).toISOString();

      // Get scene analyses (high-signal summaries)
      const scenes = queryAll(`
        SELECT id, content, tags, source, source_app, created_at as timestamp,
               memory_tier, importance
        FROM memories
        WHERE source = 'scene-analysis' AND created_at > ?
        ORDER BY created_at DESC
        LIMIT 10
      `, [cutoff]);

      // Get raw captures for current focus
      const recent = queryAll(`
        SELECT id, content, tags, source, source_app, created_at as timestamp,
               memory_tier, importance
        FROM memories
        WHERE source != 'scene-analysis' AND created_at > ?
        ORDER BY created_at DESC
        LIMIT 20
      `, [cutoff]);

      // Get active apps
      const apps = queryAll(`
        SELECT source_app, COUNT(*) as count,
               MAX(created_at) as last_seen
        FROM memories
        WHERE created_at > ? AND source_app IS NOT NULL AND source_app != ''
        GROUP BY source_app
        ORDER BY count DESC
        LIMIT 10
      `, [cutoff]);

      // Get memory stats
      const stats = queryOne(`SELECT COUNT(*) as total FROM memories`);
      const tierStats = queryAll(`
        SELECT memory_tier, COUNT(*) as count
        FROM memories
        GROUP BY memory_tier
      `);

      let output = `# User Context (last ${hours} hours)\n\n`;

      // Active apps
      if (apps.length > 0) {
        output += `## Active Apps\n`;
        for (const app of apps) {
          const lastSeen = formatRelativeTime(new Date(app.last_seen));
          output += `- **${app.source_app}** — ${app.count} captures, last seen ${lastSeen}\n`;
        }
        output += '\n';
      }

      // Scene summaries (AI-analyzed activity)
      if (scenes.length > 0) {
        output += `## Activity Summaries\n`;
        for (const s of scenes) {
          const time = formatRelativeTime(new Date(s.timestamp));
          output += `### ${time}\n${s.content}\n\n`;
        }
      }

      // Recent raw captures (truncated for token efficiency)
      if (recent.length > 0) {
        output += `## Recent Screen Captures\n`;
        for (const m of recent.slice(0, 10)) {
          const time = formatRelativeTime(new Date(m.timestamp));
          const preview = m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content;
          output += `[${time}] ${m.source_app || 'Unknown'}:\n${preview}\n\n`;
        }
      }

      // Stats
      output += `## Memory Stats\n`;
      output += `- Total memories: ${stats?.total || 0}\n`;
      for (const t of tierStats) {
        output += `- ${t.memory_tier || 'untiered'}: ${t.count}\n`;
      }

      return { content: [{ type: 'text' as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: goldfish_summary ────────────────────────────────────────────────────
// Daily summary of what the user did. Pulls from cold tier (daily summaries)
// or synthesizes from available data.

server.tool(
  'goldfish_summary',
  `Get a full summary of the user's day — apps used, projects worked on, websites visited, meetings attended, and key activities. Call this when the user asks "what did I do today?", "what was I working on?", "recap my day", or anything about their recent work history.`,
  {
    date: z.string().optional().describe('Date to summarize in YYYY-MM-DD format. Defaults to today.'),
  },
  async ({ date }) => {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const startOfDay = `${targetDate}T00:00:00`;
      const endOfDay = `${targetDate}T23:59:59`;

      // Check for cold tier (pre-computed daily summaries)
      const coldSummaries = queryAll(`
        SELECT id, content, tags, source, source_app, created_at as timestamp,
               memory_tier, importance
        FROM memories
        WHERE memory_tier = 'cold' AND created_at BETWEEN ? AND ?
        ORDER BY created_at ASC
      `, [startOfDay, endOfDay]);

      // Get scene analyses for the day
      const scenes = queryAll(`
        SELECT id, content, tags, source, source_app, created_at as timestamp,
               memory_tier, importance
        FROM memories
        WHERE source = 'scene-analysis' AND created_at BETWEEN ? AND ?
        ORDER BY created_at ASC
      `, [startOfDay, endOfDay]);

      // Get app usage stats
      const apps = queryAll(`
        SELECT source_app, COUNT(*) as count,
               MIN(created_at) as first_seen,
               MAX(created_at) as last_seen
        FROM memories
        WHERE created_at BETWEEN ? AND ? AND source_app IS NOT NULL AND source_app != ''
        GROUP BY source_app
        ORDER BY count DESC
      `, [startOfDay, endOfDay]);

      // Total captures
      const totalRow = queryOne(`
        SELECT COUNT(*) as total FROM memories
        WHERE created_at BETWEEN ? AND ?
      `, [startOfDay, endOfDay]);

      const isToday = targetDate === new Date().toISOString().split('T')[0];
      let output = `# ${isToday ? "Today's" : targetDate} Summary\n\n`;
      output += `Total captures: ${totalRow?.total || 0}\n\n`;

      // App breakdown
      if (apps.length > 0) {
        output += `## Apps Used\n`;
        for (const app of apps) {
          const firstTime = new Date(app.first_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const lastTime = new Date(app.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          output += `- **${app.source_app}** — ${app.count} captures (${firstTime} – ${lastTime})\n`;
        }
        output += '\n';
      }

      // Daily summaries (cold tier)
      if (coldSummaries.length > 0) {
        output += `## Daily Summaries\n`;
        for (const s of coldSummaries) {
          output += `${s.content}\n\n`;
        }
      }

      // Scene summaries
      if (scenes.length > 0) {
        output += `## Activity Timeline\n`;
        for (const s of scenes) {
          const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const firstLine = s.content.split('\n')[0].replace('## ', '');
          output += `- **${time}** — ${firstLine}\n`;
        }
        output += '\n';
      }

      if (apps.length === 0 && scenes.length === 0) {
        output += `No activity recorded for ${targetDate}.\n`;
      }

      return { content: [{ type: 'text' as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Prompts — Selectable prompt templates for AI clients
// ═══════════════════════════════════════════════════════════════════════════════

server.prompt(
  'goldfish-context',
  'Load your screen memory — gives the AI full context about what you\'ve been working on',
  async () => {
    try {
      const cutoff = new Date(Date.now() - 2 * 3600000).toISOString();

      const scenes = queryAll(`
        SELECT content, source_app, created_at as timestamp
        FROM memories
        WHERE source = 'scene-analysis' AND created_at > ?
        ORDER BY created_at DESC LIMIT 5
      `, [cutoff]);

      const apps = queryAll(`
        SELECT source_app, COUNT(*) as count, MAX(created_at) as last_seen
        FROM memories
        WHERE created_at > ? AND source_app IS NOT NULL AND source_app != ''
        GROUP BY source_app ORDER BY count DESC LIMIT 8
      `, [cutoff]);

      let context = `You have access to the user's screen memory via Goldfish. Here's what they've been doing:\n\n`;

      if (apps.length > 0) {
        context += `Active apps: ${apps.map(a => `${a.source_app} (${a.count} captures)`).join(', ')}\n\n`;
      }

      if (scenes.length > 0) {
        context += `Recent activity:\n`;
        for (const s of scenes) {
          const time = formatRelativeTime(new Date(s.timestamp));
          context += `[${time}] ${s.content}\n\n`;
        }
      }

      context += `\nUse goldfish_recall to search for specific topics, goldfish_context for more detail, and goldfish_summary for daily recaps.`;

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: context },
        }],
      };
    } catch {
      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: 'Goldfish is connected but no memories are available yet. Start the desktop app and let it capture some screen activity first.' },
        }],
      };
    }
  }
);

server.prompt(
  'goldfish-search',
  'Search your screen memory for a specific topic',
  { query: z.string().describe('What to search for') },
  async ({ query }) => {
    return {
      messages: [{
        role: 'user' as const,
        content: { type: 'text' as const, text: `Search my screen memory for: ${query}` },
      }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Resources — Auto-surfaced context for compatible clients
// ═══════════════════════════════════════════════════════════════════════════════

server.resource(
  'recent-activity',
  'goldfish://activity/recent',
  { description: 'Live snapshot of the user\'s recent screen activity from Goldfish', mimeType: 'text/plain' },
  async () => {
    try {
      const cutoff = new Date(Date.now() - 1 * 3600000).toISOString();

      const scenes = queryAll(`
        SELECT content, source_app, created_at as timestamp
        FROM memories
        WHERE source = 'scene-analysis' AND created_at > ?
        ORDER BY created_at DESC LIMIT 5
      `, [cutoff]);

      const apps = queryAll(`
        SELECT source_app, COUNT(*) as count
        FROM memories
        WHERE created_at > ? AND source_app IS NOT NULL AND source_app != ''
        GROUP BY source_app ORDER BY count DESC LIMIT 5
      `, [cutoff]);

      let text = `# Goldfish — Recent Activity (last hour)\n\n`;

      if (apps.length > 0) {
        text += `Apps: ${apps.map(a => `${a.source_app} (${a.count})`).join(', ')}\n\n`;
      }

      if (scenes.length > 0) {
        for (const s of scenes) {
          const time = formatRelativeTime(new Date(s.timestamp));
          const firstLine = s.content.split('\n')[0].replace('## ', '');
          text += `- [${time}] ${s.source_app}: ${firstLine}\n`;
        }
      } else {
        text += 'No recent activity captured.\n';
      }

      return { contents: [{ uri: 'goldfish://activity/recent', text, mimeType: 'text/plain' }] };
    } catch {
      return { contents: [{ uri: 'goldfish://activity/recent', text: 'Goldfish not available.', mimeType: 'text/plain' }] };
    }
  }
);

server.resource(
  'memory-stats',
  'goldfish://stats',
  { description: 'Goldfish memory database statistics', mimeType: 'text/plain' },
  async () => {
    try {
      const stats = queryOne(`SELECT COUNT(*) as total FROM memories`);
      const today = new Date().toISOString().split('T')[0];
      const todayCount = queryOne(`SELECT COUNT(*) as count FROM memories WHERE created_at >= '${today}T00:00:00'`);
      const tierStats = queryAll(`SELECT memory_tier, COUNT(*) as count FROM memories GROUP BY memory_tier`);

      let text = `Goldfish Memory Stats:\n`;
      text += `Total: ${stats?.total || 0} memories\n`;
      text += `Today: ${todayCount?.count || 0} captures\n`;
      for (const t of tierStats) {
        text += `${t.memory_tier || 'untiered'}: ${t.count}\n`;
      }

      return { contents: [{ uri: 'goldfish://stats', text, mimeType: 'text/plain' }] };
    } catch {
      return { contents: [{ uri: 'goldfish://stats', text: 'Goldfish not available.', mimeType: 'text/plain' }] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  // Check for CLI subcommands (setup, --help, --version) before starting MCP server
  const handled = await handleCli();
  if (handled) {
    process.exit(0);
  }

  // Verify database exists
  if (!existsSync(DB_PATH)) {
    console.error(
      `[Goldfish MCP] Database not found at ${DB_PATH}\n` +
      `Make sure the Goldfish desktop app has been run at least once.`
    );
  } else {
    // Pre-load database to verify it works
    getDb();
    const stats = queryOne(`SELECT COUNT(*) as total FROM memories`);
    console.error(`[Goldfish MCP] Loaded ${DB_PATH} (${stats?.total || 0} memories)`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Goldfish MCP] Server running on stdio');
}

main().catch(err => {
  console.error(`[Goldfish MCP] Fatal: ${err.message}`);
  process.exit(1);
});
