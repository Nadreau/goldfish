/**
 * Settings — Simplified for humans
 * Goal: A 5-year-old could understand this
 */
import { useState, useEffect } from 'react';
import { Download, Upload, Trash2, AlertTriangle, CheckCircle, Eye, EyeOff, Zap, Shield, HelpCircle, ExternalLink, ChevronDown, ChevronRight, Copy, Check, Server } from 'lucide-react';
import { deleteAllMemories, getAllMemories, saveMemory, checkCapturePermission, checkTesseractInstalled } from '../lib/api';

export default function Settings() {
  // Core state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Settings values
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [keyVisible, setKeyVisible] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(() => {
    const saved = localStorage.getItem('capture_interval');
    return saved ? parseInt(saved) : 3000;
  });
  const [autoStart, setAutoStart] = useState(() => localStorage.getItem('auto_start_capture') === 'true');
  
  // System health
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasTesseract, setHasTesseract] = useState<boolean | null>(null);
  
  // Advanced section
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkCapturePermission().then(setHasPermission).catch(() => setHasPermission(false));
    checkTesseractInstalled().then(setHasTesseract).catch(() => setHasTesseract(false));
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveGeminiKey = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiKey.trim());
      showMsg('success', 'API key saved');
    } else {
      localStorage.removeItem('gemini_api_key');
      showMsg('success', 'API key removed');
    }
  };

  const handleIntervalChange = (value: number) => {
    setCaptureInterval(value);
    localStorage.setItem('capture_interval', value.toString());
  };

  const handleToggleAutoStart = () => {
    const newValue = !autoStart;
    setAutoStart(newValue);
    localStorage.setItem('auto_start_capture', newValue.toString());
  };

  const handleExport = async () => {
    try {
      const memories = await getAllMemories(10000);
      const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contextbridge-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg('success', `Exported ${memories.length} memories`);
    } catch (err) {
      showMsg('error', `Export failed: ${err}`);
    }
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
          await saveMemory(m.content, m.tags || [], m.source || 'manual', m.source_app);
          imported++;
        }
        showMsg('success', `Imported ${imported} memories`);
      } catch (err) {
        showMsg('error', `Import failed: ${err}`);
      }
    };
    input.click();
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const count = await deleteAllMemories();
      showMsg('success', `Deleted ${count} memories`);
      setShowDeleteConfirm(false);
    } catch (err) {
      showMsg('error', `Failed to delete: ${err}`);
    } finally {
      setDeleting(false);
    }
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

  const systemReady = hasPermission === true && hasTesseract === true;

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* Simple Header */}
      <header className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-white/[0.04]">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Keep it simple</p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-lg space-y-6">
          
          {/* Toast Message */}
          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-xl animate-fade-in ${
              message.type === 'success' 
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
            }`}>
              <CheckCircle size={16} />
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SYSTEM STATUS - Just show if ready or not
              ═══════════════════════════════════════════════════════════════ */}
          <section>
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${
              systemReady 
                ? 'bg-emerald-500/5 border-emerald-500/20' 
                : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                systemReady ? 'bg-emerald-500/20' : 'bg-amber-500/20'
              }`}>
                {systemReady ? (
                  <CheckCircle size={20} className="text-emerald-400" />
                ) : (
                  <AlertTriangle size={20} className="text-amber-400" />
                )}
              </div>
              <div className="flex-1">
                <p className={`font-medium ${systemReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {systemReady ? 'System Ready' : 'Setup Needed'}
                </p>
                <p className="text-xs text-zinc-500">
                  {systemReady 
                    ? 'Screen capture & OCR working' 
                    : hasPermission === false 
                      ? 'Enable Screen Recording in System Settings'
                      : 'Run: brew install tesseract'}
                </p>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              CAPTURE SETTINGS - Simple slider
              ═══════════════════════════════════════════════════════════════ */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Zap size={14} />
              Capture
            </h2>
            
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              {/* Speed slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-300">Speed</span>
                  <span className="text-sm font-mono text-violet-400">
                    {captureInterval < 1000 ? `${captureInterval}ms` : `${captureInterval/1000}s`}
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="10000"
                  step="1000"
                  value={captureInterval}
                  onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>Faster</span>
                  <span>Slower (saves battery)</span>
                </div>
              </div>

              {/* Auto-start toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <div>
                  <p className="text-sm text-zinc-300">Start automatically</p>
                  <p className="text-xs text-zinc-600">Begin capturing when app opens</p>
                </div>
                <button
                  onClick={handleToggleAutoStart}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    autoStart ? 'bg-violet-500' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    autoStart ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              AI CHAT - Just the API key
              ═══════════════════════════════════════════════════════════════ */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Shield size={14} />
              AI Chat
            </h2>
            
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              <p className="text-sm text-zinc-300 mb-3">Gemini API Key</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={keyVisible ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                  />
                  <button
                    onClick={() => setKeyVisible(!keyVisible)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                  >
                    {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={handleSaveGeminiKey}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium text-white transition-colors"
                >
                  Save
                </button>
              </div>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener"
                className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 mt-2"
              >
                Get free API key <ExternalLink size={10} />
              </a>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              YOUR DATA - Export, Import, Delete
              ═══════════════════════════════════════════════════════════════ */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-zinc-400">Your Data</h2>
            
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={handleExport}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <Download size={20} className="text-violet-400" />
                <span className="text-xs text-zinc-300">Export</span>
              </button>
              <button 
                onClick={handleImport}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <Upload size={20} className="text-violet-400" />
                <span className="text-xs text-zinc-300">Import</span>
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-rose-500/30 transition-colors"
              >
                <Trash2 size={20} className="text-rose-400" />
                <span className="text-xs text-zinc-300">Delete All</span>
              </button>
            </div>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 animate-fade-in">
                <p className="text-sm text-rose-400 font-medium mb-2">Delete everything?</p>
                <p className="text-xs text-zinc-400 mb-3">This cannot be undone. Export a backup first!</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAll}
                    disabled={deleting}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-xs text-rose-400 font-medium hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Yes, delete all'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              ADVANCED - Collapsed by default
              ═══════════════════════════════════════════════════════════════ */}
          <section>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <HelpCircle size={14} />
              Advanced / Help
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 animate-fade-in">
                {/* MCP Config */}
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Server size={14} className="text-emerald-400" />
                    <span className="text-sm text-zinc-300">Claude Desktop MCP Config</span>
                  </div>
                  <div className="relative group">
                    <pre className="p-3 rounded-lg bg-zinc-800 text-xs text-zinc-400 font-mono overflow-x-auto">
                      {mcpConfig}
                    </pre>
                    <button
                      onClick={handleCopyConfig}
                      className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Keyboard shortcuts */}
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                  <p className="text-sm text-zinc-300 mb-3">Keyboard Shortcuts</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Toggle Capture</span>
                      <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">⌘⇧C</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Navigate Pages</span>
                      <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">⌘1-4</kbd>
                    </div>
                  </div>
                </div>

                {/* Storage location */}
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                  <p className="text-sm text-zinc-300 mb-2">Data Location</p>
                  <code className="text-xs text-zinc-500 font-mono">~/.contextbridge/memories.db</code>
                </div>

                {/* Version */}
                <p className="text-xs text-zinc-600 text-center">
                  ContextBridge v0.1.0-alpha
                </p>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
