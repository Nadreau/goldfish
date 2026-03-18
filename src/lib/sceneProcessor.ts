/**
 * Scene Processor — AI-powered scene understanding for Goldfish
 *
 * Periodically drains the Rust scene buffer, groups OCR snapshots into
 * coherent "scenes" (same app + similar content), sends each scene to
 * Gemini for structured understanding, and saves the result as a
 * high-signal scene memory.
 */

import { getSceneBuffer, saveMemory, type SceneSnapshot } from './api';
import { canCallGemini, rateLimitedGeminiFetch, isInBackoff } from './geminiRateLimiter';

// ─── Config ──────────────────────────────────────────────────────────────────

const PROCESS_INTERVAL_MS = 2 * 60_000; // Check buffer every 2 minutes (was 30s)
const MIN_SNAPSHOTS_TO_PROCESS = 3;      // Need at least 3 snapshots (was 2)
const MAX_SCENES_PER_BATCH = 2;          // Max 2 Gemini calls per cycle (was 4)
const SIMILARITY_THRESHOLD = 0.4;        // Jaccard threshold for same-scene grouping

// ─── State ───────────────────────────────────────────────────────────────────

let processorTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

// ─── Public API ──────────────────────────────────────────────────────────────

export function startSceneProcessor() {
  if (processorTimer) return; // already running
  console.log('[SceneProcessor] Started — processing every', PROCESS_INTERVAL_MS / 1000, 's');
  processorTimer = setInterval(processSceneBuffer, PROCESS_INTERVAL_MS);
}

export function stopSceneProcessor() {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
    console.log('[SceneProcessor] Stopped');
  }
}

// ─── Core Processing ─────────────────────────────────────────────────────────

async function processSceneBuffer() {
  if (isProcessing) return; // prevent overlap
  isProcessing = true;

  try {
    // 1. Drain buffer from Rust
    const snapshots = await getSceneBuffer();
    if (snapshots.length < MIN_SNAPSHOTS_TO_PROCESS) {
      return; // not enough data yet
    }

    console.log(`[SceneProcessor] Processing ${snapshots.length} snapshots`);

    // 2. Group into scenes
    const scenes = groupIntoScenes(snapshots);
    console.log(`[SceneProcessor] Grouped into ${scenes.length} scenes`);

    // 3. Get Gemini API key + check rate limits
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      console.warn('[SceneProcessor] No Gemini API key — skipping AI processing');
      return;
    }

    if (isInBackoff()) {
      console.log('[SceneProcessor] In rate-limit backoff — skipping this cycle');
      return;
    }

    // 4. Process each scene (up to max, respecting rate limits)
    const toProcess = scenes.slice(0, MAX_SCENES_PER_BATCH);
    for (const scene of toProcess) {
      if (!canCallGemini('scene')) {
        console.log('[SceneProcessor] Rate limit reached — stopping this cycle');
        break;
      }
      try {
        const result = await analyzeScene(scene, apiKey);
        if (result) {
          await saveSceneMemory(result, scene);
        }
      } catch (err) {
        console.error('[SceneProcessor] Scene analysis failed:', err);
      }
    }

    console.log(`[SceneProcessor] Processed ${toProcess.length} scenes`);
  } catch (err) {
    console.error('[SceneProcessor] Buffer processing failed:', err);
  } finally {
    isProcessing = false;
  }
}

// ─── Scene Grouping ──────────────────────────────────────────────────────────

interface Scene {
  snapshots: SceneSnapshot[];
  app: string;
  startTime: string;
  endTime: string;
}

