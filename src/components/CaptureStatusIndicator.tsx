/**
 * CaptureStatusIndicator - Simple ON/OFF status display
 * Simplified for new capture context
 */
import { Power, Brain } from 'lucide-react';
import { useCaptureContext } from '../lib/captureContext';

export default function CaptureStatusIndicator() {
  const { isActive, isCapturing, captureCount, toggleCapture } = useCaptureContext();

  return (
    <div 
      className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${
        isActive
          ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30'
          : 'bg-gradient-to-br from-[#27272a]/50 via-[#18181b] to-transparent border-[#3f3f46]'
      }`}
    >
      {/* Animated background pulse when active */}
      {isActive && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -inset-1 bg-emerald-500/5 animate-pulse" />
        </div>
      )}

      <div className="relative flex items-center justify-between p-4 sm:p-5">
        {/* Left: Status info */}
        <div className="flex items-center gap-4">
          {/* Status indicator dot */}
          <div className="relative flex items-center justify-center">
            <div 
              className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                isActive ? 'bg-emerald-400' : 'bg-[#52525b]'
              }`} 
            />
            {isActive && (
              <div className="absolute w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            )}
            {isCapturing && (
              <div className="absolute -inset-1">
                <div className="w-5 h-5 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
              </div>
            )}
          </div>

          {/* Status text */}
          <div>
            <div className="flex items-center gap-2">
              <h2 
                className={`text-lg font-semibold tracking-tight transition-colors ${
                  isActive ? 'text-emerald-400' : 'text-[#71717a]'
                }`}
              >
                {isActive ? 'Smart Capture Active' : 'Capture Paused'}
              </h2>
            </div>
            <p className="text-[12px] text-[#52525b] mt-0.5">
              {isActive ? (
                <>
                  <span className="text-[#71717a]">{captureCount} captures</span>
                  {' · '}
                  <span>every 1.5s</span>
                </>
              ) : (
                'Click to start smart capture'
              )}
            </p>
          </div>
        </div>

        {/* Right: Toggle button */}
        <button
          onClick={toggleCapture}
          className={`relative flex items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 ${
            isActive
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
              : 'bg-[#27272a] hover:bg-[#3f3f46] text-[#71717a] hover:text-white border border-[#3f3f46]'
          }`}
          title={isActive ? 'Pause capture' : 'Start capture'}
        >
          <Power size={24} className={isActive ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : ''} />
        </button>
      </div>

      {/* Bottom: Info bar */}
      <div 
        className={`flex items-center justify-between px-5 py-2.5 border-t transition-colors ${
          isActive 
            ? 'border-emerald-500/20 bg-emerald-500/5' 
            : 'border-[#27272a] bg-[#0f0f12]'
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-[#52525b]">
          <Brain size={12} className={isActive ? 'text-violet-400' : ''} />
          <span>Smart summaries of your activity</span>
        </div>
      </div>
    </div>
  );
}
