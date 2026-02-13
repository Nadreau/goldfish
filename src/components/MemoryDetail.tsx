/**
 * MemoryDetail — Modal for viewing/deleting memories
 * Fixed to prevent crashes
 */
import { useState } from 'react';
import { X, Trash2, Clock, Monitor, Tag, Copy, Check, ExternalLink, Brain, Clipboard, Camera, Sparkles } from 'lucide-react';
import type { Memory } from '../lib/api';

interface Props {
  memory: Memory | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}

const sourceLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  clipboard: { label: 'Clipboard', color: 'text-violet-400 bg-violet-500/10', icon: <Clipboard size={12} /> },
  screenshot: { label: 'Screenshot', color: 'text-rose-400 bg-rose-500/10', icon: <Camera size={12} /> },
  'app-tracking': { label: 'App Activity', color: 'text-cyan-400 bg-cyan-500/10', icon: <Monitor size={12} /> },
  'smart-capture': { label: 'Smart Capture', color: 'text-emerald-400 bg-emerald-500/10', icon: <Brain size={12} /> },
  manual: { label: 'Manual', color: 'text-amber-400 bg-amber-500/10', icon: <Sparkles size={12} /> },
  browser: { label: 'Browser', color: 'text-blue-400 bg-blue-500/10', icon: <ExternalLink size={12} /> },
};

export default function MemoryDetail({ memory, onClose, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  // Guard against null/undefined memory
  if (!memory) {
    return null;
  }

  // Safely get memory properties with defaults
  const content = memory.content || '';
  const source = memory.source || 'unknown';
  const sourceApp = memory.source_app || null;
  const tags = Array.isArray(memory.tags) ? memory.tags : [];
  const timestamp = memory.timestamp || new Date().toISOString();
  const id = memory.id || '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!id) return;
    
    setDeleting(true);
    try {
      await onDelete(id);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleDateString(undefined, { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown date';
    }
  };

  const sourceInfo = sourceLabels[source] || { 
    label: source, 
    color: 'text-zinc-400 bg-zinc-500/10',
    icon: <Brain size={12} />
  };

  // Check if content looks like a URL
  const isUrl = content.match(/^https?:\/\/\S+$/);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-[#0f0f12] border border-white/[0.06] rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl shadow-black/50 animate-fade-in-scale"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${sourceInfo.color}`}>
              {sourceInfo.icon}
              {sourceInfo.label}
            </div>
            {sourceApp && (
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Monitor size={11} />
                {sourceApp}
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
                  href={content} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[13px] text-violet-400 hover:text-violet-300 break-all flex items-center gap-2"
                >
                  {content}
                  <ExternalLink size={12} className="flex-shrink-0" />
                </a>
              ) : (
                <pre className="text-[13px] text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed break-words">
                  {content || '(No content)'}
                </pre>
              )}
            </div>
            
            {/* Copy button */}
            {content && (
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 rounded-lg bg-[#1a1a1d] border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-[#222225] opacity-0 group-hover:opacity-100 transition-all"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              <Tag size={12} className="text-zinc-500" />
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
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
            <span>{formatDate(timestamp)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04] bg-[#0a0a0c]">
          <button
            onClick={handleDelete}
            disabled={deleting || !id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
              confirmDelete
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
            } disabled:opacity-50`}
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
