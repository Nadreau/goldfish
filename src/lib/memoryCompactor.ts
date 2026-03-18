/**
 * Memory Compactor — Tiered memory lifecycle management
 *
 * Runs every 5 minutes to compress and organize memories:
 *   Hot (< 2h)  → kept as-is (raw captures + scene analysis)
 *   Warm (2-24h) → groups of hot memories compressed into session digests
 *   Cold (1-7d)  → warm digests compressed into daily summaries
 *   Evict (7d+)  → cold memories deleted unless importance >= 4
 */

import {
  getHotMemoriesOlderThan,
  getMemoriesByTier,
  compactMemories,
  deleteMemory,
  type Memory,
} from './api';
import { canCallGemini, rateLimitedGeminiFetch, isInBackoff } from './geminiRateLimiter';

// ─── Config ──────────────────────────────────────────────────────────────────

const COMPACT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (was 5)
const MAX_GROUPS_PER_CYCLE = 3;              // Max 3 Gemini calls per cycle (was 5)
const TIME_GAP_MS = 30 * 60 * 1000;         // 30 min gap = new group

let compactorTimer: ReturnType<typeof setInterval> | null = null;
let isCompacting = false;

// ─── Start / Stop ────────────────────────────────────────────────────────────

export function startMemoryCompactor() {
  if (compactorTimer) return;
  console.log('[MemoryCompactor] Started');
  compactorTimer = setInterval(runCompaction, COMPACT_INTERVAL_MS);
  // First run after 60s to let captures accumulate
  setTimeout(runCompaction, 60_000);
}

export function stopMemoryCompactor() {
  if (compactorTimer) {
    clearInterval(compactorTimer);
    compactorTimer = null;
    console.log('[MemoryCompactor] Stopped');
  }
}

// ─── Main Compaction Cycle ───────────────────────────────────────────────────

async function runCompaction() {
  if (isCompacting) return;
  if (isInBackoff()) {
    console.log('[MemoryCompactor] In rate-limit backoff — skipping this cycle');
    return;
  }
  isCompacting = true;
  try {
    await compactHotToWarm();
    await compactWarmToCold();
    await evictOldCold();
  } catch (err) {
    console.error('[MemoryCompactor] Error:', err);
  } finally {
    isCompacting = false;
  }
}

// ─── Hot → Warm ──────────────────────────────────────────────────────────────

async function compactHotToWarm() {
  const hotMemories = await getHotMemoriesOlderThan(2, 200);
  if (hotMemories.length < 3) return;

  const groups = groupByAppAndTime(hotMemories);
  let processed = 0;

  for (const group of groups) {
    if (processed >= MAX_GROUPS_PER_CYCLE) break;
    if (!canCallGemini('compactor')) {
      console.log('[MemoryCompactor] Rate limit reached — stopping hot→warm');
      break;
    }
    if (group.length < 3) continue; // Don't compact tiny groups

    const digest = await summarizeGroup(group, 'session');
    if (!digest) continue;

    const ids = group.map(m => m.id);
    const apps = [...new Set(group.map(m => m.source_app).filter(Boolean))];
    const allTags = [...new Set(group.flatMap(m => m.tags))];
    const maxImportance = Math.max(...group.map(m => m.importance ?? 3));

    try {
      await compactMemories(
        ids, digest, allTags, 'warm',
        apps[0] ?? undefined,
        Math.max(maxImportance, digest.includes('important') ? 4 : 3),
      );
      processed++;
      console.log(`[MemoryCompactor] Hot→Warm: ${ids.length} memories → 1 digest (${apps.join(', ')})`);
    } catch (err) {
      console.error('[MemoryCompactor] Hot→Warm failed:', err);
    }
  }
}

// ─── Warm → Cold ─────────────────────────────────────────────────────────────

