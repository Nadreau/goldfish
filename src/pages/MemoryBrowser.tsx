import { useState, useEffect, useCallback } from 'react';
import { Search, Monitor, X, Trash2, Download, Copy, Check, RefreshCw } from 'lucide-react';
import { getAllMemories, searchMemories, deleteMemory, formatRelativeTime, getMemoryPreview, cleanSourceApp, type Memory } from '../lib/api';

export default function MemoryBrowser() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ocr' | 'manual'>('all');
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const data = search.trim() ? await searchMemories(search, 100) : await getAllMemories(100);
      let filtered = data;
      if (filter === 'ocr') filtered = data.filter(m => m.source === 'ocr-capture' || m.source === 'smart-capture');
      else if (filter === 'manual') filtered = data.filter(m => m.source === 'manual');
      setMemories(filtered);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, filter]);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);
  useEffect(() => { const t = setTimeout(fetchMemories, 300); return () => clearTimeout(t); }, [search, fetchMemories]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    setDeleting(id);
    try { await deleteMemory(id); setMemories(prev => prev.filter(m => m.id !== id)); if (selected?.id === id) setSelected(null); }
    catch (err) { console.error(err); }
    finally { setDeleting(null); }
  };

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const md = memories.map(m => `## ${new Date(m.timestamp).toLocaleString()} - ${m.source_app || 'Unknown'}\n\`\`\`\n${m.content}\n\`\`\`\n---\n`).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `goldfish-export-${new Date().toISOString().split('T')[0]}.md`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* List Panel */}
      <div className="w-[400px] flex flex-col border-r border-white/[0.06]">
        {/* Drag region for macOS overlay title bar */}
        <div data-tauri-drag-region className="drag-region h-8 flex-shrink-0" />
        <div className="px-5 pb-5 space-y-3">
          <h2 className="text-[20px] font-bold text-white tracking-tight">Memories</h2>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl glass text-[13px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={fetchMemories} disabled={loading} className="p-2 rounded-lg glass glass-hover cursor-pointer text-slate-500 disabled:opacity-40">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {(['all', 'ocr', 'manual'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-all ${
                  filter === f
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }`}>
                {f === 'all' ? 'All' : f === 'ocr' ? 'Screen' : 'Manual'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-slate-500">{search ? 'No matches' : 'No memories yet'}</div>
          ) : (
            <div className="space-y-0.5">
              {memories.map(m => {
                const preview = getMemoryPreview(m);
                return (
                  <button key={m.id} onClick={() => setSelected(m)}
                    className={`w-full text-left px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 ${
                      selected?.id === m.id ? 'glass' : 'hover:bg-white/[0.03]'
                    }`}>
                    <p className="text-[13px] text-slate-300 truncate leading-snug font-medium">{preview.title}</p>
                    {preview.detail && (
                      <p className="text-[12px] text-slate-600 truncate mt-0.5">{preview.detail}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {cleanSourceApp(m.source_app) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] text-slate-500 font-medium">
                          {cleanSourceApp(m.source_app)}
                        </span>
                      )}
                      {cleanSourceApp(m.source_app) && <span className="text-slate-700">&middot;</span>}
                      <span className="text-[11px] text-slate-600">{formatRelativeTime(m.timestamp)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[11px] text-slate-600">{memories.length} memories</span>
          {memories.length > 0 && (
            <button onClick={handleExport} className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer">
              <Download size={12} /> Export
            </button>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <div>
                <p className="text-[16px] font-semibold text-white">Memory Detail</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {new Date(selected.timestamp).toLocaleString()} &middot; {cleanSourceApp(selected.source_app) || 'Unknown'} &middot; {selected.content.length.toLocaleString()} chars
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleCopy} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] cursor-pointer">
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
                <button onClick={() => handleDelete(selected.id)} disabled={deleting === selected.id} className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/[0.06] cursor-pointer disabled:opacity-40">
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setSelected(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selected.tags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-medium border border-amber-500/10">#{tag}</span>
                  ))}
                </div>
              )}
              <div className="glass rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.04] flex justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">Content</span>
                  <span className="text-[11px] text-slate-600">{selected.content.split('\n').length} lines</span>
                </div>
                <pre className="p-4 text-[13px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed break-words">{selected.content}</pre>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Monitor size={36} className="text-slate-700 mb-3" />
            <p className="text-[14px] text-slate-500">Select a memory to view</p>
          </div>
        )}
      </div>
    </div>
  );
}
