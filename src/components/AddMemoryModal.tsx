import { useState, useEffect, useRef } from 'react';
import { X, Plus, Hash } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSave: (content: string, tags: string[]) => Promise<void>;
}

const suggestedTags = ['important', 'code', 'url', 'note', 'todo', 'reference'];

export default function AddMemoryModal({ onClose, onSave }: Props) {
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && e.metaKey && content.trim()) handleSave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [content, onClose]);

  const addTag = (tag?: string) => {
    const t = (tag || tagInput).trim().toLowerCase();
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput(''); }
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try { await onSave(content.trim(), tags); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl shadow-black/60 animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h3 className="text-[16px] font-semibold text-white">Add Memory</h3>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5 block">Content</label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Paste or type anything..."
                className="w-full h-32 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none leading-relaxed"
              />
              <span className="absolute bottom-3 right-3.5 text-[10px] text-slate-600 tabular-nums font-mono">{content.length}</span>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5 block">
              Tags <span className="font-normal normal-case text-slate-600">(optional)</span>
            </label>
            <div className="flex gap-2 mb-3">
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] focus-within:ring-2 focus-within:ring-amber-500/30">
                <Hash size={13} className="text-slate-600" />
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag..."
                  className="flex-1 bg-transparent text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
              <button onClick={() => addTag()} disabled={!tagInput.trim()} className="p-2.5 rounded-xl glass glass-hover text-slate-500 hover:text-slate-300 disabled:opacity-30 cursor-pointer transition-all">
                <Plus size={15} />
              </button>
            </div>

            {tags.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map(t => (
                  <button key={t} onClick={() => addTag(t)} className="px-2.5 py-1 rounded-lg text-[11px] text-slate-500 bg-white/[0.02] border border-white/[0.04] hover:border-amber-500/20 hover:text-amber-400 cursor-pointer transition-all">
                    #{t}
                  </button>
                ))}
              </div>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-medium border border-amber-500/10">
                    #{t}
                    <button onClick={() => setTags(tags.filter(x => x !== t))} className="p-0.5 rounded hover:bg-amber-500/20 cursor-pointer">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
          <span className="text-[11px] text-slate-600">Cmd+Enter to save</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-[13px] text-slate-400 hover:text-slate-300 hover:bg-white/[0.03] cursor-pointer transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!content.trim() || saving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[13px] font-semibold disabled:opacity-40 cursor-pointer transition-all"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
