import { useState, useEffect } from 'react';
import { Eye, EyeOff, ExternalLink, ChevronRight, Link2, CheckCircle, RefreshCw } from 'lucide-react';
import { detectAiTools, connectAiTool, type AiToolStatus } from '../lib/api';

const TOOL_META: Record<string, { color: string; gradient: string; letter: string }> = {
  'claude-desktop': { color: 'text-orange-400', gradient: 'from-orange-500/20 to-amber-500/10', letter: 'C' },
  'claude-code':    { color: 'text-orange-400', gradient: 'from-orange-500/20 to-amber-500/10', letter: 'C' },
  'cursor':         { color: 'text-blue-400',   gradient: 'from-blue-500/20 to-cyan-500/10',    letter: 'Cu' },
  'windsurf':       { color: 'text-teal-400',   gradient: 'from-teal-500/20 to-cyan-500/10',    letter: 'W' },
};

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [geminiKey, setGeminiKey] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [tools, setTools] = useState<AiToolStatus[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    detectAiTools().then(setTools).catch(() => {});
  }, []);

  const handleSaveKey = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiKey.trim());
    }
    setStep(2);
  };

  const handleConnect = async (toolId: string) => {
    setConnecting(toolId);
    try {
      await connectAiTool(toolId);
      const updated = await detectAiTools();
      setTools(updated);
    } catch { /* ignore */ }
    finally { setConnecting(null); }
  };

  const handleFinish = () => {
    localStorage.setItem('gf_onboarding_complete', 'true');
    // Also set old key for backward compat
    localStorage.setItem('cb_onboarding_complete', 'true');
    onComplete();
  };

  // Shared button styles
  const primaryBtn = "inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-[14px] font-semibold text-white cursor-pointer shadow-md shadow-amber-500/20 transition-colors duration-150 hover:from-amber-400 hover:to-orange-500 active:from-amber-600 active:to-orange-700";
  const ghostBtn = "text-[13px] text-slate-500 hover:text-slate-300 cursor-pointer transition-colors duration-150";

  return (
    <div className="app-bg h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="animate-fade-in flex flex-col items-center text-center">
            <img
              src="/goldfish-profile.png"
              alt="Goldfish"
              className="w-28 mb-8 drop-shadow-[0_4px_16px_rgba(245,158,11,0.4)]"
            />
            <h1 className="text-[32px] font-bold text-white tracking-tight mb-3">
              Meet Goldfish
            </h1>
            <p className="text-[15px] text-slate-400 leading-relaxed mb-2 max-w-[340px]">
              Your AI finally has a memory. Goldfish watches your screen, remembers everything, and feeds context into any AI tool you use.
            </p>
            <p className="text-[13px] text-slate-500 mb-10">
              Everything stays local on your machine. Always.
            </p>
            <button onClick={() => setStep(1)} className={primaryBtn}>
              Get Started
            </button>
          </div>
        )}

        {/* Step 1: Gemini Key */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-widest">Step 1 of 2</span>
            </div>

            <h2 className="text-[24px] font-bold text-white tracking-tight mb-2">
              Connect Gemini
            </h2>
            <p className="text-[13px] text-slate-400 leading-relaxed mb-6 max-w-[360px]">
              Goldfish uses Gemini Flash (free) to understand your screen. It analyzes captures, compacts memories, and powers the built-in chat.
            </p>

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 mb-6">
              <label className="text-[13px] text-slate-300 mb-2.5 block font-medium">Gemini API Key</label>
              <div className="relative">
                <input
                  type={keyVisible ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-4 py-3 pr-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[14px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-shadow duration-200"
                  autoFocus
                />
                <button onClick={() => setKeyVisible(!keyVisible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">
                  {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 text-[12px] text-amber-400/80 hover:text-amber-400 mt-3 transition-colors">
                Get a free key from Google AI Studio <ExternalLink size={11} />
              </a>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(2)} className={ghostBtn}>
                Skip for now
              </button>
              <button onClick={handleSaveKey} className={primaryBtn}>
                Continue <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Connect AI Tools */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-widest">Step 2 of 2</span>
            </div>

            <h2 className="text-[24px] font-bold text-white tracking-tight mb-2">
              Connect Your AI Tools
            </h2>
            <p className="text-[13px] text-slate-400 leading-relaxed mb-6 max-w-[360px]">
              One click gives your AI tools access to your screen memory. They'll know what you've been working on without you having to explain.
            </p>

            <div className="space-y-2.5 mb-8">
              {tools.filter(t => t.installed).map(tool => {
                const meta = TOOL_META[tool.id] || { color: 'text-slate-400', gradient: 'from-slate-500/20 to-slate-500/10', letter: '?' };
                const isConnecting = connecting === tool.id;
                return (
                  <div key={tool.id} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} border border-white/[0.06] flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-[14px] font-bold ${meta.color}`}>{meta.letter}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-white font-medium">{tool.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {tool.connected ? 'Connected — restart the app to activate' : 'Click to connect automatically'}
                        </p>
                      </div>
                      {tool.connected ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex-shrink-0">
                          <CheckCircle size={12} className="text-emerald-400" />
                          <span className="text-[11px] text-emerald-400 font-medium">Done</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConnect(tool.id)}
                          disabled={isConnecting}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-[12px] font-medium text-white cursor-pointer transition-colors duration-150 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 flex-shrink-0"
                        >
                          {isConnecting ? <RefreshCw size={12} className="animate-spin" /> : <Link2 size={12} />}
                          {isConnecting ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {tools.filter(t => t.installed).length === 0 && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 text-center">
                  <p className="text-[13px] text-slate-400">No supported AI tools detected yet.</p>
                  <p className="text-[12px] text-slate-500 mt-1">Install Claude Desktop, Claude Code, or Cursor and they'll appear here.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className={ghostBtn}>
                Back
              </button>
              <button onClick={handleFinish} className={primaryBtn}>
                Start Using Goldfish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
