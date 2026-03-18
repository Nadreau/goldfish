import { useState, useEffect, useCallback } from 'react';
import {
  Eye, EyeOff, ExternalLink, Download, Upload, Trash2, Check, Copy,
  ChevronDown, ChevronRight, CheckCircle, AlertTriangle, Zap, RefreshCw,
  Brain, Plug, XCircle, Link2, Unlink, BarChart3,
} from 'lucide-react';
import {
  deleteAllMemories, getAllMemories, saveMemory, checkCapturePermission,
  requestCapturePermission, checkTesseractInstalled, detectAiTools,
  connectAiTool, disconnectAiTool, startCapture,
  type AiToolStatus,
} from '../lib/api';
import { getUsageStats } from '../lib/geminiRateLimiter';

// ─── Types ──────────────────────────────────────────────────────────────────

type ApiStatus = 'unchecked' | 'checking' | 'ok' | 'rate-limited' | 'invalid' | 'error';

// Tool logos/branding
const TOOL_META: Record<string, { color: string; gradient: string; letter: string }> = {
  'claude-desktop': { color: 'text-orange-400', gradient: 'from-orange-500/20 to-amber-500/10', letter: 'C' },
  'claude-code':    { color: 'text-orange-400', gradient: 'from-orange-500/20 to-amber-500/10', letter: 'C' },
  'cursor':         { color: 'text-blue-400',   gradient: 'from-blue-500/20 to-cyan-500/10',    letter: 'Cu' },
  'windsurf':       { color: 'text-teal-400',   gradient: 'from-teal-500/20 to-cyan-500/10',    letter: 'W' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function Settings() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [keyVisible, setKeyVisible] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasTesseract, setHasTesseract] = useState<boolean | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  // API Health
  const [geminiStatus, setGeminiStatus] = useState<ApiStatus>('unchecked');
  const [geminiStatusMsg, setGeminiStatusMsg] = useState('');

  // AI Tool Connections
  const [tools, setTools] = useState<AiToolStatus[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    checkCapturePermission().then(setHasPermission).catch(() => setHasPermission(false));
    checkTesseractInstalled().then(setHasTesseract).catch(() => setHasTesseract(false));
    detectAiTools().then(setTools).catch(() => {});
  }, []);

  // Auto-check Gemini status on load
  useEffect(() => {
    if (geminiKey.trim()) {
      checkGeminiHealth();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (type: 'success' | 'error', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000); };

  const saveKey = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiKey.trim());
      flash('success', 'API key saved');
      checkGeminiHealth();
    } else {
      localStorage.removeItem('gemini_api_key');
      setGeminiStatus('unchecked');
      setGeminiStatusMsg('');
      flash('success', 'Key removed');
    }
  };

  // ─── Gemini Health Check ────────────────────────────────────────────────

  const checkGeminiHealth = useCallback(async () => {
    const key = localStorage.getItem('gemini_api_key');
    if (!key) {
      setGeminiStatus('unchecked');
      setGeminiStatusMsg('No API key set');
      return;
    }
    setGeminiStatus('checking');
    setGeminiStatusMsg('Validating API key...');
    try {
      // Step 1: Validate the key using models.list (FREE — no generation quota used)
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`
      );
      const listData = await listRes.json();

      if (!listRes.ok) {
        // Key itself is broken — show the real Google error
        const errMsg = listData.error?.message || `HTTP ${listRes.status}`;
        if (listRes.status === 400 || listRes.status === 403 || listRes.status === 401) {
          setGeminiStatus('invalid');
          setGeminiStatusMsg(`Invalid API key — ${errMsg}`);
        } else if (listRes.status === 429) {
          // Even the list endpoint is rate-limited — real project-level issue
          setGeminiStatus('rate-limited');
          setGeminiStatusMsg(`Google quota exhausted — ${errMsg}`);
        } else {
          setGeminiStatus('error');
          setGeminiStatusMsg(errMsg);
        }
        return;
      }

      // Step 2: Key is valid — check if gemini-2.0-flash is available
      const modelRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash?key=${key}`
      );

      if (!modelRes.ok) {
        const modelData = await modelRes.json();
        const errMsg = modelData.error?.message || `HTTP ${modelRes.status}`;
        if (modelRes.status === 404) {
          setGeminiStatus('error');
          setGeminiStatusMsg(`Model "gemini-2.0-flash" not available — ${errMsg}`);
        } else if (modelRes.status === 429) {
          // Key works but model endpoint is throttled — still basically OK
          setGeminiStatus('ok');
          setGeminiStatusMsg('Connected — key valid (model check throttled, will retry later)');
        } else {
          setGeminiStatus('error');
          setGeminiStatusMsg(errMsg);
        }
        return;
      }

      // Both checks passed — key is valid and model exists
      setGeminiStatus('ok');
      setGeminiStatusMsg('Connected — API key is valid');
    } catch {
      setGeminiStatus('error');
      setGeminiStatusMsg('Network error — check your connection');
    }
  }, []);

  // ─── AI Tool Connection Handlers ────────────────────────────────────────

  const handleConnect = async (toolId: string) => {
    setConnecting(toolId);
    try {
      await connectAiTool(toolId);
      // Refresh tool statuses
      const updated = await detectAiTools();
      setTools(updated);
      flash('success', `Connected! Restart the app to activate.`);
    } catch (err) {
      flash('error', `Failed to connect: ${err}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (toolId: string) => {
    setConnecting(toolId);
    try {
      await disconnectAiTool(toolId);
      const updated = await detectAiTools();
      setTools(updated);
      flash('success', 'Disconnected');
    } catch (err) {
      flash('error', `Failed: ${err}`);
    } finally {
      setConnecting(null);
    }
  };

  // ─── Data Handlers ─────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const m = await getAllMemories(10000);
      const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `goldfish-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      flash('success', `Exported ${m.length} memories`);
    } catch (err) { flash('error', `Export failed: ${err}`); }
  };

  const handleImport = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const memories = JSON.parse(text);
        let c = 0;
        for (const m of memories) {
          await saveMemory(m.content, m.tags || [], m.source || 'manual', m.source_app);
          c++;
        }
        flash('success', `Imported ${c} memories`);
      } catch (err) { flash('error', `Import failed: ${err}`); }
    };
    input.click();
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const c = await deleteAllMemories();
      flash('success', `Deleted ${c} memories`);
      setShowDeleteConfirm(false);
    } catch (err) { flash('error', `Failed: ${err}`); }
    finally { setDeleting(false); }
  };

  const mcpConfig = `"goldfish": {\n  "command": "npx",\n  "args": ["-y", "goldfish-mcp"]\n}`;
  const copyConfig = async () => { await navigator.clipboard.writeText(mcpConfig); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const systemReady = hasPermission === true && hasTesseract === true;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Drag region for macOS overlay title bar */}
      <div data-tauri-drag-region className="drag-region h-8 flex-shrink-0" />
      <header className="px-8 pb-4">
        <h1 className="text-[28px] font-bold text-white tracking-tight">Settings</h1>
      </header>

      {message && (
        <div className={`mx-8 mb-4 flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium animate-fade-in ${
          message.type === 'success' ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/20' : 'bg-red-500/[0.1] text-red-400 border border-red-500/20'
        }`}><CheckCircle size={15} /> {message.text}</div>
      )}

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="max-w-xl space-y-8">

          {/* ─── Gemini (Vision Engine) ─── */}
          <Section title="Vision Engine" icon={<Zap size={14} className="text-amber-400" />}>
            <div className="glass rounded-xl p-5 space-y-4">
              <div>
                <label className="text-[13px] text-slate-300 mb-2.5 block">Gemini API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type={keyVisible ? 'text' : 'password'} value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..."
                      className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                    <button onClick={() => setKeyVisible(!keyVisible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer">
                      {keyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button onClick={saveKey} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-[13px] font-semibold text-white cursor-pointer transition-all">Save</button>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[11px] text-amber-400/80 hover:text-amber-400">Get a free key <ExternalLink size={10} /></a>
                  <p className="text-[11px] text-slate-600">Powers screen analysis, chat, and memory compaction</p>
                </div>
              </div>

              {/* API Health Indicator */}
              <div className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                geminiStatus === 'ok' ? 'bg-emerald-500/[0.06] border border-emerald-500/15' :
                geminiStatus === 'rate-limited' ? 'bg-amber-500/[0.06] border border-amber-500/15' :
                geminiStatus === 'invalid' || geminiStatus === 'error' ? 'bg-red-500/[0.06] border border-red-500/15' :
                geminiStatus === 'checking' ? 'bg-amber-500/[0.06] border border-amber-500/15' :
                'bg-white/[0.02] border border-white/[0.04]'
              }`}>
                <div className="flex-shrink-0">
                  {geminiStatus === 'ok' && <CheckCircle size={16} className="text-emerald-400" />}
                  {geminiStatus === 'rate-limited' && <AlertTriangle size={16} className="text-amber-400" />}
                  {(geminiStatus === 'invalid' || geminiStatus === 'error') && <XCircle size={16} className="text-red-400" />}
                  {geminiStatus === 'checking' && <RefreshCw size={16} className="text-amber-400 animate-spin" />}
                  {geminiStatus === 'unchecked' && <div className="w-4 h-4 rounded-full bg-slate-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-medium ${
                    geminiStatus === 'ok' ? 'text-emerald-400' :
                    geminiStatus === 'rate-limited' ? 'text-amber-400' :
                    geminiStatus === 'invalid' || geminiStatus === 'error' ? 'text-red-400' :
                    geminiStatus === 'checking' ? 'text-amber-400' :
                    'text-slate-500'
                  }`}>
                    {geminiStatus === 'ok' ? 'Connected' :
                     geminiStatus === 'rate-limited' ? 'Rate Limited' :
                     geminiStatus === 'invalid' ? 'Invalid Key' :
                     geminiStatus === 'error' ? 'Error' :
                     geminiStatus === 'checking' ? 'Checking...' :
                     'Not connected'}
                  </p>
                  {geminiStatusMsg && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{geminiStatusMsg}</p>}
                </div>
                {geminiStatus !== 'checking' && geminiKey.trim() && (
                  <button onClick={checkGeminiHealth} className="p-1.5 rounded-lg hover:bg-white/[0.04] text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">
                    <RefreshCw size={13} />
                  </button>
                )}
              </div>

              {geminiStatus === 'rate-limited' && (
                <div className="p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/10">
                  <p className="text-[12px] text-amber-400/90 leading-relaxed">
                    The free Gemini tier allows 15 requests/min and 1,500/day. Goldfish uses Gemini for screen analysis,
                    memory compaction, and chat — so you can hit limits fast. Quota resets at midnight Pacific time.
                  </p>
                </div>
              )}

              {/* API Usage Stats */}
              <UsageStatsPanel />
            </div>
          </Section>

          {/* ─── AI Tool Connections (One-Click) ─── */}
          <Section title="Connect Your AI" icon={<Brain size={14} className="text-amber-400" />}>
            <p className="text-[12px] text-slate-500 mb-4 -mt-1">
              One click connects Goldfish to your AI tools. They get access to your screen memory automatically via MCP.
            </p>
            <div className="space-y-2.5">
              {tools.map(tool => {
                const meta = TOOL_META[tool.id] || { color: 'text-slate-400', gradient: 'from-slate-500/20 to-slate-500/10', letter: '?' };
                const isConnecting = connecting === tool.id;

                return (
                  <div key={tool.id} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      {/* Tool Icon */}
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} border border-white/[0.06] flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-[14px] font-bold ${meta.color}`}>{meta.letter}</span>
                      </div>

                      {/* Tool Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] text-white font-medium">{tool.name}</p>
                          {!tool.installed && (
                            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-slate-500 font-medium">Not installed</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {tool.connected
                            ? 'Connected — restart the app to activate'
                            : tool.installed
                              ? 'Ready to connect'
                              : 'Install the app first'}
                        </p>
                      </div>

                      {/* Connect/Disconnect Button */}
                      {tool.installed && (
                        tool.connected ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/15">
                              <Plug size={11} className="text-emerald-400" />
                              <span className="text-[11px] text-emerald-400 font-medium">Connected</span>
                            </span>
                            <button
                              onClick={() => handleDisconnect(tool.id)}
                              disabled={isConnecting}
                              className="p-1.5 rounded-lg hover:bg-white/[0.04] text-slate-600 hover:text-red-400 cursor-pointer transition-colors disabled:opacity-50"
                              title="Disconnect"
                            >
                              <Unlink size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleConnect(tool.id)}
                            disabled={isConnecting}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/80 to-orange-600/80 hover:from-amber-400/80 hover:to-orange-500/80 text-[12px] font-medium text-white cursor-pointer transition-all disabled:opacity-50 shadow-lg shadow-amber-500/10"
                          >
                            {isConnecting ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Link2 size={12} />
                            )}
                            {isConnecting ? 'Connecting...' : 'Connect'}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ─── Data ─── */}
          <Section title="Your Data">
            <div className="flex gap-3">
              {[{ icon: Download, label: 'Export', onClick: handleExport },
                { icon: Upload, label: 'Import', onClick: handleImport },
                { icon: Trash2, label: 'Delete All', onClick: () => setShowDeleteConfirm(true), danger: true }
              ].map(({ icon: Icon, label, onClick, danger }) => (
                <button key={label} onClick={onClick} className={`flex-1 flex flex-col items-center gap-2.5 py-5 rounded-xl glass glass-hover cursor-pointer transition-all ${danger ? 'hover:border-red-500/20' : ''}`}>
                  <Icon size={18} className={danger ? 'text-red-400/70' : 'text-amber-400/70'} />
                  <span className={`text-[12px] font-medium ${danger ? 'text-red-400/70' : 'text-slate-400'}`}>{label}</span>
                </button>
              ))}
            </div>
            {showDeleteConfirm && (
              <div className="mt-3 p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20 animate-fade-in">
                <p className="text-[13px] text-red-400 font-semibold">Delete all memories?</p>
                <p className="text-[12px] text-slate-500 mt-1 mb-3">This cannot be undone.</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg glass text-[12px] text-slate-400 cursor-pointer">Cancel</button>
                  <button onClick={handleDeleteAll} disabled={deleting} className="px-4 py-2 rounded-lg bg-red-500/20 text-[12px] text-red-400 font-semibold cursor-pointer disabled:opacity-50">{deleting ? 'Deleting...' : 'Yes, delete'}</button>
                </div>
              </div>
            )}
          </Section>

          {/* ─── Advanced ─── */}
          <div>
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-[13px] text-slate-500 hover:text-slate-400 cursor-pointer">
              {showAdvanced ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Advanced
            </button>
            {showAdvanced && (
              <div className="mt-4 space-y-4 animate-fade-in">
                <div className="glass rounded-xl p-5">
                  <p className="text-[13px] text-slate-300 font-medium mb-2">Manual MCP Config</p>
                  <p className="text-[11px] text-slate-500 mb-3">For tools not listed above, paste this into their MCP settings:</p>
                  <div className="relative group">
                    <pre className="p-3 rounded-lg bg-black/30 text-[12px] text-slate-400 font-mono leading-relaxed">{mcpConfig}</pre>
                    <button onClick={copyConfig} className="absolute top-2 right-2 p-1.5 rounded-md bg-white/[0.04] text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
                <div className="glass rounded-xl p-5">
                  <p className="text-[13px] text-slate-300 font-medium mb-3">Keyboard Shortcuts</p>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between"><span className="text-slate-500">Navigate pages</span><kbd className="px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 text-[11px] font-mono border border-white/[0.04]">Cmd+1-4</kbd></div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 px-1">Data: <code className="text-slate-500">~/.goldfish/memories.db</code> &middot; v0.1.0-alpha</p>
              </div>
            )}
          </div>

          {/* ─── System Status ─── */}
          <Section title="System">
            <div className={`flex items-center gap-4 p-4 rounded-xl ${
              systemReady ? 'bg-emerald-500/[0.06] border border-emerald-500/15' : 'bg-amber-500/[0.06] border border-amber-500/15'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${systemReady ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                {systemReady ? <CheckCircle size={18} className="text-emerald-400" /> : <AlertTriangle size={18} className="text-amber-400" />}
              </div>
              <div className="flex-1">
                <p className={`text-[14px] font-semibold ${systemReady ? 'text-emerald-400' : 'text-amber-400'}`}>{systemReady ? 'System ready' : 'Setup needed'}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">{systemReady ? 'Screen capture and OCR working' : hasPermission === false ? 'Enable Screen Recording in System Settings' : 'Run: brew install tesseract'}</p>
              </div>
              {hasPermission === false && (
                <button
                  onClick={async () => {
                    await requestCapturePermission();
                    // Poll for permission grant — user may take a few seconds in System Settings
                    let attempts = 0;
                    const poll = setInterval(async () => {
                      attempts++;
                      const granted = await checkCapturePermission();
                      if (granted) {
                        clearInterval(poll);
                        setHasPermission(true);
                        await startCapture();
                        flash('success', 'Screen recording enabled — capture started');
                      } else if (attempts >= 30) {
                        clearInterval(poll); // stop after 30s
                      }
                    }, 1000);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/80 to-orange-600/80 hover:from-amber-400/80 hover:to-orange-500/80 text-[12px] font-medium text-white cursor-pointer transition-all flex-shrink-0"
                >
                  Open Settings
                </button>
              )}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}

// ─── Usage Stats Panel ──────────────────────────────────────────────────────

function UsageStatsPanel() {
  const stats = getUsageStats();

  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={12} className="text-slate-500" />
        <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Today's API Usage</p>
      </div>

      {/* Usage bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1.5">
          <span className="text-[12px] text-slate-400">{stats.totalToday} / {stats.dailyBudget} calls</span>
          <span className={`text-[12px] font-medium ${
            stats.percentUsed >= 90 ? 'text-red-400' :
            stats.percentUsed >= 70 ? 'text-amber-400' :
            'text-emerald-400'
          }`}>{stats.percentUsed}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              stats.percentUsed >= 90 ? 'bg-red-500' :
              stats.percentUsed >= 70 ? 'bg-amber-500' :
              'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, stats.percentUsed)}%` }}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="py-1.5 rounded-lg bg-white/[0.02]">
          <p className="text-[14px] font-semibold text-slate-300">{stats.sceneToday}</p>
          <p className="text-[10px] text-slate-600">Scenes</p>
        </div>
        <div className="py-1.5 rounded-lg bg-white/[0.02]">
          <p className="text-[14px] font-semibold text-slate-300">{stats.compactorToday}</p>
          <p className="text-[10px] text-slate-600">Compaction</p>
        </div>
        <div className="py-1.5 rounded-lg bg-white/[0.02]">
          <p className="text-[14px] font-semibold text-slate-300">{stats.chatToday}</p>
          <p className="text-[10px] text-slate-600">Chat</p>
        </div>
      </div>

      {/* Backoff indicator */}
      {stats.isBackoff && (
        <div className="mt-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/10">
          <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />
          <p className="text-[11px] text-amber-400">Still recording — AI memory enrichment queued, resumes in {stats.backoffRemaining} min</p>
        </div>
      )}
    </div>
  );
}

// ─── Section Helper ─────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
        {icon}{title}
      </h2>
      {children}
    </section>
  );
}
