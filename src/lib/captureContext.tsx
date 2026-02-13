/**
 * Capture Context — Simplified global state for capture
 * ONE toggle to rule them all
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { 
  smartCapture, 
  startCapture, 
  stopCapture, 
  getCaptureStatus,
  type CaptureResult 
} from './api';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActivityEvent {
  id: string;
  summary: string;
  app?: string;
  timestamp: Date;
  saved: boolean;
}

interface CaptureContextValue {
  isActive: boolean;
  captureCount: number;
  events: ActivityEvent[];
  isCapturing: boolean;
  
  // Actions
  toggleCapture: () => Promise<void>;
  clearEvents: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_EVENTS = 50;
const CAPTURE_INTERVAL_MS = 1500; // Every 1.5 seconds

// ═══════════════════════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════════════════════

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function useCaptureContext() {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error('useCaptureContext must be used within CaptureProvider');
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════════════════

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const intervalRef = useRef<number | null>(null);
  const isCapturingRef = useRef(false);

  // Add event helper
  const addEvent = useCallback((result: CaptureResult) => {
    if (!result.changed || !result.summary) return;
    
    const newEvent: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      summary: result.summary,
      timestamp: new Date(),
      saved: !!result.saved_id,
    };
    
    setEvents(prev => [newEvent, ...prev].slice(0, MAX_EVENTS));
  }, []);

  // Main capture function
  const doCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setIsCapturing(true);

    try {
      const result = await smartCapture();
      if (result.changed) {
        setCaptureCount(prev => prev + 1);
        addEvent(result);
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
    }
  }, [addEvent]);

  // Start/stop capture loop
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isActive) {
      // Immediate capture
      doCapture();
      
      // Set up interval
      intervalRef.current = window.setInterval(doCapture, CAPTURE_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, doCapture]);

  // Check initial status on mount
  useEffect(() => {
    getCaptureStatus().then(status => {
      setIsActive(status.is_active);
      setCaptureCount(status.capture_count);
    }).catch(console.error);
  }, []);

  // Toggle capture
  const toggleCapture = useCallback(async () => {
    try {
      if (isActive) {
        const status = await stopCapture();
        setIsActive(false);
        setCaptureCount(status.capture_count);
      } else {
        await startCapture();
        setIsActive(true);
        setCaptureCount(0);
        setEvents([]);
      }
    } catch (err) {
      console.error('Toggle error:', err);
    }
  }, [isActive]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return (
    <CaptureContext.Provider value={{
      isActive,
      captureCount,
      events,
      isCapturing,
      toggleCapture,
      clearEvents,
    }}>
      {children}
    </CaptureContext.Provider>
  );
}