async function compactWarmToCold() {
  const warmMemories = await getMemoriesByTier('warm', 100);
  if (warmMemories.length < 2) return;

  // Group by date
  const byDate = new Map<string, Memory[]>();
  for (const m of warmMemories) {
    const date = m.timestamp.split('T')[0];
    const dayAge = (Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60);
    if (dayAge < 24) continue; // Only compact memories older than 24h
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(m);
  }

  let processed = 0;
  for (const [date, dayMemories] of byDate) {
    if (processed >= MAX_GROUPS_PER_CYCLE) break;
    if (!canCallGemini('compactor')) {
      console.log('[MemoryCompactor] Rate limit reached — stopping warm→cold');
      break;
    }
    if (dayMemories.length < 2) continue;

    const digest = await summarizeGroup(dayMemories, 'daily');
    if (!digest) continue;

    const ids = dayMemories.map(m => m.id);
    const allTags = [...new Set(dayMemories.flatMap(m => m.tags))];
    const maxImportance = Math.max(...dayMemories.map(m => m.importance ?? 3));

    try {
      await compactMemories(
        ids, digest, allTags, 'cold',
        undefined,
        maxImportance,
      );
      processed++;
      console.log(`[MemoryCompactor] Warm→Cold: ${ids.length} digests from ${date} → 1 daily summary`);
    } catch (err) {
      console.error('[MemoryCompactor] Warm→Cold failed:', err);
    }
  }
}

// ─── Eviction ────────────────────────────────────────────────────────────────

async function evictOldCold() {
  const coldMemories = await getMemoriesByTier('cold', 100);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const m of coldMemories) {
    const age = new Date(m.timestamp).getTime();
    if (age > cutoff) continue; // Not old enough
    if ((m.importance ?? 3) >= 4) continue; // Keep important memories forever

    try {
      await deleteMemory(m.id);
      console.log(`[MemoryCompactor] Evicted cold memory: ${m.id} (importance=${m.importance})`);
    } catch (err) {
      console.error('[MemoryCompactor] Eviction failed:', err);
    }
  }
}

// ─── Grouping ────────────────────────────────────────────────────────────────

function groupByAppAndTime(memories: Memory[]): Memory[][] {
  if (memories.length === 0) return [];

  // Sort by timestamp ascending
  const sorted = [...memories].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const groups: Memory[][] = [];
  let currentGroup: Memory[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const sameApp = curr.source_app === prev.source_app;

    if (sameApp && timeDiff < TIME_GAP_MS) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  return groups;
}

// ─── Gemini Summarization ────────────────────────────────────────────────────

async function summarizeGroup(memories: Memory[], type: 'session' | 'daily'): Promise<string | null> {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) return null;

  // Build content to summarize
  const contentBlock = memories.map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString();
    const app = m.source_app || 'Unknown';
    // Truncate each memory to keep prompt manageable
    const text = m.content.length > 800 ? m.content.slice(0, 800) + '...' : m.content;
    return `[${time}] ${app}: ${text}`;
  }).join('\n\n');

  const timeRange = `${new Date(memories[0].timestamp).toLocaleTimeString()} - ${new Date(memories[memories.length - 1].timestamp).toLocaleTimeString()}`;
  const apps = [...new Set(memories.map(m => m.source_app).filter(Boolean))].join(', ');

  const prompt = type === 'session'
    ? `You are compressing screen activity memories into a concise session digest.

Time range: ${timeRange}
Apps: ${apps}
Memories: ${memories.length}

${contentBlock}

Write a concise session digest (3-5 sentences) that captures:
- What the user was doing and in which apps
- Key details: file names, URLs, people, code, decisions
- How long approximately and the general intent

Write in plain text, not JSON. Be specific and factual. Example:
"Spent ~45 min in VS Code working on the auth flow for goldfish. Edited src/lib/api.ts to add OAuth helpers and tested login in Arc browser at localhost:5173. Also checked Slack #goldfish for feedback from Niko about the dashboard layout."`
    : `You are compressing a day's activity digests into a single daily summary.

Date: ${memories[0].timestamp.split('T')[0]}
Session digests: ${memories.length}

${contentBlock}

Write a concise daily summary (3-6 sentences) covering:
- Main activities and projects worked on
- Key decisions, discoveries, or accomplishments
- Apps and tools used
- Any important information worth remembering long-term

Write in plain text, not JSON. Be specific and factual.`;

  try {
    const res = await rateLimitedGeminiFetch('compactor', apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    });

    if (!res) return null; // rate limited

    const data = await res.json();
    if (data.error) {
      console.error('[MemoryCompactor] Gemini error:', data.error.message);
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text.length < 20) return null;

    return text;
  } catch (err) {
    console.error('[MemoryCompactor] Gemini request failed:', err);
    return null;
  }
}
