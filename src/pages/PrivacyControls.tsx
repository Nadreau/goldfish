/**
 * PrivacyControls - Premium design with Continuous Capture + OCR
 */
import { useState, useEffect, useRef } from 'react';
import { Camera, Clipboard, Monitor, Globe, Pause, Play, Shield, AlertTriangle, Info, Clock, Activity, RefreshCw, Video, Square, Circle, Eye, Scan, Zap } from 'lucide-react';
import { useCaptureContext } from '../lib/captureContext';
import ActivityFeed from '../components/ActivityFeed';
import { 
  startScreenRecording, 
  stopScreenRecording, 
  getRecordingStatus,
  startContinuousCapture,
  stopContinuousCapture,
  getContinuousCaptureStatus,
  captureAndOCR,
  type ContinuousCaptureStatus,
  type ContinuousCaptureResult,
} from '../lib/api';

interface ToggleCardProps {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function ToggleCard({ icon: Icon, iconColor, title, description, enabled, disabled, onToggle }: ToggleCardProps) {
  return (
    <div 
      className={`group flex items-center justify-between p-4 rounded-xl bg-[#111113] border transition-all duration-200 ${
        disabled 
          ? 'opacity-50 border-white/[0.04]' 
          : enabled 
            ? 'border-violet-500/20 bg-gradient-to-r from-violet-500/[0.05] to-transparent' 
            : 'border-white/[0.04] hover:border-white/[0.08]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${enabled ? 'bg-' + iconColor.split('-')[1] + '-500/10' : 'bg-white/[0.03]'} flex items-center justify-center ring-1 ring-white/[0.06] transition-colors`}>
          <Icon size={18} className={enabled ? iconColor : 'text-zinc-500'} />
        </div>
        <div>
          <p className="text-[13px] font-medium text-white">{title}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>
      
      <button 
        onClick={onToggle}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
          enabled ? 'bg-violet-600' : 'bg-zinc-800'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm ${
          enabled ? 'left-6' : 'left-1'
        }`} />
      </button>
    </div>
  );
}

const frequencies = [
  { label: '10s', value: 10, desc: 'Real-time' },
  { label: '30s', value: 30, desc: 'Frequent' },
  { label: '1m', value: 60, desc: 'Moderate' },
  { label: '5m', value: 300, desc: 'Light' },
];

export default function PrivacyControls() {
  const { 
    status, 
    settings, 
    events,
    isCapturing,
    toggleCapture, 
    updateSettings,
    captureNow 
  } = useCaptureContext();

  // Screen recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);

  // Continuous capture + OCR state
  const [isContinuousActive, setIsContinuousActive] = useState(false);
  const [continuousStats, setContinuousStats] = useState<ContinuousCaptureStatus | null>(null);
  const [lastOCRResult, setLastOCRResult] = useState<ContinuousCaptureResult | null>(null);
  const [continuousLoading, setContinuousLoading] = useState(false);
  const continuousIntervalRef = useRef<number | null>(null);

  // Check recording status on mount
  useEffect(() => {
    getRecordingStatus().then((result) => {
      setIsRecording(result.is_recording);
      setRecordingPath(result.path);
    }).catch(console.error);

    getContinuousCaptureStatus().then((status) => {
      setIsContinuousActive(status.is_active);
      setContinuousStats(status);
    }).catch(console.error);
  }, []);

  // Continuous capture loop
  useEffect(() => {
    if (isContinuousActive) {
      // Run capture every 2-3 seconds
      const runCapture = async () => {
        try {
          const result = await captureAndOCR();
          setLastOCRResult(result);
          // Update stats
          const status = await getContinuousCaptureStatus();
          setContinuousStats(status);
        } catch (err) {
          console.error('Continuous capture error:', err);
        }
      };

      // Initial capture
      runCapture();

      // Set interval
      continuousIntervalRef.current = window.setInterval(runCapture, 2500);

      return () => {
        if (continuousIntervalRef.current) {
          clearInterval(continuousIntervalRef.current);
          continuousIntervalRef.current = null;
        }
      };
    }
  }, [isContinuousActive]);

  const handleToggleRecording = async () => {
    setRecordingLoading(true);
    setRecordingError(null);
    
    try {
      if (isRecording) {
        const result = await stopScreenRecording();
        setIsRecording(false);
        setRecordingPath(result.path);
        if (!result.success && result.error) {
          setRecordingError(result.error);
        }
      } else {
        const result = await startScreenRecording();
        setIsRecording(result.is_recording);
        setRecordingPath(result.path);
        if (!result.success && result.error) {
          setRecordingError(result.error);
        }
      }
    } catch (err) {
      setRecordingError(String(err));
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleToggleContinuousCapture = async () => {
    setContinuousLoading(true);
    
    try {
      if (isContinuousActive) {
        const status = await stopContinuousCapture();
        setIsContinuousActive(false);
        setContinuousStats(status);
      } else {
        const status = await startContinuousCapture();
        setIsContinuousActive(true);
        setContinuousStats(status);
      }
    } catch (err) {
      console.error('Failed to toggle continuous capture:', err);
    } finally {
      setContinuousLoading(false);
    }
  };

  const paused = status !== 'active';
  const enabledCount = [
    settings.clipboardEnabled, 
    settings.screenshotsEnabled, 
    settings.appTrackingEnabled, 
    settings.browserEnabled
  ].filter(Boolean).length;

  const frequencyIndex = frequencies.findIndex(f => f.value === settings.frequencySeconds);

  return (
    <div className="h-full flex flex-col bg-[#09090b] relative">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-32 bg-gradient-to-b from-emerald-500/[0.05] to-transparent pointer-events-none" />
      
      {/* Header */}
      <header className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-white/[0.04] relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
              <Shield size={18} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight">Privacy Controls</h1>
              <p className="text-[12px] text-zinc-500">Control what ContextBridge captures</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={captureNow}
              disabled={isCapturing}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium bg-[#111113] border border-white/[0.04] text-zinc-400 hover:text-white hover:border-white/[0.08] transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={isCapturing ? 'animate-spin' : ''} />
              {isCapturing ? 'Capturing...' : 'Capture Now'}
            </button>

            <button
              onClick={toggleCapture}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all ${
                paused
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/15'
              }`}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
              {paused ? 'Start' : 'Pause'}
            </button>
          </div>
        </div>

