/**
 * ContextBridge HTTP API Server
 * 
 * Provides REST API for the browser extension to query memories.
 * Reads from the same SQLite database as the Tauri app.
 * 
 * Endpoints:
 *   GET /health        - Health check
 *   GET /stats         - Memory statistics
 *   GET /memories      - Get all memories (with ?limit=N)
 *   GET /search        - Search memories (with ?q=query&limit=N)
 */

import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, readFileSync, watchFile } from 'fs';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3030;
const DB_PATH = join(homedir(), '.contextbridge', 'memories.db');

// ═══════════════════════════════════════════════════════════════════════════════
// Database Setup (using sql.js - pure JS SQLite)
// ═══════════════════════════════════════════════════════════════════════════════

let SQL;
let db;

async function initDatabase() {
  SQL = await initSqlJs();
  
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`[ContextBridge API] Loaded database from ${DB_PATH}`);
  } else {
    // Create empty database if it doesn't exist
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        source_app TEXT NOT NULL DEFAULT 'unknown',
        source TEXT DEFAULT 'manual',
        content_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)`);
    console.log(`[ContextBridge API] Created new database`);
  }
  
  // Watch for database changes and reload
  watchFile(DB_PATH, { interval: 2000 }, () => {
    reloadDatabase();
  });
  
  return db;
}

function reloadDatabase() {
  try {
    if (existsSync(DB_PATH)) {
      const fileBuffer = readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log(`[ContextBridge API] Reloaded database`);
    }
  } catch (e) {
    console.error(`[ContextBridge API] Failed to reload database: ${e.message}`);
  }
}

// Helper to run queries
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Express Setup
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();

// CORS for browser extension
app.use(cors({
  origin: true, // Allow all origins for extension
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));

app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  try {
    queryOne('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Memory statistics
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

// Get all memories
app.get('/memories', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 1000);
    
    const memories = queryAll(`
      SELECT id, content, tags, source_app, source, created_at as timestamp
      FROM memories
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    
    // Parse tags JSON
    const parsed = memories.map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]'),
    }));
    
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search memories
app.get('/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    
    if (!query) {
      return res.json([]);
    }
    
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

// Semantic search (using simple keyword matching for now)
app.get('/semantic-search', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    
    if (!query) {
      return res.json([]);
    }
    
    // Extract keywords
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
    
    if (keywords.length === 0) {
      return res.json([]);
    }
    
    // Get recent memories to score
    const allMemories = queryAll(`
      SELECT id, content, tags, source_app, source, created_at as timestamp
      FROM memories
      ORDER BY created_at DESC
      LIMIT 500
    `);
    
    // Score each memory
    const scored = allMemories.map(memory => {
      const content = memory.content.toLowerCase();
      let score = 0;
      
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
          // Bonus for app name match
          if (memory.source_app?.toLowerCase().includes(keyword)) {
            score += 2;
          }
        }
      }
      
      // Recency bonus
      const memoryDate = new Date(memory.timestamp);
      const now = new Date();
      const hoursSince = (now - memoryDate) / (1000 * 60 * 60);
      if (hoursSince < 1) score += 3;
      else if (hoursSince < 24) score += 2;
      else if (hoursSince < 72) score += 1;
      
      return { ...memory, score };
    });
    
    // Return top matches
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

// ═══════════════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('[ContextBridge API] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                   ContextBridge API                        ║
╠════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                   ║
║  Database: ${DB_PATH.slice(0, 45)}...
╚════════════════════════════════════════════════════════════╝

Endpoints:
  GET /health          - Health check
  GET /stats           - Memory statistics
  GET /memories        - Get memories (?limit=N)
  GET /search          - Search memories (?q=query&limit=N)
  GET /semantic-search - Semantic search (?q=query&limit=N)
`);
  });
}

main().catch(e => {
  console.error('[ContextBridge API] Fatal error:', e);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[ContextBridge API] Shutting down...');
  process.exit(0);
});
