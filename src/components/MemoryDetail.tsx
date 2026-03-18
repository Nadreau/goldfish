import { useState } from 'react';
import { X, Trash2, Clock, Copy, Check, ExternalLink } from 'lucide-react';
import type { Memory } from '../lib/api';

interface Props {
  memory: Memory | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}

const sourceLabels: Record<string, { label: string; color: string }> = {
  clipboard: { label: 'Clipboard', color: 'text-sky-400 bg-sky-500/10 border-sky-500/15' },
  screenshot: { label: 'Screenshot', color: 'text-amber-400 bg-amber-500/10 border-amber-500/15' },
  'app-tracking': { label: 'App Activity', color: 'text-amber-400 bg-amber-500/10 border-amber-500/15' },
  'smart-capture': { label: 'Smart Capture', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15' },
  'ocr-capture': { label: 'Screen Capture', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15' },
  manual: { label: 'Manual', color: 'text-orange-400 bg-orange-500/10 border-orange-500/15' },
  browser: { label: 'Browser', color: 'text-sky-400 bg-sky-500/10 border-sky-500/15' },
};

export default function MemoryDetail({ memory, onClose, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!memory) return null;

  const content = memory.content || '';
  const source = memory.source || 'unknown';
  const sourceApp = memory.source_app || null;
  const tags = Array.isArray(memory.tags) ? memory.tags : [];
  const timestamp = memory.timestamp || new Date().toISOString();
  const id = memory.id || '';
  const isUrl = content.match(/^https?:\/\/\S+$/);
  const info = sourceLabels[source] || { label: source, color: 'text-slate-400 bg-slate-500/10 border-slate-500/15' };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (!id) return;
    setDeleting(true);
    try { await onDelete(id); onClose(); }
    catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Unknown'; }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl shadow-black/60 animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${info.color}`}>{info.label}</span>
            {sourceApp && <span className="text-[12px] text-slate-500">{sourceApp}</span>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="relative group">
            <div className="glass rounded-xl p-4 max-h-64 overflow-y-auto">
              {isUrl ? (
                <a href={content} target="_blank" rel="noopener noreferrer" className="text-[13px] text-amber-400 hover:text-amber-300 break-all flex items-center gap-1.5">
                  {content} <ExternalLink size={12} />
                </a>
              ) : (
                <pre className="text-[13px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed break-words">{content || '(No content)'}</pre>
              )}
            </div>
            {content && (
              <button onClick={handleCopy} className="absolute top-3 right-3 p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {tags.map((tag, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-medium border border-amber-500/10">#{tag}</span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 text-[12px] text-slate-500">
            <Clock size={12} />
            <span>{formatDate(timestamp)}</span>
            <span className="text-slate-600">&middot;</span>
            <span className="text-slate-600">{content.length.toLocaleString()} chars</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
          <button
            onClick={handleDelete}
            disabled={deleting || !id}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] cursor-pointer transition-all ${
              confirmDelete
                ? 'bg-red-500/[0.1] text-red-400 font-semibold border border-red-500/20'
                : 'text-slate-500 hover:text-red-400 hover:bg-red-500/[0.06]'
            } disabled:opacity-40`}
          >
            <Trash2 size={13} />
            {deleting ? 'Deleting...' : confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl glass glass-hover text-[12px] text-slate-400 hover:text-slate-300 cursor-pointer transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