        {/* Status indicator */}
        <div className={`flex items-center justify-between p-4 rounded-xl transition-all ${
          paused 
            ? 'bg-[#111113] border border-white/[0.04]' 
            : 'bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full transition-all ${
                paused ? 'bg-zinc-600' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
              }`} />
              {!paused && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-60" />}
            </div>
            <div>
              <span className={`text-[13px] font-medium ${paused ? 'text-zinc-500' : 'text-emerald-400'}`}>
                {paused ? 'Capture Paused' : 'Capture Active'}
              </span>
              <p className="text-[11px] text-zinc-500">
                {paused 
                  ? 'No data is being collected' 
                  : `${enabledCount} sources · every ${settings.frequencySeconds}s`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03]">
            <Activity size={12} className={paused ? 'text-zinc-600' : 'text-emerald-400'} />
            <span className="text-[11px] text-zinc-500">
              {events.length} events
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column - Settings */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          
          {/* ═══════════════════════════════════════════════════════════════════════
              CONTINUOUS CAPTURE + OCR - The Star Feature
              ═══════════════════════════════════════════════════════════════════════ */}
          <section className="animate-fade-in-up">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Continuous Screen OCR
            </h2>
            <div className={`p-5 rounded-2xl border transition-all relative overflow-hidden ${
              isContinuousActive 
                ? 'bg-gradient-to-r from-cyan-500/10 via-violet-500/5 to-transparent border-cyan-500/20' 
                : 'bg-[#111113] border-white/[0.04]'
            }`}>
              {/* Active glow */}
              {isContinuousActive && (
                <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/20 blur-3xl pointer-events-none animate-pulse-soft" />
              )}
              
              <div className="flex items-start justify-between mb-4 relative">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ring-1 transition-all ${
                    isContinuousActive 
                      ? 'bg-gradient-to-br from-cyan-500/20 to-violet-500/10 ring-cyan-500/30' 
                      : 'bg-white/[0.03] ring-white/[0.06]'
                  }`}>
                    {isContinuousActive ? (
                      <div className="relative">
                        <Scan size={20} className="text-cyan-400 animate-pulse-soft" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                      </div>
                    ) : (
                      <Eye size={20} className="text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
                      Rewind-Style OCR
                      {isContinuousActive && (
                        <span className="px-2 py-0.5 text-[9px] font-semibold bg-cyan-500/20 text-cyan-400 rounded-full uppercase tracking-wider flex items-center gap-1">
                          <Zap size={8} />
                          LIVE
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {isContinuousActive 
                        ? `Captured ${continuousStats?.capture_count ?? 0} unique screens`
                        : 'Capture text from your screen every 2-3 seconds'}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={handleToggleContinuousCapture}
                  disabled={continuousLoading}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all shadow-lg ${
                    isContinuousActive
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                      : 'bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white shadow-cyan-500/20'
                  } disabled:opacity-50`}
                >
                  {continuousLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : isContinuousActive ? (
                    <Square size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                  {continuousLoading ? 'Please wait...' : isContinuousActive ? 'Stop' : 'Start OCR'}
                </button>
              </div>
              
              {/* Last OCR result preview */}
              {isContinuousActive && lastOCRResult && (
                <div className="p-3 rounded-xl bg-[#0a0a0c] border border-white/[0.04] mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${lastOCRResult.changed ? 'bg-cyan-400' : 'bg-zinc-600'}`} />
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      {lastOCRResult.changed ? 'Screen changed' : 'No change detected'}
                    </p>
                    {lastOCRResult.saved_memory_id && (
                      <span className="ml-auto text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        ✓ Saved
                      </span>
                    )}
                  </div>
                  {lastOCRResult.ocr_text && (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 font-mono">
                      {lastOCRResult.ocr_text.slice(0, 200)}...
                    </p>
                  )}
                </div>
              )}
              
              <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-cyan-500/5 to-violet-500/5 border border-cyan-500/10">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  <span className="text-cyan-400 font-medium">How it works:</span> Takes a screenshot every 2-3 seconds, 
                  uses macOS Vision for OCR, then stores the text as searchable memories. 
                  Only saves when content changes significantly.
                </p>
              </div>
            </div>
          </section>

          {/* Continuous Screen Recording */}
          <section className="animate-fade-in-up stagger-1">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Video Recording
            </h2>
            <div className={`p-5 rounded-2xl border transition-all relative overflow-hidden ${
              isRecording 
                ? 'bg-gradient-to-r from-rose-500/10 to-transparent border-rose-500/20' 
                : 'bg-[#111113] border-white/[0.04]'
            }`}>
              {isRecording && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/20 blur-3xl pointer-events-none" />
              )}
              
              <div className="flex items-start justify-between mb-4 relative">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ring-1 transition-all ${
                    isRecording 
                      ? 'bg-rose-500/20 ring-rose-500/30' 
                      : 'bg-white/[0.03] ring-white/[0.06]'
                  }`}>
                    {isRecording ? (
                      <Circle size={20} className="text-rose-400 fill-rose-400 animate-recording-pulse" />
                    ) : (
                      <Video size={20} className="text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
                      Screen Recording
                      {isRecording && (
                        <span className="px-2 py-0.5 text-[9px] font-semibold bg-rose-500/20 text-rose-400 rounded-full uppercase tracking-wider">
                          REC
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {isRecording 
                        ? 'Recording your screen continuously'
                        : 'Capture video for full context'}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={handleToggleRecording}
                  disabled={recordingLoading}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all shadow-lg ${
                    isRecording
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                      : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20'
                  } disabled:opacity-50`}
                >
                  {recordingLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : isRecording ? (
                    <Square size={14} />
                  ) : (
                    <Video size={14} />
                  )}
                  {recordingLoading ? 'Please wait...' : isRecording ? 'Stop' : 'Record'}
                </button>
              </div>
              
