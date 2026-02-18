/**
 * Dashboard — Clean, Simple, One Toggle
 */
import { useState, useEffect } from 'react';
import { Power, Brain, Zap, Clock, Eye, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { useCaptureContext, type ActivityEvent } from '../lib/captureContext';
import { getMemoryStats, getAllMemories, checkCapturePermission, type MemoryStats, type Memory } from '../lib/api';

export default function Dashboard() {
  const { isActive, captureCount, events, isCapturing, toggleCapture } = useCaptureContext();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [lastCapture, setLastCapture] = useState<Memory | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);

  // Check permission on mount
  useEffect(() => {
    checkCapturePermission().then(setHasPermission).catch(() => setHasPermission(false));
  }, []);

  // Keyboard shortcut: Cmd+Shift+C to toggle capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        toggleCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCapture]);

  // Fetch stats and last capture
  useEffect(() => {
    const fetch = async () => {
      try {
        setStats(await getMemoryStats());
        const memories = await getAllMemories(1);
        if (memories.length > 0) {
          setLastCapture(memories[0]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetch();
    const interval = setInterval(fetch, 3000);
    return () => clearInterval(interval);
  }, []);

  // Refresh when events change + show toast
  useEffect(() => {
    if (events.length > 0) {
      getMemoryStats().then(setStats).catch(console.error);
      getAllMemories(1).then(m => {
        if (m.length > 0) setLastCapture(m[0]);
      }).catch(console.error);
      
      // Show save toast if latest event was saved
      if (events[0]?.saved) {
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 1500);
      }
    }
  }, [events.length]);

  return (
    <div className="h-full flex flex-col bg-[#09090b] p-6 overflow-hidden relative">
      {/* Save Toast */}
      {showSaveToast && (
        <div className="absolute top-4 right-4 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-4 py-2 flex items-center gap-2 animate-pulse z-50">
          <CheckCircle size={16} className="text-emerald-400" />
          <span className="text-sm text-emerald-400">Memory saved</span>
        </div>
      )}

      {/* Permission Warning */}
      {hasPermission === false && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-400">Screen Recording Permission Required</p>
            <p className="text-xs text-zinc-400 mt-1">
              Go to System Settings → Privacy & Security → Screen Recording → Enable for ContextBridge
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          THE BIG TOGGLE
          ═══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={toggleCapture}
        className={`w-full flex items-center justify-between p-6 rounded-2xl transition-all duration-300 mb-6 ${
          isActive
            ? 'bg-emerald-500/10 border-2 border-emerald-500/50'
            : 'bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center gap-4">
          {/* Pulsing indicator */}
          <div className="relative">
            <div className={`w-5 h-5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {isActive && (
              <div className="absolute inset-0 w-5 h-5 rounded-full bg-emerald-400 animate-ping opacity-50" />
            )}
          </div>
          
          <div className="text-left">
            <h1 className={`text-2xl font-bold ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {isActive ? 'CAPTURING' : 'PAUSED'}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isActive 
                ? `${captureCount} captures · OCR every 1s`
                : 'Click to start · ⌘⇧C'}
            </p>
          </div>
        </div>

        <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
          isActive ? 'bg-emerald-500/20' : 'bg-zinc-800'
        }`}>
          {isCapturing ? (
            <div className="w-8 h-8 border-3 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          ) : (
            <Power size={32} className={isActive ? 'text-emerald-400' : 'text-zinc-500'} />
          )}
        </div>
      </button>

      {/* ═══════════════════════════════════════════════════════════════════
          QUICK STATS
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Brain size={16} />
            <span className="text-xs uppercase">Total Memories</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats?.total_memories ?? 0}</p>
        </div>
        
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Zap size={16} />
            <span className="text-xs uppercase">Today</span>
          </div>
          <p className="text-3xl font-bold text-amber-400">{stats?.memories_today ?? 0}</p>
        </div>
        
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Eye size={16} />
            <span className="text-xs uppercase">This Session</span>
          </div>
          <p className="text-3xl font-bold text-violet-400">{captureCount}</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          LAST CAPTURE PREVIEW
          ═══════════════════════════════════════════════════════════════════ */}
      {lastCapture && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 mb-6">
          <div className="flex items-center gap-2 text-zinc-500 mb-3">
            <FileText size={16} />
            <span className="text-xs uppercase">Last Capture</span>
            <span className="text-xs text-zinc-600 ml-auto">{lastCapture.source_app || 'Unknown'}</span>
          </div>
          <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap line-clamp-4 overflow-hidden">
            {lastCapture.content}
          </pre>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LIVE ACTIVITY FEED
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <h2 className="text-sm font-medium text-zinc-400 uppercase">Live Activity</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Brain size={48} className="text-zinc-700 mb-4" />
              <p className="text-zinc-500">
                {isActive ? 'Capturing screen content...' : 'Turn on capture to start'}
              </p>
            </div>
          ) : (
            events.slice(0, 30).map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      event.saved 
        ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10' 
        : 'bg-zinc-900/50 border-zinc-800/50 hover:bg-zinc-900'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        event.saved ? 'bg-emerald-500/20' : 'bg-violet-500/10'
      }`}>
        {event.saved ? (
          <Eye size={14} className="text-emerald-400" />
        ) : (
          <Brain size={14} className="text-violet-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${event.saved ? 'text-emerald-300' : 'text-zinc-300'}`}>
          {event.summary}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Clock size={10} className="text-zinc-600" />
          <span className="text-xs text-zinc-600">{formatTime(event.timestamp)}</span>
          {event.saved && (
            <span className="text-xs text-emerald-500 font-medium">✓ OCR saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
