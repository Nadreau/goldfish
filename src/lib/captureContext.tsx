/**
 * Capture Context — Simplified global state for capture
 * ONE toggle to rule them all
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { 
  smartCapture,
  rapidCaptureWithOcr,
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

const MAX_EVENTS = 100;
// Read capture interval from localStorage, default to 1 second
const getStoredInterval = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('capture_interval');
    return stored ? parseInt(stored) : 5000;
  }
  return 5000;
};
const CAPTURE_INTERVAL_MS = getStoredInterval();

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

  // Main capture function - uses OCR for real screen understanding
  const doCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setIsCapturing(true);

    try {
      // Use rapid OCR capture for full screen understanding
      const result = await rapidCaptureWithOcr();
      if (result.changed) {
        setCaptureCount(prev => prev + 1);
        addEvent(result);
      }
    } catch (err) {
      console.error('Capture error:', err);
      // Fallback to smart capture if OCR fails
      try {
        const fallbackResult = await smartCapture();
        if (fallbackResult.changed) {
          setCaptureCount(prev => prev + 1);
          addEvent(fallbackResult);
        }
      } catch (fallbackErr) {
        console.error('Fallback capture also failed:', fallbackErr);
      }
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

  // Check initial status on mount + auto-start if enabled
  useEffect(() => {
    getCaptureStatus().then(status => {
      setIsActive(status.is_active);
      setCaptureCount(status.capture_count);
      
      // Auto-start capture if enabled and not already active
      if (!status.is_active && localStorage.getItem('auto_start_capture') === 'true') {
        console.log('[ContextBridge] Auto-starting capture...');
        startCapture().then(() => {
          setIsActive(true);
          setCaptureCount(0);
        }).catch(console.error);
      }
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
