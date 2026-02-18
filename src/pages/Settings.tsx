/**
 * Settings - Premium design with glass morphism
 */
import { useState } from 'react';
import { Server, Download, Upload, Trash2, ExternalLink, AlertTriangle, CheckCircle, Settings as SettingsIcon, Copy, Check, Database, Sparkles, Key, Eye, EyeOff } from 'lucide-react';
import { deleteAllMemories, getAllMemories, saveMemory } from '../lib/api';

export default function Settings() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [keyVisible, setKeyVisible] = useState(false);

  const handleSaveGeminiKey = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiKey.trim());
      setMessage({ type: 'success', text: 'Gemini API key saved' });
    } else {
      localStorage.removeItem('gemini_api_key');
      setMessage({ type: 'success', text: 'Gemini API key removed' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const mcpConfig = `"contextbridge": {
  "command": "npx",
  "args": ["-y", "contextbridge"]
}`;

  const handleCopyConfig = async () => {
    await navigator.clipboard.writeText(mcpConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const count = await deleteAllMemories();
      setMessage({ type: 'success', text: `Deleted ${count} memories` });
      setShowDeleteConfirm(false);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to delete: ${err}` });
    } finally {
      setDeleting(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleExport = async () => {
    try {
      const memories = await getAllMemories(10000);
      const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contextbridge-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Exported ${memories.length} memories` });
    } catch (err) {
      setMessage({ type: 'error', text: `Export failed: ${err}` });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const memories = JSON.parse(text);
        let imported = 0;
        
        for (const m of memories) {
          await saveMemory(
            m.content,
            m.tags || [],
            m.source || 'manual',
            m.source_app
          );
          imported++;
        }
        
        setMessage({ type: 'success', text: `Imported ${imported} memories` });
      } catch (err) {
        setMessage({ type: 'error', text: `Import failed: ${err}` });
      }
      setTimeout(() => setMessage(null), 3000);
    };
    input.click();
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] relative">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-32 bg-gradient-to-b from-violet-500/[0.05] to-transparent pointer-events-none" />
      
      {/* Header */}
      <header className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-white/[0.04] relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] flex items-center justify-center ring-1 ring-white/[0.06]">
            <SettingsIcon size={18} className="text-zinc-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Settings</h1>
            <p className="text-[12px] text-zinc-500">Configure ContextBridge</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 relative">
        <div className="max-w-2xl space-y-6">
          {/* Status Message */}
          {message && (
            <div className={`flex items-center gap-3 p-4 rounded-xl border animate-fade-in-up ${
              message.type === 'success' 
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/5 border-rose-500/20 text-rose-400'
            }`}>
              <CheckCircle size={16} />
              <span className="text-[13px]">{message.text}</span>
            </div>
          )}

          {/* MCP Server Status */}
          <section className="animate-fade-in-up">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              AI Integration
            </h2>
            <div className="p-5 rounded-2xl bg-[#111113] border border-white/[0.04] relative overflow-hidden">
              {/* Subtle glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl pointer-events-none" />
              
              <div className="flex items-center justify-between mb-4 relative">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
                    <Server size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-white">MCP Server</p>
                    <p className="text-[11px] text-zinc-500">Model Context Protocol</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse-soft" />
                  <span className="text-[11px] font-medium text-emerald-400">Ready</span>
                </div>
              </div>
              
              <p className="text-[12px] text-zinc-500 mb-3 relative">
                Add this to your Claude Desktop config:
              </p>
              
              <div className="relative group">
                <pre className="p-4 rounded-xl bg-[#0a0a0c] border border-white/[0.04] text-[12px] text-violet-300 font-mono overflow-x-auto">
                  {mcpConfig}
                </pre>
                <button
                  onClick={handleCopyConfig}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </section>

          {/* Gemini API Key */}
          <section className="animate-fade-in-up stagger-1">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Chat (Gemini)
            </h2>
            <div className="p-5 rounded-2xl bg-[#111113] border border-white/[0.04] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-4 relative">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                  <Key size={18} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white">Gemini API Key</p>
                  <p className="text-[11px] text-zinc-500">Powers the Chat feature</p>
                </div>
              </div>
              
              <div className="space-y-3 relative">
                <div className="relative">
                  <input
                    type={keyVisible ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-4 py-3 pr-20 rounded-xl bg-[#0a0a0c] border border-white/[0.04] text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30"
                  />
                  <button
                    onClick={() => setKeyVisible(!keyVisible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-zinc-500 hover:text-zinc-300"
                  >
                    {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener"
                    className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    Get free API key <ExternalLink size={10} />
                  </a>
                  <button
                    onClick={handleSaveGeminiKey}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-[12px] font-medium text-white transition-colors"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Storage */}
          <section className="animate-fade-in-up stagger-1">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Storage
            </h2>
            <div className="p-5 rounded-2xl bg-[#111113] border border-white/[0.04]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center ring-1 ring-white/[0.06]">
                  <Database size={18} className="text-zinc-400" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white">Data Location</p>
                  <p className="text-[11px] text-zinc-500">Local SQLite database</p>
                </div>
              </div>
              <code className="block w-full px-4 py-3 rounded-xl bg-[#0a0a0c] border border-white/[0.04] text-[12px] text-zinc-400 font-mono">
                ~/.contextbridge/memories.db
              </code>
            </div>
          </section>

          {/* Data Management */}
          <section className="animate-fade-in-up stagger-2">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Data Management
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleExport}
                className="group flex items-center justify-center gap-2 p-4 rounded-xl bg-[#111113] border border-white/[0.04] text-[13px] font-medium text-white hover:border-violet-500/30 hover:bg-[#141416] transition-all"
              >
                <Download size={16} className="text-violet-400 group-hover:scale-110 transition-transform" />
                Export Data
              </button>
              <button 
                onClick={handleImport}
                className="group flex items-center justify-center gap-2 p-4 rounded-xl bg-[#111113] border border-white/[0.04] text-[13px] font-medium text-white hover:border-violet-500/30 hover:bg-[#141416] transition-all"
              >
                <Upload size={16} className="text-violet-400 group-hover:scale-110 transition-transform" />
                Import Data
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="animate-fade-in-up stagger-3">
            <h2 className="text-[11px] font-medium text-rose-400/70 uppercase tracking-wider mb-3 px-1">
              Danger Zone
            </h2>
            <div className="p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 text-[13px] text-rose-400 hover:text-rose-300 transition-colors"
                >
                  <Trash2 size={16} />
                  Delete All Data
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertTriangle size={16} />
                    <p className="text-[13px] font-medium">This action cannot be undone</p>
                  </div>
                  <p className="text-[12px] text-zinc-500">
                    All your memories will be permanently deleted. Make sure you've exported a backup.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[12px] text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleDeleteAll}
                      disabled={deleting}
                      className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-[12px] text-rose-400 font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete Everything'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* About */}
          <section className="animate-fade-in-up stagger-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/[0.05] via-purple-500/[0.03] to-transparent border border-violet-500/10 relative overflow-hidden">
              {/* Subtle glow */}
              <div className="absolute top-0 left-0 w-32 h-32 bg-violet-500/10 blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-4 relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                  <Sparkles size={18} className="text-violet-400" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white">About ContextBridge</h2>
                  <p className="text-[11px] text-zinc-500">v0.1.0-alpha</p>
                </div>
              </div>
              <div className="space-y-2 text-[12px] text-zinc-400 relative">
                <p>Universal AI Memory — Your context, everywhere</p>
                <p className="text-[11px] text-zinc-600">Built with Tauri + React + Rust</p>
                <div className="flex gap-4 pt-3">
                  <a 
                    href="https://github.com/nikonadreau/contextbridge" 
                    target="_blank" 
                    rel="noopener" 
                    className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    GitHub <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
