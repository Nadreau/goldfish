import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Download, Clock, Folder, Zap, Link2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { getAllMemories, getMemoryStats, getMemoryPreview, cleanSourceApp, detectAiTools, type Memory, type AiToolStatus } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectGroup {
  name: string;
  icon: string;
  memories: Memory[];
  firstSeen: string;
  lastSeen: string;
  durationMinutes: number;
  apps: string[];
}

// ─── App → Category Mapping ─────────────────────────────────────────────────

const APP_CATEGORIES: Record<string, { category: string; icon: string }> = {
  'VS Code': { category: 'Development', icon: '💻' },
  'Visual Studio Code': { category: 'Development', icon: '💻' },
  'Cursor': { category: 'Development', icon: '💻' },
  'Terminal': { category: 'Development', icon: '💻' },
  'iTerm': { category: 'Development', icon: '💻' },
  'Xcode': { category: 'Development', icon: '💻' },
  'Chrome': { category: 'Browsing', icon: '🌐' },
  'Google Chrome': { category: 'Browsing', icon: '🌐' },
  'Arc': { category: 'Browsing', icon: '🌐' },
  'Safari': { category: 'Browsing', icon: '🌐' },
  'Firefox': { category: 'Browsing', icon: '🌐' },
  'Brave': { category: 'Browsing', icon: '🌐' },
  'Slack': { category: 'Communication', icon: '💬' },
  'Telegram': { category: 'Communication', icon: '💬' },
  'Messages': { category: 'Communication', icon: '💬' },
  'Discord': { category: 'Communication', icon: '💬' },
  'Zoom': { category: 'Communication', icon: '💬' },
  'Notion': { category: 'Notes & Docs', icon: '📝' },
  'Obsidian': { category: 'Notes & Docs', icon: '📝' },
  'Notes': { category: 'Notes & Docs', icon: '📝' },
  'Pages': { category: 'Notes & Docs', icon: '📝' },
  'Word': { category: 'Notes & Docs', icon: '📝' },
  'Figma': { category: 'Design', icon: '🎨' },
  'Sketch': { category: 'Design', icon: '🎨' },
  'Claude': { category: 'AI Tools', icon: '🤖' },
  'ChatGPT': { category: 'AI Tools', icon: '🤖' },
};

