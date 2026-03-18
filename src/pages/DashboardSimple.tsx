import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, XCircle, Brain, HardDrive, Sparkles, Eye } from 'lucide-react';
import { useCaptureContext } from '../lib/captureContext';
import AddMemoryModal from '../components/AddMemoryModal';
import MemoryDetail from '../components/MemoryDetail';
import {
  getAllMemories, searchMemories, getActiveWindow, saveMemory,
  deleteMemory as deleteMemoryApi, getMemoryStats, formatBytes,
  formatRelativeTime, getMemoryPreview, cleanSourceApp, type Memory, type MemoryStats,
} from '../lib/api';

export default function Dashboard() {
  const { captureCount } = useCaptureContext();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [highlights, setHighlights] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Memory | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const mems = search.trim() ? await searchMemories(search, 50) : await getAllMemories(50);
      setMemories(mems);
      // Extract today's scene-analysis highlights — use LOCAL date, not UTC
      const now = new Date();
      const todayScenes = mems.filter(m => {
        if (m.source !== 'scene-analysis') return false;
        const d = new Date(m.timestamp);
        return d.getFullYear() === now.getFullYear() &&
               d.getMonth() === now.getMonth() &&
               d.getDate() === now.getDate();
      });
      setHighlights(todayScenes.slice(0, 5));
    } catch (err) { console.error(err); }
  }, [search]);

  const fetchStats = useCallback(async () => {
    try { setStats(await getMemoryStats()); } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchMemories(); fetchStats(); }, [fetchMemories, fetchStats]);
  useEffect(() => { const t = setTimeout(fetchMemories, 300); return () => clearTimeout(t); }, [search, fetchMemories]);
  useEffect(() => { const i = setInterval(fetchStats, 10000); return () => clearInterval(i); }, [fetchStats]);
  useEffect(() => { if (captureCount > 0) { fetchMemories(); fetchStats(); } }, [captureCount, fetchMemories, fetchStats]);

  const handleDelete = async (id: string) => {
    try { await deleteMemoryApi(id); setMemories(prev => prev.filter(m => m.id !== id)); if (selected?.id === id) setSelected(null); await fetchStats(); }
    catch (err) { console.error(err); }
  };

  const handleAddMemory = async (content: string, tags: string[]) => {
    try {
      const win = await getActiveWindow();
      await saveMemory(content, tags, 'manual', win.app_name !== 'Unknown' ? win.app_name : undefined);
      await Promise.all([fetchMemories(), fetchStats()]);
      setShowAddModal(false);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      {/* Drag region for macOS overlay title bar */}
      <div data-tauri-drag-region className="drag-region h-8 flex-shrink-0" />
      <header className="px-8 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight">Activity</h1>
            <p className="text-[14px] text-slate-400 mt-1">What I've been observing</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[13px] font-semibold transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add Memory
          </button>
        </div>
      </header>

      {/* Today's Highlights */}
      {highlights.length > 0 && !search && (
        <div className="px-8 pb-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">Today's highlights</p>
          <div className="space-y-2">
            {highlights.map(h => {
              const lines = h.content.split('\n');
              const activity = lines[0]?.replace('## ', '') || 'Activity';
              const details = lines.filter(l => l.startsWith('- ')).slice(0, 2);
              return (
                <button
                  key={h.id}
                  onClick={() => setSelected(h)}
                  className="w-full text-left p-4 rounded-xl glass glass-hover cursor-pointer transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Eye size={14} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-slate-200 group-hover:text-white transition-colors font-medium truncate">
                        {activity}
                      </p>
                      {details.length > 0 && (
                        <p className="text-[12px] text-slate-500 mt-1 truncate">
                          {details.map(d => d.replace('- ', '')).join(' · ')}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {cleanSourceApp(h.source_app) && <span className="text-[11px] text-slate-600">{cleanSourceApp(h.source_app)}</span>}
                        <span className="text-[11px] text-slate-700">{formatRelativeTime(h.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats strip */}
      <div className="flex gap-3 px-8 pb-4">
        <StatCard icon={Brain} label="Memories" value={stats?.total_memories ?? 0} color="indigo" />
        <StatCard icon={Eye} label="Today" value={stats?.memories_today ?? 0} color="violet" />
        <StatCard icon={HardDrive} label="Storage" value={stats ? formatBytes(stats.storage_bytes) : '0 B'} color="sky" text />
      </div>

      {/* Search */}
      <div className="px-8 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search your memory..."
            className="w-full pl-11 pr-10 py-2.5 rounded-xl glass text-[14px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer">
              <XCircle size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/10 flex items-center justify-center mb-4 animate-float">
              <Sparkles size={20} className="text-amber-400" />
            </div>
            <p className="text-[15px] font-medium text-slate-300">
              {search ? 'No matches found' : 'Building your memory...'}
            </p>
            <p className="text-[13px] text-slate-500 mt-1 text-center max-w-xs">
              {search ? 'Try different keywords' : 'Memories will appear here as I watch'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {memories.map(m => {
              const preview = getMemoryPreview(m);
              return (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className="w-full text-left px-4 py-3 rounded-xl glass-hover cursor-pointer transition-all duration-200 group hover:bg-white/[0.04]"
                >
                  <div className="flex items-start gap-3">
                    <SourceDot source={m.source} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-slate-200 truncate group-hover:text-white transition-colors leading-snug font-medium">
                        {preview.title}
                      </p>
                      {preview.detail && (
                        <p className="text-[12px] text-slate-500 truncate mt-0.5 leading-snug">
                          {preview.detail}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {cleanSourceApp(m.source_app) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] text-slate-500 font-medium">
                            {cleanSourceApp(m.source_app)}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-600">{formatRelativeTime(m.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && <MemoryDetail memory={selected} onClose={() => setSelected(null)} onDelete={handleDelete} />}
      {showAddModal && <AddMemoryModal onClose={() => setShowAddModal(false)} onSave={handleAddMemory} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, text }: { icon: any; label: string; value: string | number; color: string; text?: boolean }) {
  const colors: Record<string, string> = {
    indigo: 'from-amber-500/15 to-amber-500/5 text-amber-400 border-amber-500/10',
    violet: 'from-orange-500/15 to-orange-500/5 text-orange-400 border-orange-500/10',
    sky: 'from-sky-500/15 to-sky-500/5 text-sky-400 border-sky-500/10',
  };
  return (
    <div className={`flex-1 p-3.5 rounded-xl bg-gradient-to-br border ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} className="opacity-60" />
        <span className="text-[10px] font-medium text-slate-400">{label}</span>
      </div>
      <p className={`${text ? 'text-[16px]' : 'text-[20px]'} font-bold text-white tabular-nums tracking-tight`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function SourceDot({ source }: { source: string }) {
  const colors: Record<string, string> = {
    'clipboard': 'bg-sky-400 shadow-sky-400/40',
    'screenshot': 'bg-amber-400 shadow-amber-400/40',
    'ocr-capture': 'bg-emerald-400 shadow-emerald-400/40',
    'scene-analysis': 'bg-amber-400 shadow-amber-400/40',
    'smart-capture': 'bg-emerald-400 shadow-emerald-400/40',
    'manual': 'bg-orange-400 shadow-orange-400/40',
    'app-tracking': 'bg-amber-400 shadow-amber-400/40',
  };
  return (
    <div className="mt-1.5 flex-shrink-0">
      <div className={`w-2 h-2 rounded-full shadow-[0_0_6px] ${colors[source] || 'bg-slate-500 shadow-slate-500/40'}`} />
    </div>
  );
}
