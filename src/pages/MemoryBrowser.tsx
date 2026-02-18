/**
 * Memory Browser — View and search all captured memories
 */
import { useState, useEffect, useCallback } from 'react';
import { Search, Clock, Monitor, X, ChevronRight, Trash2, Eye, Download, Copy, Check, RefreshCw } from 'lucide-react';
import { 
  getAllMemories, 
  searchMemories, 
  deleteMemory,
  type Memory 
} from '../lib/api';

export default function MemoryBrowser() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ocr' | 'manual'>('all');
  const [copied, setCopied] = useState(false);

  // Fetch memories
  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const data = search.trim() 
        ? await searchMemories(search, 100)
        : await getAllMemories(100);
      
      // Apply filter
      let filtered = data;
      if (filter === 'ocr') {
        filtered = data.filter(m => m.source === 'ocr-capture' || m.source === 'smart-capture');
      } else if (filter === 'manual') {
        filtered = data.filter(m => m.source === 'manual');
      }
      
      setMemories(filtered);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(fetchMemories, 300);
    return () => clearTimeout(t);
  }, [search, fetchMemories]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    try {
      await deleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCopyContent = async () => {
    if (selected) {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportMarkdown = () => {
    const markdown = memories.map(m => {
      const date = new Date(m.timestamp).toLocaleString();
      return `## ${date} - ${m.source_app || 'Unknown'}\n\n\`\`\`\n${m.content}\n\`\`\`\n\nTags: ${m.tags.join(', ') || 'none'}\n\n---\n`;
    }).join('\n');
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contextbridge-export-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex bg-[#09090b]">
      {/* ═══════════════════════════════════════════════════════════════════
          MEMORY LIST
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="w-[400px] flex flex-col border-r border-zinc-800">
        {/* Search */}
        <div className="p-4 border-b border-zinc-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={fetchMemories}
              disabled={loading}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {(['all', 'ocr', 'manual'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-violet-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'ocr' ? 'Screen Captures' : 'Manual'}
              </button>
            ))}
          </div>
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-500">
              <p>No memories found</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {memories.map((memory) => (
                <button
                  key={memory.id}
                  onClick={() => setSelected(memory)}
                  className={`w-full text-left p-4 hover:bg-zinc-900/50 transition-colors ${
                    selected?.id === memory.id ? 'bg-zinc-900' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      memory.source === 'ocr-capture' 
                        ? 'bg-emerald-500/20' 
                        : 'bg-zinc-800'
                    }`}>
                      {memory.source === 'ocr-capture' ? (
                        <Eye size={14} className="text-emerald-400" />
                      ) : (
                        <Monitor size={14} className="text-zinc-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 line-clamp-2" title={`${memory.content.length.toLocaleString()} characters`}>
                        {memory.content.split('\n')[0]}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Clock size={10} className="text-zinc-600" />
                        <span className="text-xs text-zinc-600">{formatTime(memory.timestamp)}</span>
                        {memory.source_app && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span className="text-xs text-zinc-500">{memory.source_app}</span>
                          </>
                        )}
                        <span className="text-zinc-700">·</span>
                        <span className="text-xs text-emerald-500">{memory.content.length.toLocaleString()} chars</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-700 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-600">{memories.length} memories</span>
          {memories.length > 0 && (
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              <Download size={12} />
              Export
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MEMORY DETAIL
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div>
                <h2 className="text-lg font-medium text-white">Memory Detail</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {new Date(selected.timestamp).toLocaleString()} · {selected.source_app || 'Unknown app'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyContent}
                  className="p-2 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Tags */}
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selected.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Full content */}
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {selected.content}
                </pre>
              </div>

              {/* Metadata */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-zinc-900/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 mb-1">Source</p>
                  <p className="text-sm text-zinc-300">{selected.source}</p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 mb-1">App</p>
                  <p className="text-sm text-zinc-300">{selected.source_app || 'Unknown'}</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <Monitor size={48} className="text-zinc-700 mb-4" />
            <p>Select a memory to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
