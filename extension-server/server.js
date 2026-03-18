/**
 * Goldfish HTTP API Server
 *
 * Provides REST API for the browser extension to query memories.
 * Reads from the same SQLite database as the Tauri app.
 * Uses better-sqlite3 for proper WAL mode support.
 *
 * Endpoints:
 *   GET /health        - Health check
 *   GET /stats         - Memory statistics
 *   GET /memories      - Get all memories (with ?limit=N)
 *   GET /search        - Search memories (with ?q=query&limit=N)
 *   GET /semantic-search - Semantic search (with ?q=query&limit=N)
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3030;
const DB_PATH = join(homedir(), '.goldfish', 'memories.db');

// ═══════════════════════════════════════════════════════════════════════════════
// Database Setup (using better-sqlite3 — native SQLite with WAL support)
// ═══════════════════════════════════════════════════════════════════════════════

let db;

function initDatabase() {
  if (!existsSync(DB_PATH)) {
    console.log(`[Goldfish API] Database not found at ${DB_PATH} — waiting for Goldfish app`);
    return null;
  }

  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
  const count = db.prepare('SELECT COUNT(*) as total FROM memories').get();
  console.log(`[Goldfish API] Loaded database from ${DB_PATH} (${count.total} memories)`);
  return db;
}

function getDb() {
  if (db) return db;
  if (existsSync(DB_PATH)) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  if (!db) throw new Error('Database not available');
  return db;
}

function queryAll(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Express Setup
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));

app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  try {
    queryOne('SELECT 1 as ok');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

app.get('/stats', (req, res) => {
  try {
    const total = queryOne('SELECT COUNT(*) as count FROM memories');
    const today = new Date().toISOString().split('T')[0];
    const todayCount = queryOne(
      "SELECT COUNT(*) as count FROM memories WHERE created_at LIKE ?",
      [`${today}%`]
    );
    const sources = queryAll(
      'SELECT source, COUNT(*) as count FROM memories GROUP BY source'
    );
    const sourceMap = {};
    for (const row of sources) {
      sourceMap[row.source || 'unknown'] = row.count;
    }
    res.json({
      total_memories: total?.count || 0,
      memories_today: todayCount?.count || 0,
      sources: sourceMap,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/memories', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 1000);
    const memories = queryAll(`
      SELECT id, content, tags, source_app, source, created_at as timestamp
      FROM memories
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    const parsed = memories.map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]'),
    }));
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    if (!query) return res.json([]);

    const pattern = `%${query.toLowerCase()}%`;
    const memories = queryAll(`
      SELECT id, content, tags, source_app, source, created_at as timestamp
      FROM memories
      WHERE LOWER(content) LIKE ? OR LOWER(tags) LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [pattern, pattern, limit]);
    const parsed = memories.map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]'),
    }));
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/semantic-search', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    if (!query) return res.json([]);

    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
      'when', 'where', 'why', 'how', 'help', 'me', 'my', 'please'
    ]);

    const keywords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    if (keywords.length === 0) return res.json([]);

    const allMemories = queryAll(`
      SELECT id, content, tags, source_app, source, created_at as timestamp
      FROM memories
      ORDER BY created_at DESC
      LIMIT 500
    `);

    const scored = allMemories.map(memory => {
      const content = memory.content.toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
          if (memory.source_app?.toLowerCase().includes(keyword)) score += 2;
        }
      }
      const hoursSince = (Date.now() - new Date(memory.timestamp).getTime()) / 3600000;
      if (hoursSince < 1) score += 3;
      else if (hoursSince < 24) score += 2;
      else if (hoursSince < 72) score += 1;
      return { ...memory, score };
    });

    const results = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(m => ({
        id: m.id,
        content: m.content,
        tags: JSON.parse(m.tags || '[]'),
        source_app: m.source_app,
        source: m.source,
        timestamp: m.timestamp,
        relevance_score: m.score,
      }));

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[Goldfish API] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════════════

function main() {
  initDatabase();
  app.listen(PORT, () => {
    console.log(`[Goldfish API] Running on http://localhost:${PORT}`);
    console.log(`[Goldfish API] Database: ${DB_PATH}`);
  });
}

main();

process.on('SIGINT', () => {
  console.log('\n[Goldfish API] Shutting down...');
  if (db) db.close();
  process.exit(0);
});
