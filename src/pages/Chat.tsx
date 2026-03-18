import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Plus, Trash2 } from 'lucide-react';
import { getAllMemories, searchMemories, getMemoriesByTier, type Memory } from '../lib/api';
import { canCallGemini, recordGeminiCall, recordRateLimit } from '../lib/geminiRateLimiter';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
}

// ─── Storage Keys ───────────────────────────────────────────────────────────

const SESSIONS_KEY = 'cb_chat_sessions';
const ACTIVE_KEY = 'cb_active_session';

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((s: ChatSession) => ({
      ...s,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
      messages: s.messages.map((m: Message) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function migrateOldChat(): ChatSession | null {
  try {
    const old = localStorage.getItem('cb_chat_history');
    if (!old) return null;
    const messages: Message[] = JSON.parse(old).map((m: Message) => ({ ...m, timestamp: new Date(m.timestamp) }));
    if (messages.length === 0) return null;
    localStorage.removeItem('cb_chat_history');
    const firstMsg = messages[0].content.slice(0, 40);
    return {
      id: 'migrated-' + Date.now(),
      title: firstMsg.length < messages[0].content.length ? firstMsg + '...' : firstMsg,
      createdAt: messages[0].timestamp,
      updatedAt: messages[messages.length - 1].timestamp,
      messages,
    };
  } catch { return null; }
}

// ─── Greeting ───────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Still going strong tonight?";
}

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(context: string): string {
  const hour = new Date().getHours();
  const timeContext = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return `You are Goldfish — the AI companion inside the Goldfish app, a desktop app that captures the user's screen continuously via OCR and tracks which apps are active. All data is stored locally in a SQLite database on their machine — nothing leaves their computer unless they choose to share it.

You were built so that the user's AI finally has a memory — they never have to remember what they were working on, what tab had that URL, or what code they were looking at. You watch, you remember, and you're always ready to help.

PERSONALITY:
- Your name is Goldfish. The irony is the point — unlike an actual goldfish, you never forget anything. If asked what you are, explain Goldfish — a desktop app with a Rust backend that captures screens via OCR, analyzes scenes with AI, and stores everything locally.
- Speak naturally, like a knowledgeable friend — not a corporate assistant
- Be specific and reference actual things you've seen (app names, file names, URLs, code snippets, messages)
- Show genuine interest in what the user is working on
- Offer proactive observations when relevant
- Keep responses concise unless the user asks for detail
- It's ${timeContext} — be aware of time of day in your tone

WHAT YOU CAN SEE:
Your memories are organized in layers:
- RELEVANT TO YOUR QUESTION: Memories that matched keywords from what the user asked
- DAILY SUMMARIES: High-level summaries of recent days (compressed from many captures)
- RECENT SESSIONS: Activity digests from the last 24 hours (e.g. "45 min in VS Code working on auth flow")
- RIGHT NOW: Raw captures from the last couple hours — full OCR text, app names, window titles, browser URLs

Scene memories (marked "scene") are AI-analyzed summaries of activity sessions. They're high-signal. Raw memories have the full text that was on screen. Use all layers to answer — daily summaries for the big picture, session digests for context, and hot memories for exact details.

HOW TO ANSWER:
- Quote specific text from memories when relevant (code snippets, URLs, names, numbers)
- If you can see the answer in captured content, give it directly
- Reference time naturally ("About an hour ago you were...", "Earlier today I saw you...")
- If the information isn't in your memories, say so honestly — don't fabricate
- When the user asks short or vague questions, use context to infer what they probably mean

MEMORIES:
---
${context}
---

Remember: you are not a tool being queried. You are Goldfish — the AI that never forgets.`;
}

// ─── Gemini API ─────────────────────────────────────────────────────────────

async function queryGemini(prompt: string, context: string): Promise<string> {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) return "I need a Gemini API key to think. You can add one in Settings.";

  // Pre-flight rate limit check (chat is exempt from backoff but still checks RPM + daily budget)
  if (!canCallGemini('chat')) {
    return "Gemini is processing screen captures right now. Try again in about 30 seconds — I'll be ready.";
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(context) }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      }
    );
    recordGeminiCall('chat');
    const data = await res.json();
    if (data.error) {
      if (res.status === 429 || data.error.message?.includes('Resource exhausted')) {
        // Only backoff background tasks — don't punish chat for a temporary RPM blip
        recordRateLimit();
        // Check if it's a per-minute vs daily exhaustion
        const msg = data.error.message || '';
        const retryMatch = msg.match(/retry in ([\d.]+)s/i);
        if (retryMatch) {
          const secs = Math.ceil(parseFloat(retryMatch[1]));
          return `Gemini is busy processing your screen captures right now. Try again in ${secs} seconds.`;
        }
        return "Gemini's free tier limit is reached for today. Resets at midnight Pacific. Chat will work again tomorrow.";
      }
      if (res.status === 403 || res.status === 400) {
        return "🔑 There's an issue with your Gemini API key. Head to Settings to check it.";
      }
      return `Something went wrong: ${data.error.message || 'Unknown error'}`;
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't put my thoughts together. Try again?";
  } catch {
    return "I'm having trouble connecting right now. Check your internet?";
  }
}

