/**
 * ActivityFeed - Premium real-time activity log
 */
import { Clipboard, Camera, MonitorSmartphone, AlertCircle, Trash2, Clock, Zap } from 'lucide-react';
import { useCaptureContext, type CaptureEvent } from '../lib/captureContext';

function getEventIcon(type: CaptureEvent['type']) {
  switch (type) {
    case 'clipboard':
      return <Clipboard size={12} className="text-violet-400" />;
    case 'screenshot':
      return <Camera size={12} className="text-rose-400" />;
    case 'app-switch':
      return <MonitorSmartphone size={12} className="text-cyan-400" />;
    case 'error':
      return <AlertCircle size={12} className="text-amber-400" />;
  }
}

function getEventColor(type: CaptureEvent['type']) {
  switch (type) {
    case 'clipboard': return 'from-violet-500/20 to-violet-500/5';
    case 'screenshot': return 'from-rose-500/20 to-rose-500/5';
    case 'app-switch': return 'from-cyan-500/20 to-cyan-500/5';
    case 'error': return 'from-amber-500/20 to-amber-500/5';
  }
}

function getEventLabel(type: CaptureEvent['type']) {
  switch (type) {
    case 'clipboard': return 'Clipboard';
    case 'screenshot': return 'Screenshot';
    case 'app-switch': return 'App';
    case 'error': return 'Error';
  }
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

interface ActivityItemProps {
  event: CaptureEvent;
  index: number;
}

function ActivityItem({ event, index }: ActivityItemProps) {
  return (
    <div 
      className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] transition-all duration-200 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {/* Icon */}
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getEventColor(event.type)} flex items-center justify-center flex-shrink-0 ring-1 ring-white/5`}>
        {getEventIcon(event.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-medium text-zinc-300">
            {getEventLabel(event.type)}
          </span>
          {event.app && (
            <>
              <span className="w-1 h-1 rounded-full bg-zinc-700" />
              <span className="text-[10px] text-zinc-500">{event.app}</span>
            </>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 truncate group-hover:text-zinc-400 transition-colors">
          {event.preview}
        </p>
      </div>

      {/* Status & time */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatTime(event.timestamp)}
        </span>
        <div className={`w-1.5 h-1.5 rounded-full ${event.saved ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
      </div>
    </div>
  );
}

interface ActivityFeedProps {
  maxItems?: number;
  compact?: boolean;
}

export default function ActivityFeed({ maxItems = 10, compact = false }: ActivityFeedProps) {
  const { events, status, clearEvents, captureNow, isCapturing } = useCaptureContext();
  const displayEvents = events.slice(0, maxItems);

  if (compact && events.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-[#111113] border border-white/[0.04] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Zap size={12} className={`${status === 'active' ? 'text-emerald-400 animate-pulse-soft' : 'text-zinc-600'}`} />
          <h3 className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">Activity</h3>
          {events.length > 0 && (
            <span className="text-[9px] text-zinc-600 bg-white/[0.03] px-1.5 py-0.5 rounded-full">
              {events.length}
            </span>
          )}
        </div>
        {events.length > 0 && (
          <button
            onClick={clearEvents}
            className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03] transition-all"
            title="Clear"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Events list */}
      <div className={`overflow-y-auto ${compact ? 'max-h-[200px]' : 'max-h-[300px]'}`}>
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4 animate-fade-in">
            <div className="relative mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
                {isCapturing ? (
                  <div className="w-5 h-5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
                ) : (
                  <Clock size={18} className="text-zinc-600" />
                )}
              </div>
            </div>
            <p className="text-[12px] text-zinc-500 mb-1">No activity yet</p>
            <p className="text-[10px] text-zinc-600 mb-3">
              {status === 'active' 
                ? 'Waiting for changes...'
                : 'Start capture to see activity'
              }
            </p>
            {status !== 'active' && (
              <button
                onClick={captureNow}
                disabled={isCapturing}
                className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
              >
                {isCapturing ? 'Capturing...' : 'Capture now →'}
              </button>
            )}
          </div>
        ) : (
          <div className="py-1">
            {displayEvents.map((event, i) => (
              <ActivityItem key={event.id} event={event} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {events.length > maxItems && (
        <div className="px-4 py-2 border-t border-white/[0.04] bg-[#0a0a0c]">
          <p className="text-[9px] text-zinc-600 text-center">
            +{events.length - maxItems} more
          </p>
        </div>
      )}
    </div>
  );
}
