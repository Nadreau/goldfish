/**
 * ContextBridge API — Tauri command wrappers
 * Simplified and robust
 */
import { invoke } from '@tauri-apps/api/core';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Memory {
  id: string;
  content: string;
  tags: string[];
  source: string;
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
  changed: boolean;
  summary: string;
  saved_id: string | null;
  error: string | null;
}

export interface CaptureStatus {
  is_active: boolean;
  capture_count: number;
}

export interface RecordingStatus {
  is_recording: boolean;
  recording_path: string | null;
  recording_start: string | null;
  duration_seconds: number | null;
}

export interface RecordingResult {
  success: boolean;
  path: string | null;
  error: string | null;
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

export async function getActiveWindow(): Promise<ActiveWindow> {
  return invoke<ActiveWindow>('get_active_window');
}

export async function getClipboard(): Promise<ClipboardContent> {
  return invoke<ClipboardContent>('get_clipboard');
}

export async function captureScreenshot(): Promise<CaptureResult> {
  return invoke<CaptureResult>('capture_screenshot');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Smart Capture API — The Main Feature
// ═══════════════════════════════════════════════════════════════════════════════

export async function smartCapture(): Promise<CaptureResult> {
  return invoke<CaptureResult>('smart_capture');
}

export async function startCapture(): Promise<CaptureStatus> {
  return invoke<CaptureStatus>('start_capture');
}

export async function stopCapture(): Promise<CaptureStatus> {
  return invoke<CaptureStatus>('stop_capture');
}

export async function getCaptureStatus(): Promise<CaptureStatus> {
  return invoke<CaptureStatus>('get_capture_status');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording API
// ═══════════════════════════════════════════════════════════════════════════════

export async function startRecording(): Promise<RecordingResult> {
  return invoke<RecordingResult>('start_recording');
}

export async function stopRecording(): Promise<RecordingResult> {
  return invoke<RecordingResult>('stop_recording');
}

export async function getRecordingStatus(): Promise<RecordingStatus> {
  return invoke<RecordingStatus>('get_recording_status');
}

export async function listRecordings(): Promise<string[]> {
  return invoke<string[]>('list_recordings');
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    case 'smart-capture': return '🧠';
    default: return '💾';
  }
}