              {recordingPath && !isRecording && (
                <div className="p-3 rounded-xl bg-[#0a0a0c] border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Last recording</p>
                  <p className="text-[11px] text-zinc-400 font-mono truncate mt-1">{recordingPath}</p>
                </div>
              )}
              
              {recordingError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mt-3">
                  <p className="text-[11px] text-rose-400">{recordingError}</p>
                </div>
              )}
            </div>
          </section>

          {/* Capture sources */}
          <section className="animate-fade-in-up stagger-2">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Background Capture Sources
            </h2>
            <div className="space-y-2">
              <ToggleCard
                icon={Clipboard}
                iconColor="text-violet-400"
                title="Clipboard Monitoring"
                description="Save clipboard changes automatically"
                enabled={settings.clipboardEnabled}
                disabled={paused}
                onToggle={() => updateSettings({ clipboardEnabled: !settings.clipboardEnabled })}
              />
              <ToggleCard
                icon={Camera}
                iconColor="text-rose-400"
                title="Screenshot Capture"
                description="Periodically capture screen content"
                enabled={settings.screenshotsEnabled}
                disabled={paused}
                onToggle={() => updateSettings({ screenshotsEnabled: !settings.screenshotsEnabled })}
              />
              <ToggleCard
                icon={Monitor}
                iconColor="text-cyan-400"
                title="Active App Tracking"
                description="Log which apps you're using"
                enabled={settings.appTrackingEnabled}
                disabled={paused}
                onToggle={() => updateSettings({ appTrackingEnabled: !settings.appTrackingEnabled })}
              />
              <ToggleCard
                icon={Globe}
                iconColor="text-amber-400"
                title="Browser History"
                description="Track visited pages (coming soon)"
                enabled={settings.browserEnabled}
                disabled={true}
                onToggle={() => updateSettings({ browserEnabled: !settings.browserEnabled })}
              />
            </div>
          </section>

