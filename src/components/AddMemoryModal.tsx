/**
 * AddMemoryModal - Premium modal for adding new memories
 */
import { useState, useEffect, useRef } from 'react';
import { X, Plus, Hash, Sparkles, Command, CornerDownLeft } from 'lucide-react';

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

  // Auto-focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && e.metaKey && content.trim()) {
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, onClose]);

  const addTag = (tag?: string) => {
    const newTag = (tag || tagInput).trim().toLowerCase();
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSave(content.trim(), tags);
    } finally {
      setSaving(false);
    }
  };

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
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-violet-500/30 blur-md" />
              <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                <Sparkles size={16} className="text-violet-400" />
              </div>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white">Add Memory</h3>
              <p className="text-[11px] text-zinc-500">Save something for your AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/[0.03] transition-colors"
          >
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Content input */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Content
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste or type anything — code, notes, URLs, preferences..."
                className="w-full h-32 px-4 py-3 rounded-xl bg-[#111113] border border-white/[0.04] text-[13px] text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/30 focus:ring-2 focus:ring-violet-500/10 resize-none transition-all leading-relaxed"
              />
              <div className="absolute bottom-3 right-3 text-[10px] text-zinc-600 tabular-nums">
                {content.length} chars
              </div>
            </div>
          </div>

          {/* Tags section */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Tags <span className="text-zinc-600 font-normal normal-case">(optional)</span>
            </label>
            
            {/* Tag input */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#111113] border border-white/[0.04] focus-within:border-violet-500/30 focus-within:ring-2 focus-within:ring-violet-500/10 transition-all">
                <Hash size={14} className="text-zinc-600" />
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add a tag..."
                  className="flex-1 bg-transparent text-[13px] text-white placeholder-zinc-600 focus:outline-none"
                />
              </div>
              <button
                onClick={() => addTag()}
                disabled={!tagInput.trim()}
                className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-zinc-500 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Suggested tags */}
            {tags.length === 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {suggestedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.02] text-zinc-500 hover:text-zinc-300 border border-white/[0.04] hover:border-white/[0.08] transition-all"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* Selected tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 text-[11px] font-medium border border-violet-500/20"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="p-0.5 rounded hover:bg-violet-500/20 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04] bg-[#0a0a0c]">
          <div className="flex items-center gap-1 text-[11px] text-zinc-600">
            <Command size={11} />
            <span>+</span>
            <CornerDownLeft size={11} />
            <span className="ml-1">to save</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[12px] text-zinc-500 hover:text-white hover:bg-white/[0.03] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!content.trim() || saving}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving...
                </span>
              ) : (
                'Save Memory'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
