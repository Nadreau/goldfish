/**
 * Sidebar - Premium navigation with glass morphism
 * Inspired by Linear, Arc, and Raycast
 */
import { useState, useEffect } from 'react';
import { LayoutDashboard, Shield, Settings, Sparkles, Zap, Database } from 'lucide-react';
import type { Page } from '../App';
import { useCaptureContext } from '../lib/captureContext';
import { getMemoryStats, formatBytes, type MemoryStats } from '../lib/api';

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const nav = [
  { id: 'dashboard' as Page, icon: LayoutDashboard, label: 'Dashboard', shortcut: '⌘1' },
  { id: 'privacy' as Page, icon: Shield, label: 'Privacy', shortcut: '⌘2' },
  { id: 'settings' as Page, icon: Settings, label: 'Settings', shortcut: '⌘3' },
];

export default function Sidebar({ currentPage, onNavigate }: Props) {
  const { status, events } = useCaptureContext();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const isActive = status === 'active';

  // Fetch stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getMemoryStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Refresh stats when events change
  useEffect(() => {
    if (events.length > 0) {
      getMemoryStats().then(setStats).catch(console.error);
    }
  }, [events.length]);

  return (
    <aside className="w-[220px] h-screen bg-[#0a0a0c]/80 backdrop-blur-xl border-r border-white/[0.04] flex flex-col relative">
      {/* Ambient glow at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-b from-violet-500/10 to-transparent pointer-events-none" />
      
      {/* Logo / Brand */}
      <div className="px-4 pt-5 pb-4 relative">
        <div className="flex items-center gap-3">
          {/* Animated logo container */}
          <div className="relative group">
            <div className={`absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500 ${isActive ? 'animate-pulse-soft' : ''}`} />
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
              <Sparkles size={18} className="text-white drop-shadow-lg" />
            </div>
            {/* Status indicator on logo */}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0a0c] transition-all duration-300 ${
              isActive 
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
                : 'bg-zinc-600'
            }`}>
              {isActive && (
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
              )}
            </div>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-white tracking-tight">ContextBridge</h1>
            <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              {isActive ? (
                <>
                  <span className="text-emerald-400 animate-pulse-soft">●</span>
                  <span className="text-emerald-400/90">Recording</span>
                </>
              ) : (
                <>
                  <span className="text-zinc-600">○</span>
                  <span>Paused</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Divider with gradient */}
      <div className="mx-4 mb-2 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {nav.map(({ id, icon: Icon, label, shortcut }, index) => {
            const active = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 animate-fade-in-up relative
                  ${active
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                  }`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Active indicator glow */}
                {active && (
                  <>
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500/15 via-violet-500/10 to-transparent" />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                  </>
                )}
                
                <Icon size={16} className={`relative transition-colors duration-200 ${
                  active 
                    ? 'text-violet-400' 
                    : 'text-zinc-500 group-hover:text-zinc-400'
                }`} />
                <span className={`relative font-medium ${active ? '' : ''}`}>{label}</span>
                <kbd className={`relative ml-auto text-[10px] font-medium transition-opacity duration-200 ${
                  active 
                    ? 'text-violet-400/60' 
                    : 'text-zinc-700 opacity-0 group-hover:opacity-100'
                }`}>
                  {shortcut}
                </kbd>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom stats panel */}
      <div className="mx-3 mb-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.04]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Database size={12} className="text-violet-400" />
              </div>
              <span className="text-[11px] font-medium text-zinc-400">Memory Bank</span>
            </div>
            <Zap size={12} className={`${isActive ? 'text-emerald-400 animate-pulse-soft' : 'text-zinc-600'}`} />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xl font-bold text-white tabular-nums tracking-tight">
                {stats?.total_memories ?? 0}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Memories</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-white tabular-nums tracking-tight">
                {stats ? formatBytes(stats.storage_bytes) : '0 B'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Storage</p>
            </div>
          </div>
          
          {/* Mini activity indicator */}
          {isActive && stats && stats.memories_today > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i}
                      className={`w-1 rounded-full transition-all duration-500 ${
                        i < Math.min(5, stats.memories_today) 
                          ? 'h-3 bg-violet-400' 
                          : 'h-2 bg-zinc-700'
                      }`}
                      style={{ 
                        animationDelay: `${i * 0.1}s`,
                        opacity: i < Math.min(5, stats.memories_today) ? 1 : 0.3
                      }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500">
                  <span className="text-amber-400 font-medium">{stats.memories_today}</span> today
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