          {/* Capture frequency */}
          <section className="animate-fade-in-up stagger-3">
            <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
              Capture Frequency
            </h2>
            <div className="p-4 rounded-2xl bg-[#111113] border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} className="text-zinc-500" />
                <span className="text-[12px] text-zinc-400">Background capture interval</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {frequencies.map((f, i) => (
                  <button
                    key={f.value}
                    onClick={() => updateSettings({ frequencySeconds: f.value })}
                    disabled={paused}
                    className={`py-3 px-2 rounded-xl text-center transition-all ${
                      frequencyIndex === i
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                        : 'bg-white/[0.03] text-zinc-500 hover:text-white hover:bg-white/[0.05]'
                    } ${paused ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <p className="text-[13px] font-semibold">{f.label}</p>
                    <p className="text-[9px] mt-0.5 opacity-70 uppercase tracking-wider">{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Privacy info */}
          <section className="animate-fade-in-up stagger-4">
            <div className="p-4 rounded-2xl bg-[#111113] border border-white/[0.04]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 ring-1 ring-blue-500/20">
                  <Info size={14} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-[12px] font-medium text-white mb-1">Your data stays local</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    All memories are stored locally on your device. Screenshots are deleted immediately after OCR processing.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Warning */}
          <section className="animate-fade-in-up stagger-5">
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 ring-1 ring-amber-500/20">
                  <AlertTriangle size={14} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-[12px] font-medium text-amber-400 mb-1">Sensitive content</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Be mindful of passwords. Consider pausing capture when using banking apps or entering credentials.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right column - Activity Feed */}
        <div className="w-[280px] border-l border-white/[0.04] overflow-y-auto bg-[#0a0a0c]/80 backdrop-blur-xl flex-shrink-0">
          <div className="p-4">
            <ActivityFeed maxItems={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
