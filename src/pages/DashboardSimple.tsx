/**
 * Dashboard — Feels like AI watching, not screenshots
 * Minimal feedback, smooth experience
 */
import { useState, useEffect } from 'react';
import { Power, Brain, Zap, Eye, AlertTriangle, CheckCircle, HardDrive, Activity } from 'lucide-react';
import { useCaptureContext } from '../lib/captureContext';
import { getMemoryStats, getAllMemories, checkCapturePermission, checkTesseractInstalled, formatBytes, type MemoryStats, type Memory } from '../lib/api';

export default function Dashboard() {
  const { isActive, captureCount, events, isCapturing, toggleCapture } = useCaptureContext();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasTesseract, setHasTesseract] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [recentApps, setRecentApps] = useState<string[]>([]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleCapture();
    } finally {
      setToggling(false);
    }
  };

  // Check permissions on mount
  useEffect(() => {
    checkCapturePermission().then(setHasPermission).catch(() => setHasPermission(false));
    checkTesseractInstalled().then(setHasTesseract).catch(() => setHasTesseract(false));
  }, []);

  // Keyboard shortcut
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

  // Fetch stats quietly
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStats(await getMemoryStats());
        const memories = await getAllMemories(10);
        const apps = [...new Set(memories.map(m => m.source_app).filter(Boolean))].slice(0, 4);
        setRecentApps(apps as string[]);
      } catch (e) {
        console.error(e);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Refresh stats when events change (but quietly, no toasts)
  useEffect(() => {
    if (events.length > 0) {
      getMemoryStats().then(setStats).catch(console.error);
    }
  }, [events.length]);

  const systemReady = hasPermission === true && hasTesseract === true;
  const needsSetup = hasPermission === false || hasTesseract === false;

  return (
    <div className="h-full flex flex-col bg-[#09090b] p-6 overflow-hidden">
      
      {/* Setup Warning - Only show if needed */}
      {needsSetup && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-400">Setup Required</p>
            <p className="text-xs text-zinc-400 mt-1">
              {hasPermission === false && 'Enable Screen Recording in System Settings → Privacy & Security'}
              {hasPermission !== false && hasTesseract === false && 'Install OCR: brew install tesseract'}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          THE BIG TOGGLE - Clean & Simple
          ═══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={handleToggle}
        disabled={toggling || needsSetup}
        className={`w-full flex items-center justify-between p-8 rounded-2xl transition-all duration-500 mb-8 disabled:opacity-50 ${
          isActive
            ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-2 border-emerald-500/30'
            : 'bg-zinc-900/50 border-2 border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center gap-5">
          {/* Status indicator - subtle breathing animation when active */}
          <div className="relative">
            <div className={`w-4 h-4 rounded-full transition-colors duration-500 ${
              isActive ? 'bg-emerald-400' : 'bg-zinc-600'
            }`} />
            {isActive && (
              <div className="absolute inset-0 w-4 h-4 rounded-full bg-emerald-400/50 animate-[ping_2s_ease-in-out_infinite]" />
            )}
          </div>
          
          <div className="text-left">
            <h1 className={`text-2xl font-semibold transition-colors duration-500 ${
              isActive ? 'text-emerald-400' : 'text-zinc-500'
            }`}>
              {isActive ? 'Watching' : 'Paused'}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isActive 
                ? 'AI is learning from your screen'
                : 'Click to start watching'}
            </p>
          </div>
        </div>

        <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-500 ${
          isActive ? 'bg-emerald-500/20' : 'bg-zinc-800'
        }`}>
          <Power size={24} className={`transition-colors duration-500 ${
            isActive ? 'text-emerald-400' : 'text-zinc-500'
          }`} />
        </div>
      </button>

      {/* ═══════════════════════════════════════════════════════════════════
          STATS - Clean cards
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard 
          icon={Brain} 
          label="Memories" 
          value={stats?.total_memories ?? 0}
          color="violet"
        />
        <StatCard 
          icon={Zap} 
          label="Today" 
          value={stats?.memories_today ?? 0}
          color="amber"
        />
        <StatCard 
          icon={Eye} 
          label="This Session" 
          value={captureCount}
          color="emerald"
          pulse={isActive && isCapturing}
        />
        <StatCard 
          icon={HardDrive} 
          label="Storage" 
          value={stats ? formatBytes(stats.storage_bytes) : '0 B'}
          color="cyan"
          isText
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ACTIVITY - Minimal, shows app context not screenshot details
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={14} className={isActive ? 'text-emerald-400' : 'text-zinc-600'} />
          <h2 className="text-sm font-medium text-zinc-400">Recent Activity</h2>
          {isActive && (
            <span className="text-xs text-emerald-400/60 ml-auto">Live</span>
          )}
        </div>
        
        {events.length === 0 && (stats?.total_memories ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Brain size={40} className="text-zinc-800 mb-4" />
            <p className="text-zinc-500 text-sm">
              {isActive ? 'Learning your workflow...' : 'Start watching to build memory'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto max-h-64 pr-2">
            {/* Show recent app switches, not every capture */}
            {events.slice(0, 10).map((event, i) => (
              <div 
                key={event.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                style={{ opacity: 1 - (i * 0.08) }}
              >
                <div className={`w-2 h-2 rounded-full ${event.saved ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-sm text-zinc-400 truncate flex-1">
                  {event.app || 'Screen activity'}
                </span>
                <span className="text-xs text-zinc-600">
                  {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recent apps - subtle context */}
        {recentApps.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800/50">
            <p className="text-xs text-zinc-600 mb-2">Context from</p>
            <div className="flex flex-wrap gap-2">
              {recentApps.map((app, i) => (
                <span key={i} className="px-2 py-1 rounded bg-zinc-800/50 text-xs text-zinc-500">
                  {app}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - keyboard hint */}
      <div className="flex-shrink-0 pt-4 border-t border-zinc-800/30 flex items-center justify-between text-xs text-zinc-600">
        <span>ContextBridge</span>
        <kbd className="px-2 py-0.5 rounded bg-zinc-800/50 font-mono">⌘⇧C</kbd>
      </div>
    </div>
  );
}

// Clean stat card component
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color,
  pulse = false,
  isText = false
}: { 
  icon: any; 
  label: string; 
  value: number | string;
  color: 'violet' | 'amber' | 'emerald' | 'cyan';
  pulse?: boolean;
  isText?: boolean;
}) {
  const colors = {
    violet: 'text-violet-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
      <div className="flex items-center gap-2 text-zinc-500 mb-2">
        <Icon size={14} className={pulse ? 'animate-pulse' : ''} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${colors[color]} ${isText ? 'text-lg' : ''}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
