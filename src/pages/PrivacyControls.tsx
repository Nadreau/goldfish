/**
 * PrivacyControls — Settings page (no duplicate toggle)
 * The main toggle is on Dashboard
 */
import { Shield, Info, AlertTriangle, Trash2, Database, HardDrive, Video, Square, Circle, FolderOpen } from 'lucide-react';
import { useCaptureContext } from '../lib/captureContext';
import { deleteAllMemories, getMemoryStats, formatBytes, startRecording, stopRecording, getRecordingStatus, listRecordings, formatDuration, RecordingStatus } from '../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-shell';

export default function PrivacyControls() {
  const { isActive, captureCount } = useCaptureContext();
  const [stats, setStats] = useState<{ total: number; storage: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Recording state
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [recordingLoading, setRecordingLoading] = useState(false);

  useEffect(() => {
    getMemoryStats().then(s => {
      setStats({ total: s.total_memories, storage: s.storage_bytes });
    }).catch(console.error);
    
    // Get initial recording status
    getRecordingStatus().then(setRecordingStatus).catch(console.error);
    listRecordings().then(setRecordings).catch(console.error);
  }, []);
  
  // Poll recording status while recording
  useEffect(() => {
    if (!recordingStatus?.is_recording) return;
    
    const interval = setInterval(() => {
      getRecordingStatus().then(setRecordingStatus).catch(console.error);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [recordingStatus?.is_recording]);
  
  const handleStartRecording = useCallback(async () => {
    setRecordingLoading(true);
    try {
      const result = await startRecording();
      if (result.success) {
        const status = await getRecordingStatus();
        setRecordingStatus(status);
      } else {
        console.error('Failed to start recording:', result.error);
      }
    } catch (err) {
      console.error('Recording error:', err);
    } finally {
      setRecordingLoading(false);
    }
  }, []);
  
  const handleStopRecording = useCallback(async () => {
    setRecordingLoading(true);
    try {
      const result = await stopRecording();
      if (result.success) {
        setRecordingStatus({ is_recording: false, recording_path: null, recording_start: null, duration_seconds: null });
        // Refresh recordings list
        const newRecordings = await listRecordings();
        setRecordings(newRecordings);
      } else {
        console.error('Failed to stop recording:', result.error);
      }
    } catch (err) {
      console.error('Stop recording error:', err);
    } finally {
      setRecordingLoading(false);
    }
  }, []);
  
  const openRecordingsFolder = useCallback(async () => {
    try {
      const homeDir = await import('@tauri-apps/api/path').then(m => m.homeDir());
      await open(`${homeDir}.contextbridge/recordings`);
    } catch (err) {
      console.error('Failed to open recordings folder:', err);
    }
  }, []);

  const handleDeleteAll = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    
    setDeleting(true);
    try {
      await deleteAllMemories();
      setStats({ total: 0, storage: 0 });
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] relative overflow-y-auto">
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
              <h1 className="text-lg font-semibold text-white tracking-tight">Privacy & Data</h1>
              <p className="text-[12px] text-zinc-500">Manage your memory data</p>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className={`flex items-center justify-between p-4 rounded-xl transition-all ${
          isActive 
            ? 'bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20' 
            : 'bg-[#111113] border border-white/[0.04]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full transition-all ${
                isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-zinc-600'
              }`} />
              {isActive && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-60" />}
            </div>
            <div>
              <span className={`text-[13px] font-medium ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {isActive ? 'Capture Active' : 'Capture Paused'}
              </span>
              <p className="text-[11px] text-zinc-500">
                {isActive 
                  ? `${captureCount} captures this session`
                  : 'Go to Dashboard to start capture'
                }
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-6 py-6 space-y-6">
        
        {/* Storage Stats */}
        <section className="animate-fade-in-up">
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
            Storage
          </h2>
          <div className="p-5 rounded-2xl bg-[#111113] border border-white/[0.04]">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                  <Database size={18} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{stats?.total ?? 0}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Memories</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center ring-1 ring-cyan-500/20">
                  <HardDrive size={18} className="text-cyan-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{formatBytes(stats?.storage ?? 0)}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Storage</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Screen Recording */}
        <section className="animate-fade-in-up stagger-1">
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
            Screen Recording
          </h2>
          <div className={`p-5 rounded-2xl border transition-all ${
            recordingStatus?.is_recording 
              ? 'bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/30' 
              : 'bg-[#111113] border-white/[0.04]'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 transition-all ${
                  recordingStatus?.is_recording 
                    ? 'bg-rose-500/20 ring-rose-500/40' 
                    : 'bg-violet-500/10 ring-violet-500/20'
                }`}>
                  {recordingStatus?.is_recording ? (
                    <div className="relative">
                      <Circle size={18} className="text-rose-400 fill-rose-400 animate-recording-pulse" />
                    </div>
                  ) : (
                    <Video size={18} className="text-violet-400" />
                  )}
                </div>
                <div>
                  <p className={`text-[14px] font-medium ${
                    recordingStatus?.is_recording ? 'text-rose-400' : 'text-white'
                  }`}>
                    {recordingStatus?.is_recording ? 'Recording...' : 'Screen Recording'}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {recordingStatus?.is_recording && recordingStatus.duration_seconds !== null
                      ? formatDuration(recordingStatus.duration_seconds)
                      : 'Record your screen for AI to analyze later'}
                  </p>
                </div>
              </div>
              
              <button
                onClick={recordingStatus?.is_recording ? handleStopRecording : handleStartRecording}
                disabled={recordingLoading}
                className={`px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all flex items-center gap-2 ${
                  recordingStatus?.is_recording
                    ? 'bg-rose-500 text-white hover:bg-rose-400'
                    : 'bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {recordingLoading ? (
                  <span className="animate-spin">⏳</span>
                ) : recordingStatus?.is_recording ? (
                  <>
                    <Square size={14} className="fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <Circle size={14} className="fill-current" />
                    Start Recording
                  </>
                )}
              </button>
            </div>
            
            {/* Recent recordings */}
            {recordings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Recent Recordings</p>
                  <button
                    onClick={openRecordingsFolder}
                    className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <FolderOpen size={12} />
                    Open Folder
                  </button>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {recordings.slice(0, 5).map((path, i) => {
                    const filename = path.split('/').pop() || path;
                    return (
                      <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-400">
                        <Video size={12} className="text-zinc-500" />
                        <span className="truncate">{filename}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Delete All Data */}
        <section className="animate-fade-in-up stagger-2">
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
            Danger Zone
          </h2>
          <div className="p-5 rounded-2xl bg-[#111113] border border-rose-500/20">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center ring-1 ring-rose-500/20">
                  <Trash2 size={18} className="text-rose-400" />
                </div>
                <div>
                  <h3 className="text-[14px] font-medium text-white">Delete All Memories</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Permanently remove all stored memories. This cannot be undone.
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleDeleteAll}
                disabled={deleting || (stats?.total ?? 0) === 0}
                className={`px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all ${
                  showDeleteConfirm
                    ? 'bg-rose-500 text-white hover:bg-rose-400'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {deleting ? 'Deleting...' : showDeleteConfirm ? 'Confirm Delete' : 'Delete All'}
              </button>
            </div>
            
            {showDeleteConfirm && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-[11px] text-rose-400">
                  ⚠️ This will delete {stats?.total ?? 0} memories permanently. Click again to confirm.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Privacy info */}
        <section className="animate-fade-in-up stagger-3">
          <div className="p-4 rounded-2xl bg-[#111113] border border-white/[0.04]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 ring-1 ring-blue-500/20">
                <Info size={14} className="text-blue-400" />
              </div>
              <div>
                <h3 className="text-[12px] font-medium text-white mb-1">Your data stays local</h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  All memories and recordings are stored locally on your device at <code className="text-violet-400">~/.contextbridge/</code>. 
                  Nothing is sent to the cloud. You own your data.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Warning */}
        <section className="animate-fade-in-up stagger-4">
          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 ring-1 ring-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-[12px] font-medium text-amber-400 mb-1">Sensitive content</h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Be mindful of passwords and sensitive information. Consider pausing capture when using banking apps or entering credentials.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="animate-fade-in-up stagger-5">
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
            How Smart Capture Works
          </h2>
          <div className="p-5 rounded-2xl bg-[#111113] border border-white/[0.04] space-y-4">
            {[
              { num: '1', title: 'Context Detection', desc: 'Reads your active window and app every 1.5 seconds' },
              { num: '2', title: 'Smart Summarization', desc: 'Creates meaningful descriptions like "Reading email" or "Coding in VS Code"' },
              { num: '3', title: 'Deduplication', desc: 'Only saves when your activity actually changes, keeping the DB clean' },
              { num: '4', title: 'MCP Integration', desc: 'AI assistants can query "What was I working on?" and get intelligent answers' },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-violet-400">
                  {step.num}
                </div>
                <div>
                  <p className="text-[12px] font-medium text-zinc-200">{step.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
