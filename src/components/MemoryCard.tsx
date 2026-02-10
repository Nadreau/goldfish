import { Camera, Clipboard, Monitor, Globe, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { type Memory, formatRelativeTime } from '../lib/api';
import type { CSSProperties } from 'react';

interface Props {
  memory: Memory;
  onClick: (m: Memory) => void;
  onDelete?: (id: string) => void;
  style?: CSSProperties;
}

const sourceConfig: Record<string, { icon: typeof Camera; color: string; bg: string; label: string }> = {
  screenshot: { icon: Camera, color: 'text-rose-400', bg: 'bg-rose-500/10', label: 'Screenshot' },
  clipboard: { icon: Clipboard, color: 'text-violet-400', bg: 'bg-violet-500/10', label: 'Clipboard' },
  'app-tracking': { icon: Monitor, color: 'text-cyan-400', bg: 'bg-cyan-500/10', label: 'App' },
  browser: { icon: Globe, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Browser' },
  manual: { icon: Pencil, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Manual' },
};

// Check if content is a URL
function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str.trim());
}

// Truncate URL for display
function formatUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname.slice(0, 30) : '');
  } catch {
    return url.slice(0, 50);
  }
}

export default function MemoryCard({ memory, onClick, onDelete, style }: Props) {
  const config = sourceConfig[memory.source] || sourceConfig.manual;
  const Icon = config.icon;
  const contentIsUrl = isUrl(memory.content);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm('Delete this memory?')) {
      onDelete(memory.id);
    }
  };

  return (
    <div
      onClick={() => onClick(memory)}
      style={style}
      className="group relative flex items-start gap-3 p-3.5 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#1f1f23] cursor-pointer transition-all duration-200 animate-fade-in"
    >
      {/* Source icon */}
      <div className={`mt-0.5 w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={14} className={config.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {contentIsUrl ? (
          <div className="flex items-center gap-2">
            <ExternalLink size={12} className="text-[#52525b] flex-shrink-0" />
            <p className="text-[13px] text-violet-400 truncate">{formatUrl(memory.content)}</p>
          </div>
        ) : (
          <p className="text-[13px] text-[#e4e4e7] line-clamp-2 leading-relaxed">
            {memory.content}
          </p>
        )}
        
        {/* Meta row */}
        <div className="flex items-center gap-3 mt-2">
          {/* Tags */}
          {memory.tags.length > 0 && (
            <div className="flex items-center gap-1.5">
              {memory.tags.slice(0, 2).map(tag => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#27272a] text-[#a1a1aa]"
                >
                  {tag}
                </span>
              ))}
              {memory.tags.length > 2 && (
                <span className="text-[10px] text-[#52525b]">+{memory.tags.length - 2}</span>
              )}
            </div>
          )}
          
          {/* Time */}
          <span className="text-[11px] text-[#52525b]">
            {formatRelativeTime(memory.timestamp)}
          </span>
          
          {/* Source app */}
          {memory.source_app && (
            <>
              <span className="text-[#3f3f46]">•</span>
              <span className="text-[11px] text-[#52525b]">
                {memory.source_app}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Delete button (hidden until hover) */}
      <button
        onClick={handleDelete}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-rose-500/10 text-[#52525b] hover:text-rose-400 transition-all"
        title="Delete memory"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
