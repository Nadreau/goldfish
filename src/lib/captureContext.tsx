/**
 * Capture Context - Global state for capture status and activity
 * FIXED: Stabilized capture loop, fixed memory leaks, improved error handling
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getClipboard, getActiveWindow, saveMemory, captureScreenshot } from './api';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type CaptureStatus = 'active' | 'paused' | 'error';

export interface CaptureSettings {
  screenshotsEnabled: boolean;
  clipboardEnabled: boolean;
  appTrackingEnabled: boolean;
  browserEnabled: boolean;
  frequencySeconds: number;
}

export interface CaptureEvent {
  id: string;
  type: 'clipboard' | 'screenshot' | 'app-switch' | 'error';
  preview: string;
  app?: string;
  timestamp: Date;
  saved: boolean;
}

interface CaptureContextValue {
  status: CaptureStatus;
  settings: CaptureSettings;
  events: CaptureEvent[];
  isCapturing: boolean;
  lastCapture: Date | null;
  
  // Actions
  toggleCapture: () => void;
  setStatus: (status: CaptureStatus) => void;
  updateSettings: (partial: Partial<CaptureSettings>) => void;
  captureNow: () => Promise<void>;
  clearEvents: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default values
// ═══════════════════════════════════════════════════════════════════════════════

const defaultSettings: CaptureSettings = {
  screenshotsEnabled: false,
  clipboardEnabled: true,
  appTrackingEnabled: true,
  browserEnabled: false,
  frequencySeconds: 30,
};

const STORAGE_KEY = 'contextbridge_capture_settings';
const EVENTS_KEY = 'contextbridge_capture_events';
const MAX_EVENTS = 50;

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
  // State
  const [status, setStatus] = useState<CaptureStatus>('paused');
  const [settings, setSettings] = useState<CaptureSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  const [events, setEvents] = useState<CaptureEvent[]>(() => {
    try {
      const saved = localStorage.getItem(EVENTS_KEY);
      if (saved) {
        return JSON.parse(saved).map((e: CaptureEvent) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState<Date | null>(null);
  
  // Refs for capture loop - use refs to avoid dependency issues
  const intervalRef = useRef<number | null>(null);
  const lastClipboardRef = useRef<string>('');
  const lastAppRef = useRef<string>('');
  const statusRef = useRef<CaptureStatus>(status);
  const settingsRef = useRef<CaptureSettings>(settings);
  const isCapturingRef = useRef<boolean>(false);

  // Keep refs in sync
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, [settings]);

  // Persist events (limit to MAX_EVENTS)
  useEffect(() => {
    try {
      const limited = events.slice(0, MAX_EVENTS);
      localStorage.setItem(EVENTS_KEY, JSON.stringify(limited));
    } catch (err) {
      console.error('Failed to save events:', err);
    }
  }, [events]);

  // Add event helper
  const addEvent = useCallback((event: Omit<CaptureEvent, 'id' | 'timestamp'>) => {
    const newEvent: CaptureEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };
    setEvents(prev => [newEvent, ...prev].slice(0, MAX_EVENTS));
    setLastCapture(new Date());
    return newEvent;
  }, []);

  // Main capture function - stable reference using refs
  const doCapture = useCallback(async () => {
    // Prevent concurrent captures
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setIsCapturing(true);

    const currentSettings = settingsRef.current;

    try {
      // Clipboard capture
      if (currentSettings.clipboardEnabled) {
        try {
          const clipboard = await getClipboard();
          if (clipboard.content.trim() && clipboard.content !== lastClipboardRef.current) {
            lastClipboardRef.current = clipboard.content;
            
            // Auto-tag
            const tags: string[] = [];
            if (clipboard.content.match(/^https?:\/\//)) tags.push('url');
            if (clipboard.content.match(/```|function|const |let |import |def |class /)) tags.push('code');
            if (clipboard.content.length > 500) tags.push('long');
            
            let appName = 'Unknown';
            try {
              const activeWindow = await getActiveWindow();
              appName = activeWindow.app_name;
            } catch { /* ignore */ }
            
            await saveMemory(
              clipboard.content,
              tags,
              'clipboard',
              appName !== 'Unknown' ? appName : undefined
            );

            addEvent({
              type: 'clipboard',
              preview: clipboard.content.slice(0, 100) + (clipboard.content.length > 100 ? '...' : ''),
              app: appName,
              saved: true,
            });
          }
        } catch (err) {
          console.error('Clipboard capture failed:', err);
          addEvent({
            type: 'error',
            preview: `Clipboard: ${String(err)}`,
            saved: false,
          });
        }
      }

      // App tracking
      if (currentSettings.appTrackingEnabled) {
        try {
          const activeWindow = await getActiveWindow();
          if (activeWindow.app_name !== lastAppRef.current && activeWindow.app_name !== 'Unknown') {
            lastAppRef.current = activeWindow.app_name;
            
            // Save app switch as a memory
            const content = `Switched to ${activeWindow.app_name}${activeWindow.window_title ? `: ${activeWindow.window_title}` : ''}`;
            await saveMemory(content, ['activity'], 'app-tracking', activeWindow.app_name);

            addEvent({
              type: 'app-switch',
              preview: content,
              app: activeWindow.app_name,
              saved: true,
            });
          }
        } catch (err) {
          console.error('App tracking failed:', err);
        }
      }

      // Screenshot capture
      if (currentSettings.screenshotsEnabled) {
        try {
          const result = await captureScreenshot();
          if (result.success && result.path) {
            addEvent({
              type: 'screenshot',
              preview: `Screenshot saved: ${result.path.split('/').pop()}`,
              saved: true,
            });
          } else if (result.error) {
            addEvent({
              type: 'error',
              preview: `Screenshot: ${result.error}`,
              saved: false,
            });
          }
        } catch (err) {
          console.error('Screenshot failed:', err);
        }
      }

    } catch (err) {
      console.error('Capture error:', err);
      setStatus('error');
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
    }
  }, [addEvent]);

  // Start/stop capture loop - only depends on status
  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status === 'active') {
      // Do an immediate capture
      doCapture();
      
      // Set up interval using current settings
      intervalRef.current = window.setInterval(() => {
        if (statusRef.current === 'active') {
          doCapture();
        }
      }, settingsRef.current.frequencySeconds * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, doCapture]);

  // Update interval when frequency changes (but only if active)
  useEffect(() => {
    if (status === 'active' && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(() => {
        if (statusRef.current === 'active') {
          doCapture();
        }
      }, settings.frequencySeconds * 1000);
    }
  }, [settings.frequencySeconds, status, doCapture]);

  // Listen for tray capture event
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    listen('trigger-capture', async () => {
      await doCapture();
    }).then(fn => {
      unlisten = fn;
    }).catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [doCapture]);

  // Actions
  const toggleCapture = useCallback(() => {
    setStatus(prev => prev === 'active' ? 'paused' : 'active');
  }, []);

  const updateSettings = useCallback((partial: Partial<CaptureSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const captureNow = useCallback(async () => {
    await doCapture();
  }, [doCapture]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return (
    <CaptureContext.Provider value={{
      status,
      settings,
      events,
      isCapturing,
      lastCapture,
      toggleCapture,
      setStatus,
      updateSettings,
      captureNow,
      clearEvents,
    }}>
      {children}
    </CaptureContext.Provider>
  );
}
