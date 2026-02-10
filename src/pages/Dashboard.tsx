/**
 * Dashboard - Premium design inspired by Linear, Arc, Raycast
 * Clean, modern, with glass morphism and subtle animations
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  Power, Clipboard, Monitor, Camera, XCircle, Trash2, Plus, 
  Search, Sparkles, ChevronDown, Zap, Shield, MessageSquare,
  Clock, ArrowRight, ExternalLink, Eye
} from 'lucide-react';
import { useCaptureContext, type CaptureEvent } from '../lib/captureContext';
import AddMemoryModal from '../components/AddMemoryModal';
import MemoryDetail from '../components/MemoryDetail';
import { 
  getAllMemories, 
  searchMemories, 
  getActiveWindow, 
  saveMemory,
  deleteMemory as deleteMemoryApi,
  getMemoryStats,
  type Memory,
  type MemoryStats
} from '../lib/api';

// ═══════════════════════════════════════════════════════════════════════════════
// Activity Item - Sleek and minimal
// ═══════════════════════════════════════════════════════════════════════════════

function ActivityItem({ event, index }: { event: CaptureEvent; index: number }) {
  const icons = {
    clipboard: <Clipboard size={13} className="text-violet-400" />,
    screenshot: <Camera size={13} className="text-rose-400" />,
    'app-switch': <Monitor size={13} className="text-cyan-400" />,
    error: <XCircle size={13} className="text-amber-400" />,
  };

  const colors = {
    clipboard: 'from-violet-500/20 to-violet-500/5',
    screenshot: 'from-rose-500/20 to-rose-500/5',
    'app-switch': 'from-cyan-500/20 to-cyan-500/5',
    error: 'from-amber-500/20 to-amber-500/5',
  };

  return (
    <div 
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] transition-all duration-200 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${colors[event.type]} flex items-center justify-center flex-shrink-0 ring-1 ring-white/5`}>
        {icons[event.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-zinc-300 capitalize">{event.type.replace('-', ' ')}</span>
          {event.app && (
            <>
              <span className="w-1 h-1 rounded-full bg-zinc-700" />
              <span className="text-[10px] text-zinc-500">{event.app}</span>
            </>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 truncate mt-0.5 group-hover:text-zinc-400 transition-colors">
          {event.preview}
        </p>
      </div>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
        event.saved ? 'bg-emerald-500' : 'bg-zinc-600'
      }`} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Item - Card style with hover effects
// ═══════════════════════════════════════════════════════════════════════════════

function MemoryItem({ memory, onClick, index }: { memory: Memory; onClick: (m: Memory) => void; index: number }) {
  const sourceIcons: Record<string, { icon: React.ReactNode; color: string }> = {
    clipboard: { icon: <Clipboard size={12} />, color: 'text-violet-400 bg-violet-500/10' },
    screenshot: { icon: <Camera size={12} />, color: 'text-rose-400 bg-rose-500/10' },
    'app-tracking': { icon: <Monitor size={12} />, color: 'text-cyan-400 bg-cyan-500/10' },
    manual: { icon: <Sparkles size={12} />, color: 'text-amber-400 bg-amber-500/10' },
    browser: { icon: <ExternalLink size={12} />, color: 'text-blue-400 bg-blue-500/10' },
  };

  const sourceInfo = sourceIcons[memory.source] || { icon: <Clipboard size={12} />, color: 'text-zinc-400 bg-zinc-500/10' };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHour < 24) return `${diffHour}h`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <button
      onClick={() => onClick(memory)}
      className="group w-full text-left p-4 rounded-xl bg-[#111113] border border-white/[0.04] hover:border-white/[0.08] hover:bg-[#141416] transition-all duration-200 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex items-start gap-3">
        {/* Source icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sourceInfo.color} ring-1 ring-white/5`}>
          {sourceInfo.icon}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-zinc-200 line-clamp-2 leading-relaxed group-hover:text-white transition-colors">
            {memory.content}
          </p>
          
          {/* Meta row */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
              <Clock size={10} />
              <span>{formatTime(memory.timestamp)}</span>
            </div>
            {memory.source_app && (
              <>
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                <span className="text-[10px] text-zinc-500">{memory.source_app}</span>
              </>
            )}
            {memory.tags.length > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                <span className="text-[10px] text-violet-400">#{memory.tags[0]}</span>
              </>
            )}
          </div>
        </div>
        
        {/* Hover indicator */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye size={14} className="text-zinc-500" />
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Integration Explainer - Premium card
// ═══════════════════════════════════════════════════════════════════════════════

function AIExplainer({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-500/[0.08] via-purple-500/[0.04] to-transparent border border-violet-500/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-violet-500/30 blur-md" />
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center ring-1 ring-violet-500/20">
              <Sparkles size={18} className="text-violet-300" />
            </div>
          </div>
          <div>
            <h3 className="text-[13px] font-medium text-white">How AI Uses Your Memory</h3>
            <p className="text-[11px] text-zinc-500">Understand the integration</p>
          </div>
        </div>
        <div className={`p-1.5 rounded-lg bg-white/[0.03] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown size={14} className="text-zinc-500" />
        </div>
      </button>
      
      <div className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pb-4 space-y-4">
          <div className="h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          
          {/* Steps */}
          {[
            { icon: Shield, color: 'emerald', title: '1. Local Storage', desc: 'Everything stays on your device in an encrypted SQLite database.' },
            { icon: Zap, color: 'cyan', title: '2. MCP Bridge', desc: 'AI assistants query through a local server you control.' },
            { icon: MessageSquare, color: 'violet', title: '3. Natural Queries', desc: '"What was I working on?" — your AI understands context.' },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className={`w-8 h-8 rounded-lg bg-${step.color}-500/10 flex items-center justify-center flex-shrink-0`}>
                <step.icon size={14} className={`text-${step.color}-400`} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-zinc-200">{step.title}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const { status, toggleCapture, events, clearEvents, isCapturing, captureNow } = useCaptureContext();
  const isActive = status === 'active';
  
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Memory | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIExplainer, setShowAIExplainer] = useState(() => {
    const pref = localStorage.getItem('contextbridge_ai_explainer_dismissed');
    return pref !== 'true';
  });

  // Fetch memories
  const fetchMemories = useCallback(async () => {
    try {
      const data = search.trim() 
        ? await searchMemories(search, 50)
        : await getAllMemories(50);
      setMemories(data);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  }, [search]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getMemoryStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchMemories();
    fetchStats();
  }, [fetchMemories, fetchStats]);

  // Refresh when events change
  useEffect(() => {
    if (events.length > 0 && events[0].saved) {
      fetchMemories();
      fetchStats();
    }
  }, [events, fetchMemories, fetchStats]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(fetchMemories, 300);
    return () => clearTimeout(t);
  }, [search, fetchMemories]);

  // Delete memory
  const handleDelete = async (id: string) => {
    try {
      await deleteMemoryApi(id);
      setMemories(memories.filter(m => m.id !== id));
      if (selected?.id === id) setSelected(null);
      await fetchStats();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Add memory
  const handleAddMemory = async (content: string, tags: string[]) => {
    try {
      const activeWindow = await getActiveWindow();
      await saveMemory(content, tags, 'manual', activeWindow.app_name !== 'Unknown' ? activeWindow.app_name : undefined);
      await Promise.all([fetchMemories(), fetchStats()]);
      setShowAddModal(false);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  return (
    <div className="h-full flex bg-[#09090b]">
      {/* ════════════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-32 bg-gradient-to-b from-violet-500/[0.07] to-transparent pointer-events-none" />
        
        {/* ─────────────────────────────────────────────────────────────────────
            THE BIG TOGGLE - Most important element
            ───────────────────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 relative">
          <button
            onClick={toggleCapture}
            className={`group w-full flex items-center justify-between p-5 rounded-2xl transition-all duration-500 relative overflow-hidden ${
              isActive
                ? 'bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30'
                : 'bg-[#111113] border border-white/[0.06] hover:border-white/[0.1]'
            }`}
          >
            {/* Animated background for active state */}
            {isActive && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl animate-pulse-soft" />
              </div>
            )}
            
            <div className="flex items-center gap-4 relative">
              {/* Status indicator */}
              <div className="relative">
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${
                  isActive 
                    ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]' 
                    : 'bg-zinc-600'
                }`} />
                {isActive && (
                  <div className="absolute inset-0 w-4 h-4 rounded-full bg-emerald-400 animate-ping opacity-60" />
                )}
              </div>
              
              {/* Status text */}
              <div className="text-left">
                <h1 className={`text-xl font-bold tracking-tight transition-colors duration-300 ${
                  isActive ? 'text-emerald-400' : 'text-zinc-500'
                }`}>
                  {isActive ? 'RECORDING' : 'PAUSED'}
                </h1>
                <p className="text-[12px] text-zinc-500 mt-0.5">
                  {isActive 
                    ? 'Capturing clipboard & activity'
                    : 'Click to start capturing'}
                </p>
              </div>
            </div>

            {/* Power button */}
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 relative ${
              isActive 
                ? 'bg-emerald-500/20' 
                : 'bg-white/[0.03] group-hover:bg-white/[0.06]'
            }`}>
              <Power 
                size={26} 
                className={`transition-all duration-300 ${
                  isActive 
                    ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]' 
                    : 'text-zinc-500 group-hover:text-zinc-300'
                }`} 
              />
            </div>
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            AI Integration Explainer
            ───────────────────────────────────────────────────────────────────── */}
        <div className="px-6 pt-4">
          <AIExplainer 
            isExpanded={showAIExplainer} 
            onToggle={() => {
              const newValue = !showAIExplainer;
              setShowAIExplainer(newValue);
              if (!newValue) {
                localStorage.setItem('contextbridge_ai_explainer_dismissed', 'true');
              }
            }} 
          />
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            Quick Stats Bar
            ───────────────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-6">
            <div className="animate-fade-in-up">
              <p className="text-2xl font-bold text-white tabular-nums tracking-tight">{stats?.total_memories ?? 0}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Total Memories</p>
            </div>
            <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
            <div className="animate-fade-in-up stagger-1">
              <p className="text-2xl font-bold text-amber-400 tabular-nums tracking-tight">{stats?.memories_today ?? 0}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Today</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-medium transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={16} />
            Add Memory
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            Search
            ───────────────────────────────────────────────────────────────────── */}
        <div className="px-6 pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#111113] border border-white/[0.04] text-white text-[13px] placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30 focus:ring-2 focus:ring-violet-500/10 transition-all duration-200"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/[0.05] transition-colors"
              >
                <XCircle size={14} className="text-zinc-500" />
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            Memories List
            ───────────────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
              <div className="relative mb-6">
                <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-violet-500/20 blur-xl" />
                <div className="relative w-20 h-20 rounded-2xl bg-[#111113] border border-white/[0.04] flex items-center justify-center">
                  <Clipboard size={28} className="text-zinc-600" />
                </div>
              </div>
              <h3 className="text-lg font-medium text-zinc-300 mb-2">No memories yet</h3>
              <p className="text-[13px] text-zinc-500 max-w-xs leading-relaxed">
                {isActive 
                  ? 'Copy something to your clipboard — it will appear here automatically!'
                  : 'Turn on capture above to start building your memory bank'}
              </p>
              {!isActive && (
                <button
                  onClick={toggleCapture}
                  className="mt-4 flex items-center gap-2 text-[13px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Start capturing <ArrowRight size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((m, i) => (
                <MemoryItem key={m.id} memory={m} onClick={setSelected} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ACTIVITY SIDEBAR
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="w-[280px] border-l border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
              isActive ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-zinc-600'
            }`} />
            <h2 className="text-[12px] font-medium text-zinc-300 uppercase tracking-wider">Live Activity</h2>
          </div>
          {events.length > 0 && (
            <button
              onClick={clearEvents}
              className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03] transition-all"
              title="Clear"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Activity list */}
        <div className="flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
              <div className="relative mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#111113] border border-white/[0.04] flex items-center justify-center">
                  {isCapturing ? (
                    <div className="w-5 h-5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
                  ) : (
                    <Monitor size={18} className="text-zinc-600" />
                  )}
                </div>
              </div>
              <p className="text-[12px] text-zinc-500 mb-1">
                {isActive ? 'Waiting for activity...' : 'Activity will appear here'}
              </p>
              <p className="text-[10px] text-zinc-600">
                {isActive ? 'Copy text or switch apps' : 'Turn on capture to start'}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {events.slice(0, 15).map((event, i) => (
                <ActivityItem key={event.id} event={event} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* Capture now button */}
        {isActive && (
          <div className="p-3 border-t border-white/[0.04]">
            <button
              onClick={captureNow}
              disabled={isCapturing}
              className="w-full py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-[12px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.08] transition-all disabled:opacity-50"
            >
              {isCapturing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
                  Capturing...
                </span>
              ) : (
                'Capture Now'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {selected && (
        <MemoryDetail 
          memory={selected} 
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
        />
      )}
      {showAddModal && (
        <AddMemoryModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddMemory}
        />
      )}
    </div>
  );
}
