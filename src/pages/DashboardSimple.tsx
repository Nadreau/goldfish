/**
 * Dashboard — Clean, Simple, One Toggle
 */
import { useState, useEffect } from 'react';
import { Power, Brain, Zap, Clock, Eye, FileText, AlertTriangle, CheckCircle, HardDrive } from 'lucide-react';
import { useCaptureContext, type ActivityEvent } from '../lib/captureContext';
import { getMemoryStats, getAllMemories, checkCapturePermission, checkTesseractInstalled, rapidCaptureWithOcr, formatBytes, type MemoryStats, type Memory } from '../lib/api';

// Calculate top apps from recent memories
function getTopApps(memories: Memory[]): { app: string; count: number }[] {
  const appCounts: Record<string, number> = {};
  memories.forEach(m => {
    const app = m.source_app || 'Unknown';
    appCounts[app] = (appCounts[app] || 0) + 1;
  });
  return Object.entries(appCounts)
    .map(([app, count]) => ({ app, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export default function Dashboard() {
  const { isActive, captureCount, events, isCapturing, toggleCapture } = useCaptureContext();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [lastCapture, setLastCapture] = useState<Memory | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasTesseract, setHasTesseract] = useState<boolean | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [testingCapture, setTestingCapture] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [topApps, setTopApps] = useState<{ app: string; count: number }[]>([]);
  const [sessionStart] = useState(() => Date.now());
  const [toggling, setToggling] = useState(false);
  const captureInterval = parseInt(localStorage.getItem('capture_interval') || '1000');

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleCapture();
    } finally {
      setToggling(false);
    }
  };

  // Check permission and tesseract on mount
  useEffect(() => {
    checkCapturePermission().then(setHasPermission).catch(() => setHasPermission(false));
    checkTesseractInstalled().then(setHasTesseract).catch(() => setHasTesseract(false));
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

  // Test capture function
  const handleTestCapture = async () => {
    setTestingCapture(true);
    setTestResult(null);
    try {
      const result = await rapidCaptureWithOcr();
      if (result.success && result.changed) {
        setTestResult(`✅ OCR captured ${result.summary.length > 50 ? result.summary.slice(0, 50) + '...' : result.summary}`);
      } else if (result.success) {
        setTestResult('⚡ No change detected (same as last capture)');
      } else {
        setTestResult(`❌ ${result.error || 'Unknown error'}`);
      }
    } catch (e) {
      setTestResult(`❌ Error: ${e}`);
    } finally {
      setTestingCapture(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  // Fetch stats and last capture
  useEffect(() => {
    const fetch = async () => {
      try {
        setStats(await getMemoryStats());
        const memories = await getAllMemories(20);
        if (memories.length > 0) {
          setLastCapture(memories[0]);
          setTopApps(getTopApps(memories));
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

      {/* Tesseract Warning */}
      {hasTesseract === false && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-400">Tesseract OCR Not Installed</p>
            <p className="text-xs text-zinc-400 mt-1">
              Run: <code className="bg-zinc-800 px-1 rounded">brew install tesseract</code>
            </p>
          </div>
        </div>
      )}

      {/* System Ready */}
      {hasPermission === true && hasTesseract === true && !isActive && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 mb-4 flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-400" />
          <span className="text-sm text-emerald-400">System ready — Click toggle to start capturing</span>
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-4 text-sm text-zinc-300">
          {testResult}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          THE BIG TOGGLE
          ═══════════════════════════════════════════════════════════════════ */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`w-full flex items-center justify-between p-6 rounded-2xl transition-all duration-300 mb-6 disabled:opacity-70 ${
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
            <p className="text-sm text-zinc-500 mt-1 flex items-center gap-3">
              {isActive 
                ? `${captureCount} captures · OCR every ${captureInterval < 1000 ? captureInterval + 'ms' : (captureInterval/1000) + 's'}`
                : 'Click to start · ⌘⇧C'}
              {!isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleTestCapture(); }}
                  disabled={testingCapture}
                  className="text-xs text-violet-400 hover:text-violet-300 underline"
                >
                  {testingCapture ? 'Testing...' : 'Test OCR'}
                </button>
              )}
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
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Brain size={16} />
            <span className="text-xs uppercase">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats?.total_memories ?? 0}</p>
        </div>
        
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Zap size={16} />
            <span className="text-xs uppercase">Today</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{stats?.memories_today ?? 0}</p>
        </div>
        
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Eye size={16} />
            <span className="text-xs uppercase">Session</span>
          </div>
          <p className="text-2xl font-bold text-violet-400">{captureCount}</p>
          {isActive && captureCount > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              ~{Math.round(captureCount / Math.max(1, (Date.now() - sessionStart) / 60000))}/min
            </p>
          )}
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <HardDrive size={16} />
            <span className="text-xs uppercase">Storage</span>
          </div>
          <p className="text-2xl font-bold text-cyan-400">{stats ? formatBytes(stats.storage_bytes) : '0 B'}</p>
        </div>
      </div>

      {/* Top Apps */}
      {topApps.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-zinc-500">Top apps:</span>
          {topApps.map((item, i) => (
            <span key={i} className="px-2 py-1 rounded-full bg-zinc-800 text-xs text-zinc-300">
              {item.app} ({item.count})
            </span>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LAST CAPTURE PREVIEW
          ═══════════════════════════════════════════════════════════════════ */}
      {lastCapture && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 mb-6">
          <div className="flex items-center gap-2 text-zinc-500 mb-3">
            <FileText size={16} />
            <span className="text-xs uppercase">Last Capture</span>
            <span className="text-xs text-emerald-400 ml-2">
              {new Date(lastCapture.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-xs text-zinc-600 ml-auto">
              {lastCapture.source_app || 'Unknown'} · {lastCapture.content.length.toLocaleString()} chars
            </span>
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
