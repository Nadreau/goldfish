/**
 * ActivityFeed - Simplified real-time activity log
 * Uses the new ActivityEvent type
 */
import { Trash2, Clock, Brain } from 'lucide-react';
import { useCaptureContext, type ActivityEvent } from '../lib/captureContext';

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

interface ActivityItemProps {
  event: ActivityEvent;
  index: number;
}

function ActivityItem({ event, index }: ActivityItemProps) {
  return (
    <div 
      className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] transition-all duration-200 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {/* Icon */}
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center flex-shrink-0 ring-1 ring-white/5">
        <Brain size={12} className="text-violet-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-zinc-300 truncate group-hover:text-white transition-colors">
          {event.summary}
        </p>
        <p className="text-[10px] text-zinc-600 mt-0.5">
          {formatTime(event.timestamp)}
        </p>
      </div>

      {/* Status */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${event.saved ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
    </div>
  );
}

interface ActivityFeedProps {
  maxItems?: number;
}

export default function ActivityFeed({ maxItems = 10 }: ActivityFeedProps) {
  const { events, isActive, clearEvents, isCapturing } = useCaptureContext();
  const displayEvents = events.slice(0, maxItems);

  return (
    <div className="rounded-xl bg-[#111113] border border-white/[0.04] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all ${
            isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
          }`} />
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
      <div className="overflow-y-auto max-h-[300px]">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4 animate-fade-in">
            <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-4">
              {isCapturing ? (
                <div className="w-5 h-5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
              ) : (
                <Clock size={18} className="text-zinc-600" />
              )}
            </div>
            <p className="text-[12px] text-zinc-500 mb-1">No activity yet</p>
            <p className="text-[10px] text-zinc-600">
              {isActive 
                ? 'Waiting for changes...'
                : 'Start capture to see activity'
              }
            </p>
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
