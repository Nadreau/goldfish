/**
 * MemoryDetail - Premium modal for viewing/editing memories
 */
import { useState } from 'react';
import { X, Trash2, Clock, Monitor, Tag, Copy, Check, ExternalLink } from 'lucide-react';
import type { Memory } from '../lib/api';

interface Props {
  memory: Memory;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}

const sourceLabels: Record<string, { label: string; color: string }> = {
  clipboard: { label: 'Clipboard', color: 'text-violet-400 bg-violet-500/10' },
  screenshot: { label: 'Screenshot', color: 'text-rose-400 bg-rose-500/10' },
  'app-tracking': { label: 'App Activity', color: 'text-cyan-400 bg-cyan-500/10' },
  manual: { label: 'Manual', color: 'text-amber-400 bg-amber-500/10' },
  browser: { label: 'Browser', color: 'text-blue-400 bg-blue-500/10' },
};

export default function MemoryDetail({ memory, onClose, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(memory.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(memory.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const sourceInfo = sourceLabels[memory.source] || { label: memory.source, color: 'text-zinc-400 bg-zinc-500/10' };

  // Check if content looks like a URL
  const isUrl = memory.content.match(/^https?:\/\/\S+$/);

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#0f0f12] border border-white/[0.06] rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl shadow-black/50 animate-fade-in-scale"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${sourceInfo.color}`}>
              {sourceInfo.label}
            </div>
            {memory.source_app && (
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Monitor size={11} />
                {memory.source_app}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/[0.03] transition-colors"
          >
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Main content */}
          <div className="relative group">
            <div className="p-4 rounded-xl bg-[#111113] border border-white/[0.04] max-h-64 overflow-y-auto">
              {isUrl ? (
                <a 
                  href={memory.content} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[13px] text-violet-400 hover:text-violet-300 break-all flex items-center gap-2"
                >
                  {memory.content}
                  <ExternalLink size={12} className="flex-shrink-0" />
                </a>
              ) : (
                <pre className="text-[13px] text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed">
                  {memory.content}
                </pre>
              )}
            </div>
            
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-2 rounded-lg bg-[#1a1a1d] border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-[#222225] opacity-0 group-hover:opacity-100 transition-all"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>

          {/* Tags */}
          {memory.tags.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              <Tag size={12} className="text-zinc-500" />
              <div className="flex flex-wrap gap-1.5">
                {memory.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[11px] font-medium border border-violet-500/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-2 mt-4 text-[11px] text-zinc-500">
            <Clock size={12} />
            <span>{formatDate(memory.timestamp)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04] bg-[#0a0a0c]">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
              confirmDelete
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
            }`}
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[12px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