function categorize(sourceApp: string | null | undefined): { category: string; icon: string } {
  if (!sourceApp) return { category: 'Other', icon: '📄' };
  const cleaned = cleanSourceApp(sourceApp);
  if (!cleaned) return { category: 'Other', icon: '📄' };
  // Check exact match first
  if (APP_CATEGORIES[cleaned]) return APP_CATEGORIES[cleaned];
  // Check partial match
  for (const [key, val] of Object.entries(APP_CATEGORIES)) {
    if (cleaned.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { category: cleaned, icon: '📄' };
}

// ─── Grouping Logic ──────────────────────────────────────────────────────────

function groupByProject(memories: Memory[]): ProjectGroup[] {
  const groups = new Map<string, Memory[]>();

  for (const m of memories) {
    const { category } = categorize(m.source_app);
    const existing = groups.get(category) || [];
    existing.push(m);
    groups.set(category, existing);
  }

  const result: ProjectGroup[] = [];
  for (const [name, mems] of groups) {
    const sorted = [...mems].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const first = new Date(sorted[0].timestamp).getTime();
    const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const apps = [...new Set(mems.map(m => cleanSourceApp(m.source_app)).filter(Boolean))] as string[];
    const { icon } = categorize(mems[0].source_app);

    result.push({
      name,
      icon,
      memories: sorted,
      firstSeen: sorted[0].timestamp,
      lastSeen: sorted[sorted.length - 1].timestamp,
      durationMinutes: Math.round((last - first) / 60_000),
      apps,
    });
  }

  // Sort by capture count descending
  return result.sort((a, b) => b.memories.length - a.memories.length);
}

function formatTimeRange(first: string, last: string): string {
  const f = new Date(first);
  const l = new Date(last);
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (f.getTime() === l.getTime()) return fmt(f);
  return `${fmt(f)} — ${fmt(l)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Export Helpers ──────────────────────────────────────────────────────────

function buildProjectBrief(group: ProjectGroup): string {
  const lines: string[] = [];
  lines.push(`## ${group.icon} ${group.name}`);
  lines.push(`Active: ${formatTimeRange(group.firstSeen, group.lastSeen)} (${formatDuration(group.durationMinutes)})`);
  lines.push(`${group.memories.length} screen captures`);
  if (group.apps.length > 0) lines.push(`Apps: ${group.apps.join(', ')}`);
  lines.push('');
  lines.push('### Key Activities');

  // Extract unique meaningful titles
  const titles = new Set<string>();
  for (const m of group.memories) {
    const preview = getMemoryPreview(m);
    if (preview.title && preview.title !== 'Screen Capture' && titles.size < 8) {
      titles.add(preview.title);
    }
  }
  for (const t of titles) {
    lines.push(`- ${t}`);
  }

  return lines.join('\n');
}

function buildDailyBrief(groups: ProjectGroup[], date: string): string {
  const lines: string[] = [];
  lines.push(`# Daily Brief — ${date}`);
  lines.push('');

  const totalCaptures = groups.reduce((sum, g) => sum + g.memories.length, 0);
  lines.push(`**${totalCaptures} screen captures** across **${groups.length} projects**`);
  lines.push('');

  for (const group of groups) {
    lines.push(buildProjectBrief(group));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('*Generated by Goldfish — Your AI finally has a memory*');
  return lines.join('\n');
}

// ─── Components ──────────────────────────────────────────────────────────────

function ProjectCard({ group, isPrimary, onCopy }: { group: ProjectGroup; isPrimary: boolean; onCopy: (text: string) => void }) {
  const [expanded, setExpanded] = useState(isPrimary);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(buildProjectBrief(group));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get unique previews for this project
  const previews: string[] = [];
  const seen = new Set<string>();
  for (const m of group.memories) {
    const p = getMemoryPreview(m);
    if (p.title && p.title !== 'Screen Capture' && !seen.has(p.title)) {
      seen.add(p.title);
      previews.push(p.title);
      if (previews.length >= (isPrimary ? 5 : 3)) break;
    }
  }

  return (
    <div className={`rounded-2xl border transition-all ${
      isPrimary
        ? 'bg-gradient-to-br from-amber-500/[0.06] to-orange-500/[0.03] border-amber-500/15'
        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-start gap-4 cursor-pointer text-left"
      >
        <span className="text-xl mt-0.5 flex-shrink-0">{group.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold truncate ${isPrimary ? 'text-[16px] text-white' : 'text-[14px] text-slate-200'}`}>
              {group.name}
            </h3>
            {isPrimary && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold uppercase tracking-wider flex-shrink-0">
                Top Focus
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[12px] text-slate-500">{group.memories.length} captures</span>
            <span className="text-[12px] text-slate-600">·</span>
            <span className="text-[12px] text-slate-500">{formatDuration(group.durationMinutes)}</span>
            {group.apps.length > 0 && (
              <>
                <span className="text-[12px] text-slate-600">·</span>
                <span className="text-[12px] text-slate-500 truncate">{group.apps.join(', ')}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-slate-500 flex-shrink-0 mt-1">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-white/[0.04]">
          {/* Time range */}
          <div className="flex items-center gap-2 mt-3 mb-3">
            <Clock size={12} className="text-slate-600" />
            <span className="text-[12px] text-slate-500">{formatTimeRange(group.firstSeen, group.lastSeen)}</span>
          </div>

          {/* Activity previews */}
          {previews.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {previews.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-slate-600 mt-2 flex-shrink-0" />
                  <p className="text-[12px] text-slate-400 leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy Context'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Today() {
  const [memories, setMemories] = useState<Memory[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [, setStats] = useState<any>(null);
  const [aiTools, setAiTools] = useState<AiToolStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyCopied, setDailyCopied] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);

  // Use LOCAL date for filtering — toISOString() returns UTC which is wrong after 7 PM EST
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mems, s, tools] = await Promise.all([
        getAllMemories(500),
        getMemoryStats(),
        detectAiTools(),
      ]);
      // Filter to today only — compare in LOCAL timezone, not UTC
      const todayMems = mems.filter(m => {
        const d = new Date(m.timestamp);
        return d.getFullYear() === now.getFullYear() &&
               d.getMonth() === now.getMonth() &&
               d.getDate() === now.getDate();
      });
      setMemories(todayMems);
      setStats(s);
      setAiTools(tools);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [today]);

  useEffect(() => { fetchData(); }, [fetchData]);
  // Auto-refresh every 30 seconds
  useEffect(() => { const i = setInterval(fetchData, 30_000); return () => clearInterval(i); }, [fetchData]);

  const groups = groupByProject(memories);
  const primary = groups[0];
  const others = groups.slice(1);
  const connectedTools = aiTools.filter(t => t.connected);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const handleCopyDailyBrief = async () => {
    const brief = buildDailyBrief(groups, dateLabel);
    await navigator.clipboard.writeText(brief);
    setDailyCopied(true);
    setTimeout(() => setDailyCopied(false), 2000);
  };

  const handleExportMarkdown = () => {
    const brief = buildDailyBrief(groups, dateLabel);
    const blob = new Blob([brief], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goldfish-daily-brief-${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  // Calculate active time
  const totalMinutes = memories.length > 0
    ? Math.round((new Date(memories[0].timestamp).getTime() - new Date(memories[memories.length - 1].timestamp).getTime()) / 60_000)
    : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div data-tauri-drag-region className="drag-region h-8 flex-shrink-0" />

      {/* Header */}
      <header className="px-8 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight">Today</h1>
            <p className="text-[14px] text-slate-400 mt-1">{dateLabel}</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 rounded-xl glass glass-hover cursor-pointer text-slate-400 hover:text-white transition-all disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading && memories.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <Folder size={28} className="text-slate-600 mb-3" />
            <p className="text-[15px] text-slate-400">No activity captured today yet</p>
            <p className="text-[13px] text-slate-600 mt-1">Memories will appear as Goldfish watches</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 border border-amber-500/10">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={12} className="text-amber-400 opacity-60" />
                  <span className="text-[10px] font-medium text-slate-400">Captures</span>
                </div>
                <p className="text-[20px] font-bold text-white tabular-nums">{memories.length}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-violet-500/15 to-violet-500/5 border border-violet-500/10">
                <div className="flex items-center gap-2 mb-1">
                  <Folder size={12} className="text-violet-400 opacity-60" />
                  <span className="text-[10px] font-medium text-slate-400">Projects</span>
                </div>
                <p className="text-[20px] font-bold text-white tabular-nums">{groups.length}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-500/15 to-sky-500/5 border border-sky-500/10">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={12} className="text-sky-400 opacity-60" />
                  <span className="text-[10px] font-medium text-slate-400">Active</span>
                </div>
                <p className="text-[20px] font-bold text-white tabular-nums">{formatDuration(totalMinutes)}</p>
              </div>
            </div>

            {/* Primary Project */}
            {primary && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Top Project</p>
                <ProjectCard group={primary} isPrimary onCopy={handleCopy} />
              </div>
            )}

            {/* Other Projects */}
            {others.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Also Worked On</p>
                <div className="space-y-2">
                  {others.map(g => (
                    <ProjectCard key={g.name} group={g} isPrimary={false} onCopy={handleCopy} />
                  ))}
                </div>
              </div>
            )}

            {/* Connected LLMs */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Connected AI Tools</p>
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                {connectedTools.length > 0 ? (
                  <div className="space-y-2.5">
                    {connectedTools.map(tool => (
                      <div key={tool.id} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                        <span className="text-[13px] text-slate-300 font-medium">{tool.name}</span>
                        <span className="text-[11px] text-slate-600">receiving memories via MCP</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link2 size={14} className="text-slate-600" />
                    <span className="text-[13px] text-slate-500">No AI tools connected yet — set up in Settings</span>
                  </div>
                )}
              </div>
            </div>

            {/* Export Actions */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Quick Export</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyDailyBrief}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[13px] font-semibold transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 cursor-pointer"
                >
                  {dailyCopied ? <Check size={14} /> : <Copy size={14} />}
                  {dailyCopied ? 'Copied!' : 'Copy Daily Brief'}
                </button>
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass glass-hover text-slate-300 hover:text-white text-[13px] font-medium transition-all cursor-pointer"
                >
                  {exportCopied ? <Check size={14} className="text-emerald-400" /> : <Download size={14} />}
                  {exportCopied ? 'Downloaded!' : 'Export .md'}
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                Copy your daily brief to paste into any AI — Claude, ChatGPT, or any web tool
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
