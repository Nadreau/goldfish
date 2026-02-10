/**
 * ContextBridge API — Tauri command wrappers
 */
import { invoke } from '@tauri-apps/api/core';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Memory {
  id: string;
  content: string;
  tags: string[];
  source: 'screenshot' | 'clipboard' | 'app-tracking' | 'browser' | 'manual' | 'ocr' | string;
  source_app: string | null;
  timestamp: string;
}

export interface MemoryStats {
  total_memories: number;
  memories_today: number;
  storage_bytes: number;
  sources: Record<string, number>;
}

export interface ActiveWindow {
  app_name: string;
  window_title: string;
  timestamp: string;
}

export interface ClipboardContent {
  content: string;
  timestamp: string;
}

export interface CaptureResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

export interface RecordingResult {
  success: boolean;
  is_recording: boolean;
  path: string | null;
  error: string | null;
}

export interface OCRResult {
  success: boolean;
  text: string | null;
  confidence: number | null;
  error: string | null;
}

export interface ContinuousCaptureResult {
  success: boolean;
  changed: boolean;
  ocr_text: string | null;
  saved_memory_id: string | null;
  error: string | null;
}

export interface ContinuousCaptureStatus {
  is_active: boolean;
  capture_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory API
// ═══════════════════════════════════════════════════════════════════════════════

export async function getAllMemories(limit?: number): Promise<Memory[]> {
  return invoke<Memory[]>('get_all_memories', { limit });
}

export async function searchMemories(query: string, limit?: number): Promise<Memory[]> {
  return invoke<Memory[]>('search_memories', { query, limit });
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return invoke<MemoryStats>('get_memory_stats');
}

export async function saveMemory(
  content: string,
  tags: string[],
  source: string,
  sourceApp?: string
): Promise<Memory> {
  return invoke<Memory>('save_memory', {
    content,
    tags,
    source,
    source_app: sourceApp ?? null,
  });
}

export async function deleteMemory(id: string): Promise<boolean> {
  return invoke<boolean>('delete_memory', { id });
}

export async function deleteAllMemories(): Promise<number> {
  return invoke<number>('delete_all_memories');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture API
// ═══════════════════════════════════════════════════════════════════════════════

export async function captureScreenshot(): Promise<CaptureResult> {
  return invoke<CaptureResult>('capture_screenshot');
}

export async function getActiveWindow(): Promise<ActiveWindow> {
  return invoke<ActiveWindow>('get_active_window');
}

export async function getClipboard(): Promise<ClipboardContent> {
  return invoke<ClipboardContent>('get_clipboard');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OCR & Continuous Capture API
// ═══════════════════════════════════════════════════════════════════════════════

export async function performOCR(imagePath: string): Promise<OCRResult> {
  return invoke<OCRResult>('perform_ocr_on_image', { imagePath });
}

export async function captureAndOCR(): Promise<ContinuousCaptureResult> {
  return invoke<ContinuousCaptureResult>('capture_and_ocr');
}

export async function startContinuousCapture(): Promise<ContinuousCaptureStatus> {
  return invoke<ContinuousCaptureStatus>('start_continuous_capture');
}

export async function stopContinuousCapture(): Promise<ContinuousCaptureStatus> {
  return invoke<ContinuousCaptureStatus>('stop_continuous_capture');
}

export async function getContinuousCaptureStatus(): Promise<ContinuousCaptureStatus> {
  return invoke<ContinuousCaptureStatus>('get_continuous_capture_status');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording API
// ═══════════════════════════════════════════════════════════════════════════════

export async function startScreenRecording(): Promise<RecordingResult> {
  return invoke<RecordingResult>('start_screen_recording');
}

export async function stopScreenRecording(): Promise<RecordingResult> {
  return invoke<RecordingResult>('stop_screen_recording');
}

export async function getRecordingStatus(): Promise<RecordingResult> {
  return invoke<RecordingResult>('get_recording_status');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function getSourceIcon(source: string): string {
  switch (source) {
    case 'screenshot': return '📸';
    case 'clipboard': return '📋';
    case 'app-tracking': return '🖥️';
    case 'browser': return '🌐';
    case 'manual': return '✍️';
    case 'ocr': return '👁️';
    default: return '💾';
  }
}
