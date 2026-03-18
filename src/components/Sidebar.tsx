import { Activity, Calendar, Settings } from 'lucide-react';
import type { Page } from '../App';
import { useCaptureContext } from '../lib/captureContext';

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const nav = [
  { id: 'home' as Page, icon: Activity, label: 'Activity' },
  { id: 'today' as Page, icon: Calendar, label: 'Today' },
  { id: 'settings' as Page, icon: Settings, label: 'Settings' },
];

export default function Sidebar({ currentPage, onNavigate }: Props) {
  const { isActive } = useCaptureContext();

  return (
    <aside className="w-[230px] h-screen glass-strong flex flex-col relative z-10">
      {/* Drag region for macOS overlay title bar */}
      <div data-tauri-drag-region className="drag-region h-12 flex-shrink-0 cursor-default" />

      {/* Brand */}
      <div data-tauri-drag-region className="drag-region px-6 pb-6 cursor-default">
        <div className="flex items-center gap-3">
          <img src="/goldfish-sidebar.png" alt="Goldfish" className="w-10 h-10 rounded-[10px] object-cover drop-shadow-[0_2px_6px_rgba(245,158,11,0.25)]" />
          <div>
            <span className="text-[15px] font-semibold text-white tracking-tight">Goldfish</span>
            <p className="text-[11px] text-slate-400 mt-px">Your AI finally has a memory</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {nav.map(({ id, icon: Icon, label }) => {
            const active = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-200
                  ${active
                    ? 'glass text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                  }`}
              >
                <Icon
                  size={17}
                  strokeWidth={active ? 2 : 1.5}
                  className={active ? 'text-amber-400' : ''}
                />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Passive status indicator */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
              isActive
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                : 'bg-slate-600'
            }`} />
            {isActive && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400/30 animate-breathe" />
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            {isActive ? 'Remembering...' : 'Paused'}
          </span>
        </div>
      </div>
    </aside>
  );
}
