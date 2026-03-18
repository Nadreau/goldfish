/**
 * Gemini Rate Limiter — Shared rate limiting for all Gemini API calls
 *
 * Gemini 2.0 Flash free tier limits:
 *   - 15 requests per minute (RPM)
 *   - 1,500 requests per day (RPD)
 *
 * Budget allocation (for 8h active day):
 *   - Scene processing: ~60% → 900 calls/day
 *   - Memory compaction: ~15% → 225 calls/day
 *   - Chat / health checks: ~25% → 375 calls/day
 *
 * Backoff: on 429, pause ALL background processing for 15 minutes.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const DAILY_BUDGET = 1_400;           // Leave 100 buffer under 1,500 limit
const SCENE_BUDGET = 900;
const COMPACTOR_BUDGET = 225;
const RPM_LIMIT = 12;                 // Stay under 15 RPM with headroom
const BACKOFF_DURATION_MS = 15 * 60 * 1000; // 15 min backoff on 429

// ─── State ───────────────────────────────────────────────────────────────────

interface RateLimiterState {
  /** ISO date string (YYYY-MM-DD) for the current day's counters */
  counterDate: string;
  /** Total Gemini calls today */
  totalToday: number;
  /** Scene processor calls today */
  sceneToday: number;
  /** Compactor calls today */
  compactorToday: number;
  /** Timestamps of calls in the current minute window */
  minuteWindow: number[];
  /** If set, background processing is paused until this timestamp */
  backoffUntil: number;
}

let state: RateLimiterState = loadState();

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function loadState(): RateLimiterState {
  try {
    const raw = localStorage.getItem('gemini_rate_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Reset if it's a new day
      if (parsed.counterDate === todayStr()) {
        return {
          ...parsed,
          minuteWindow: parsed.minuteWindow ?? [],
          backoffUntil: parsed.backoffUntil ?? 0,
        };
      }
    }
  } catch { /* fresh state */ }
  return freshState();
}

function freshState(): RateLimiterState {
  return {
    counterDate: todayStr(),
    totalToday: 0,
    sceneToday: 0,
    compactorToday: 0,
    minuteWindow: [],
    backoffUntil: 0,
  };
}

function saveState() {
  try {
    localStorage.setItem('gemini_rate_state', JSON.stringify(state));
  } catch { /* localStorage full or unavailable */ }
}

function ensureCurrentDay() {
  if (state.counterDate !== todayStr()) {
    state = freshState();
    saveState();
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type CallerType = 'scene' | 'compactor' | 'chat';

/**
 * Check if a Gemini call is allowed right now.
 * Returns true if OK to proceed, false if rate limited.
 */
export function canCallGemini(caller: CallerType): boolean {
  ensureCurrentDay();

  // Check backoff
  if (caller !== 'chat' && state.backoffUntil > Date.now()) {
    return false;
  }

  // Check daily budget
  if (state.totalToday >= DAILY_BUDGET) return false;

  // Check per-caller budget
  if (caller === 'scene' && state.sceneToday >= SCENE_BUDGET) return false;
  if (caller === 'compactor' && state.compactorToday >= COMPACTOR_BUDGET) return false;
  // Chat has no hard per-caller limit, just the daily total

  // Check RPM — clean old entries
  const now = Date.now();
  state.minuteWindow = state.minuteWindow.filter(t => now - t < 60_000);
  if (state.minuteWindow.length >= RPM_LIMIT) return false;

  return true;
}

/**
 * Record a Gemini API call. Call this AFTER making the request.
 */
export function recordGeminiCall(caller: CallerType) {
  ensureCurrentDay();
  state.totalToday++;
  state.minuteWindow.push(Date.now());

  if (caller === 'scene') state.sceneToday++;
  if (caller === 'compactor') state.compactorToday++;

  saveState();
}

/**
 * Record a rate limit (429) response. Triggers backoff for background tasks.
 */
export function recordRateLimit() {
  state.backoffUntil = Date.now() + BACKOFF_DURATION_MS;
  saveState();
  console.warn(`[GeminiRateLimiter] 429 received — background processing paused for 15 min`);
}

/**
 * Check if we're in backoff mode (for background tasks only).
 */
export function isInBackoff(): boolean {
  return state.backoffUntil > Date.now();
}

/**
 * Get current usage stats for display in Settings.
 */
export function getUsageStats() {
  ensureCurrentDay();
  return {
    totalToday: state.totalToday,
    dailyBudget: DAILY_BUDGET,
    sceneToday: state.sceneToday,
    sceneBudget: SCENE_BUDGET,
    compactorToday: state.compactorToday,
    compactorBudget: COMPACTOR_BUDGET,
    chatToday: state.totalToday - state.sceneToday - state.compactorToday,
    isBackoff: isInBackoff(),
    backoffRemaining: Math.max(0, Math.ceil((state.backoffUntil - Date.now()) / 60_000)),
    percentUsed: Math.round((state.totalToday / DAILY_BUDGET) * 100),
  };
}

/**
 * Wraps a Gemini fetch call with rate limiting.
 * Returns null if rate limited, otherwise returns the fetch response.
 */
export async function rateLimitedGeminiFetch(
  caller: CallerType,
  apiKey: string,
  body: object,
): Promise<Response | null> {
  if (!canCallGemini(caller)) {
    console.log(`[GeminiRateLimiter] ${caller} call blocked — budget exhausted or in backoff`);
    return null;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  recordGeminiCall(caller);

  if (res.status === 429) {
    recordRateLimit();
  }

  return res;
}
