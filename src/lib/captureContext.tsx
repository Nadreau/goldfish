/**
 * Capture Context — Global state for screen capture
 * Capture is always-on (auto-started by Rust backend).
 * Frontend just polls status and manages scene processing.
 * Pause/Resume only available via tray menu.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getCaptureStatus } from './api';
import { startSceneProcessor, stopSceneProcessor } from './sceneProcessor';
import { startMemoryCompactor, stopMemoryCompactor } from './memoryCompactor';

interface CaptureContextValue {
  isActive: boolean;
  captureCount: number;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function useCaptureContext() {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error('useCaptureContext must be used within CaptureProvider');
  return ctx;
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(true); // Assume active (auto-start)
  const [captureCount, setCaptureCount] = useState(0);

  // Check initial status on mount
  useEffect(() => {
    getCaptureStatus().then(status => {
      setIsActive(status.is_active);
      setCaptureCount(status.capture_count);
    }).catch(console.error);
  }, []);

  // Listen for tray Pause/Resume events from Rust backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ is_active: boolean }>('capture-state-changed', (event) => {
          setIsActive(event.payload.is_active);
        });
      } catch {
        // Not in Tauri (browser mode) — ignore
      }
    })();
    return () => { unlisten?.(); };
  }, []);

  // Start/stop scene processor and memory compactor with capture
  useEffect(() => {
    if (isActive) {
      startSceneProcessor();
      startMemoryCompactor();
    } else {
      stopSceneProcessor();
      stopMemoryCompactor();
    }
    return () => { stopSceneProcessor(); stopMemoryCompactor(); };
  }, [isActive]);

  // Poll capture status when active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      getCaptureStatus().then(status => {
        setCaptureCount(status.capture_count);
        if (!status.is_active) setIsActive(false);
      }).catch(console.error);
    }, 2000);
    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <CaptureContext.Provider value={{ isActive, captureCount }}>
      {children}
    </CaptureContext.Provider>
  );
}