async function generateTitle(message: string): Promise<string> {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) return message.slice(0, 40) + (message.length > 40 ? '...' : '');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate a very short title (3-6 words, no quotes, no punctuation) for a conversation that starts with: "${message.slice(0, 200)}"` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 20 },
        }),
      }
    );
    recordGeminiCall('chat');
    if (res.status === 429) recordRateLimit();
    const data = await res.json();
    const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (title && title.length > 0 && title.length < 60) return title;
  } catch { /* fall through */ }
  return message.slice(0, 40) + (message.length > 40 ? '...' : '');
}

// ─── Chat Component ─────────────────────────────────────────────────────────

export default function Chat() {
  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const loaded = loadSessions();
    // Migrate old single-conversation format
    if (loaded.length === 0) {
      const migrated = migrateOldChat();
      if (migrated) return [migrated];
    }
    return loaded;
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_KEY);
  });

  // Chat state
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recentActivity, setRecentActivity] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [contextCount, setContextCount] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

  // Persist sessions
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  // Persist active session ID
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(ACTIVE_KEY, activeSessionId);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }, [activeSessionId]);

  // Load recent activity for greeting + dynamic suggestions
  useEffect(() => {
    getAllMemories(30).then(memories => {
      setContextCount(memories.length);
      const scenes = memories.filter(m => m.source === 'scene-analysis');
      if (scenes.length > 0) {
        const firstLine = scenes[0].content.split('\n')[0].replace('## ', '');
        setRecentActivity(firstLine);
      }
      const dynamicSuggestions: string[] = [];
      if (scenes.length > 0) dynamicSuggestions.push("What have I been working on?");
      if (memories.some(m => m.source_app?.toLowerCase().includes('slack') || m.source_app?.toLowerCase().includes('messages')))
        dynamicSuggestions.push("Any interesting messages I got?");
      if (memories.some(m => m.source_app?.toLowerCase().includes('chrome') || m.source_app?.toLowerCase().includes('arc') || m.source_app?.toLowerCase().includes('safari')))
        dynamicSuggestions.push("What sites was I browsing?");
      if (dynamicSuggestions.length < 3) dynamicSuggestions.push("Summarize my day so far");
      if (dynamicSuggestions.length < 3) dynamicSuggestions.push("What do you remember?");
      setSuggestions(dynamicSuggestions.slice(0, 3));
    }).catch(() => {
      setSuggestions(["What have I been up to?", "Summarize my day", "What do you remember?"]);
    });
  }, []);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ─── Session Management ─────────────────────────────────────────────────

  const createNewSession = useCallback(() => {
    const id = 'session-' + Date.now();
    const newSession: ChatSession = {
      id,
      title: 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(id);
    setInput('');
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  }, [activeSessionId]);

  // ─── Send Message ───────────────────────────────────────────────────────

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    // If no active session, create one
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = 'session-' + Date.now();
      const newSession: ChatSession = {
        id: sessionId,
        title: 'New Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(sessionId);
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg, timestamp: new Date() };

    // Add user message to session
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, messages: [...s.messages, userMsg], updatedAt: new Date() }
        : s
    ));
    setInput('');
    setIsLoading(true);

    try {
      // ── SMART CONTEXT BUILDING ──
      const [relevant, cold, warm, hot] = await Promise.all([
        searchMemories(msg, 20),
        getMemoriesByTier('cold', 5),
        getMemoriesByTier('warm', 10),
        getMemoriesByTier('hot', 30),
      ]);

      const seen = new Set<string>();
      const dedup = (memories: Memory[]) => memories.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      const prioritize = (memories: Memory[]) => [
        ...memories.filter(m => m.source === 'scene-analysis' || m.source === 'compacted'),
        ...memories.filter(m => m.source !== 'scene-analysis' && m.source !== 'compacted'),
      ];

      let ctx = '', chars = 0;
      const BUDGET = 30000;

      const addSection = (label: string, memories: Memory[]) => {
        if (memories.length === 0 || chars >= BUDGET) return;
        ctx += `\n=== ${label} ===\n`;
        chars += label.length + 10;
        for (const m of prioritize(memories)) {
          const entry = `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.source_app || 'Unknown'} (${m.source}):\n${m.content}\n\n`;
          if (chars + entry.length > BUDGET) break;
          ctx += entry; chars += entry.length;
        }
      };

      addSection('RELEVANT TO YOUR QUESTION', dedup(relevant));
      addSection('DAILY SUMMARIES', dedup(cold));
      addSection('RECENT SESSIONS', dedup(warm));
      addSection('RIGHT NOW', dedup(hot));

      const response = await queryGemini(msg, ctx || 'No memories captured yet — I just started watching.');
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response, timestamp: new Date() };

      setSessions(prev => {
        const updated = prev.map(s =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, assistantMsg], updatedAt: new Date() }
            : s
        );
        return updated;
      });

      // Generate title after first user message
      const currentSession = sessions.find(s => s.id === sessionId);
      if (!currentSession || currentSession.messages.length <= 1) {
        generateTitle(msg).then(title => {
          setSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, title } : s
          ));
        });
      }
    } catch {
      const errorMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: "Something went wrong on my end. Try again?", timestamp: new Date() };
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, errorMsg], updatedAt: new Date() }
          : s
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const greeting = getGreeting();
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return (
    <div className="h-full flex overflow-hidden">
      {/* ─── Session Sidebar ─── */}
      <div className="w-[220px] h-full flex flex-col border-r border-white/[0.06] bg-white/[0.02]">
        {/* Drag region for macOS overlay title bar */}
        <div data-tauri-drag-region className="drag-region h-8 flex-shrink-0" />
        {/* New Chat button */}
        <div className="px-3 pb-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/80 to-orange-600/80 hover:from-amber-400/80 hover:to-orange-500/80 text-white text-[13px] font-medium cursor-pointer transition-all shadow-lg shadow-amber-500/10"
          >
            <Plus size={15} />
            New Chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {sortedSessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[12px] text-slate-500">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {sortedSessions.map(session => {
                const isActive = session.id === activeSessionId;
                const msgCount = session.messages.length;
                const timeLabel = formatRelativeTime(session.updatedAt);
                return (
                  <div
                    key={session.id}
                    className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150
                      ${isActive
                        ? 'glass text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                      }`}
                  >
                    <button
                      onClick={() => setActiveSessionId(session.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-[13px] font-medium truncate">{session.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {msgCount} msg{msgCount !== 1 ? 's' : ''} · {timeLabel}
                      </p>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-red-400 transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Chat Area ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-4 pb-3">
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight">Goldfish</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {activeSession
                ? activeSession.title
                : contextCount > 0 ? `${contextCount} memories` : 'Watching...'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {!activeSession || messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              {/* AI avatar with aware glow */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/10 flex items-center justify-center mb-5 animate-aware">
                <Bot size={24} className="text-amber-400" />
              </div>

              {/* Greeting */}
              <p className="text-[20px] font-semibold text-white mb-1">{greeting}</p>
              <p className="text-[13px] text-slate-400 mb-1 text-center max-w-sm">
                {recentActivity
                  ? `I noticed you were ${recentActivity.toLowerCase()}. Want to talk about it?`
                  : "I'm here whenever you need me."}
              </p>
              <p className="text-[11px] text-slate-600 mb-7">Never forgets a thing...</p>

              {/* Dynamic suggestions */}
              <div className="space-y-2 w-full max-w-sm">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="w-full text-left px-4 py-3 rounded-xl glass glass-hover text-[14px] text-slate-300 hover:text-white transition-all cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={15} className="text-amber-400" />
                    </div>
                  )}
                  <div className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/10'
                      : 'glass text-slate-200'
                  }`}>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={15} className="text-slate-400" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <Bot size={15} className="text-amber-400" />
                  </div>
                  <div className="glass px-4 py-3 rounded-2xl">
                    <div className="flex gap-1.5 items-center h-5">
                      <div className="w-2 h-2 rounded-full bg-amber-400/60 typing-dot" />
                      <div className="w-2 h-2 rounded-full bg-amber-400/60 typing-dot" />
                      <div className="w-2 h-2 rounded-full bg-amber-400/60 typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-8 py-5">
          <div className="flex gap-3">
            <input
              type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Talk to me..."
              disabled={isLoading}
              className="flex-1 px-5 py-3 rounded-xl glass text-[14px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60 transition-all"
            />
            <button onClick={() => send()} disabled={!input.trim() || isLoading}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-lg shadow-amber-500/15">
              <Send size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