function groupIntoScenes(snapshots: SceneSnapshot[]): Scene[] {
  if (snapshots.length === 0) return [];

  const scenes: Scene[] = [];
  let current: Scene = {
    snapshots: [snapshots[0]],
    app: snapshots[0].app_name,
    startTime: snapshots[0].timestamp,
    endTime: snapshots[0].timestamp,
  };

  for (let i = 1; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const prev = snapshots[i - 1];

    // Break scene on app switch or major URL change
    const appChanged = snap.app_name !== prev.app_name;
    const urlChanged = snap.browser_url !== prev.browser_url &&
      snap.browser_url && prev.browser_url &&
      new URL(snap.browser_url).hostname !== new URL(prev.browser_url).hostname;

    // Check content similarity
    const similarity = jaccardSimilarity(snap.ocr_text, prev.ocr_text);
    const contentDrifted = similarity < SIMILARITY_THRESHOLD;

    if (appChanged || urlChanged || contentDrifted) {
      // Save current scene and start new one
      scenes.push(current);
      current = {
        snapshots: [snap],
        app: snap.app_name,
        startTime: snap.timestamp,
        endTime: snap.timestamp,
      };
    } else {
      // Same scene — extend it
      current.snapshots.push(snap);
      current.endTime = snap.timestamp;
    }
  }

  // Don't forget the last scene
  scenes.push(current);
  return scenes;
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Gemini Scene Analysis ───────────────────────────────────────────────────

interface SceneAnalysis {
  activity: string;
  details: string[];
  intent: string;
  importance: number;
  tags: string[];
}

async function analyzeScene(scene: Scene, apiKey: string): Promise<SceneAnalysis | null> {
  // Build snapshot summaries for the prompt — use first + last + middle sample
  // to keep prompt size reasonable
  const snapsToInclude = pickRepresentativeSnapshots(scene.snapshots, 3);

  const snapshotText = snapsToInclude.map((s, i) => {
    const time = new Date(s.timestamp).toLocaleTimeString();
    const urlLine = s.browser_url ? `\nURL: ${s.browser_url}` : '';
    // Truncate OCR text to ~1500 chars per snapshot to stay within token budget
    const text = s.ocr_text.length > 1500 ? s.ocr_text.slice(0, 1500) + '...' : s.ocr_text;
    return `--- Snapshot ${i + 1} (${time}) ---\nApp: ${s.app_name}\nWindow: ${s.window_title}${urlLine}\n\n${text}`;
  }).join('\n\n');

  const duration = getDurationStr(scene.startTime, scene.endTime);

  const prompt = `You are analyzing screen captures from a user's computer to create a memory of what they were doing.

App: ${scene.app}
Duration: ${duration}
Snapshots: ${scene.snapshots.length}

${snapshotText}

Analyze what the user was doing and respond with JSON only (no markdown, no code fences):
{
  "activity": "What the user was doing (1 clear sentence)",
  "details": ["Specific detail 1", "Specific detail 2", "Specific detail 3"],
  "intent": "Why they were likely doing this (1 sentence)",
  "importance": 3,
  "tags": ["tag1", "tag2"]
}

Rules:
- "activity" should describe the action concretely (e.g. "Reading Slack messages in #goldfish about OCR pipeline improvements" not "Using Slack")
- "details" should capture specific names, URLs, code snippets, numbers, or key facts visible on screen (3-6 items)
- "importance" is 1-5: 1=idle/noise, 3=normal work, 5=critical decision or important info
- "tags" should be 2-4 lowercase descriptive tags
- Be specific and factual — only mention what's actually visible in the captures`;

  try {
    const res = await rateLimitedGeminiFetch('scene', apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    });

    if (!res) return null; // rate limited

    const data = await res.json();
    if (data.error) {
      console.error('[SceneProcessor] Gemini error:', data.error.message);
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Parse JSON — handle possible markdown code fences
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned) as SceneAnalysis;

    // Validate
    if (!result.activity || !result.details || !result.tags) return null;

    return result;
  } catch (err) {
    console.error('[SceneProcessor] Gemini request failed:', err);
    return null;
  }
}

// ─── Save Scene Memory ───────────────────────────────────────────────────────

async function saveSceneMemory(analysis: SceneAnalysis, scene: Scene) {
  // Build structured content
  const timeRange = `${new Date(scene.startTime).toLocaleTimeString()} — ${new Date(scene.endTime).toLocaleTimeString()}`;
  const content = [
    `## ${analysis.activity}`,
    '',
    `**App:** ${scene.app} | **Duration:** ${getDurationStr(scene.startTime, scene.endTime)} | **Time:** ${timeRange}`,
    `**Intent:** ${analysis.intent}`,
    '',
    '**Key Details:**',
    ...analysis.details.map(d => `- ${d}`),
  ].join('\n');

  const tags = ['scene-analysis', ...analysis.tags];

  await saveMemory(content, tags, 'scene-analysis', scene.app);
  console.log(`[SceneProcessor] Saved scene: "${analysis.activity}" (importance: ${analysis.importance})`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickRepresentativeSnapshots(snapshots: SceneSnapshot[], max: number): SceneSnapshot[] {
  if (snapshots.length <= max) return snapshots;
  // First, middle, last
  const result = [snapshots[0]];
  if (max >= 3) {
    result.push(snapshots[Math.floor(snapshots.length / 2)]);
  }
  result.push(snapshots[snapshots.length - 1]);
  return result;
}

function getDurationStr(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
