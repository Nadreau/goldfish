use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State,
};
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording State
// ═══════════════════════════════════════════════════════════════════════════════

pub struct RecordingState {
    pub process: Mutex<Option<Child>>,
    pub current_path: Mutex<Option<String>>,
    pub is_recording: Mutex<bool>,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            current_path: Mutex::new(None),
            is_recording: Mutex::new(false),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Continuous Capture State
// ═══════════════════════════════════════════════════════════════════════════════

pub struct ContinuousCaptureState {
    pub is_active: Mutex<bool>,
    pub last_frame_hash: Mutex<u64>,
    pub last_ocr_text: Mutex<String>,
    pub capture_count: Mutex<u32>,
}

impl Default for ContinuousCaptureState {
    fn default() -> Self {
        Self {
            is_active: Mutex::new(false),
            last_frame_hash: Mutex::new(0),
            last_ocr_text: Mutex::new(String::new()),
            capture_count: Mutex::new(0),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Memory {
    pub id: String,
    pub content: String,
    pub tags: Vec<String>,
    pub source: String, // 'manual', 'clipboard', 'screenshot', 'app-tracking', 'ocr'
    pub source_app: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryStats {
    pub total_memories: usize,
    pub memories_today: usize,
    pub storage_bytes: u64,
    pub sources: std::collections::HashMap<String, usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureResult {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActiveWindow {
    pub app_name: String,
    pub window_title: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardContent {
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CaptureSettings {
    pub screenshots_enabled: bool,
    pub clipboard_enabled: bool,
    pub app_tracking_enabled: bool,
    pub browser_enabled: bool,
    pub capture_paused: bool,
    pub frequency_seconds: u32,
}

impl Default for CaptureSettings {
    fn default() -> Self {
        Self {
            screenshots_enabled: false,
            clipboard_enabled: true,
            app_tracking_enabled: true,
            browser_enabled: false,
            capture_paused: false,
            frequency_seconds: 300,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OCRResult {
    pub success: bool,
    pub text: Option<String>,
    pub confidence: Option<f64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContinuousCaptureResult {
    pub success: bool,
    pub changed: bool,
    pub ocr_text: Option<String>,
    pub saved_memory_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContinuousCaptureStatus {
    pub is_active: bool,
    pub capture_count: u32,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Database
// ═══════════════════════════════════════════════════════════════════════════════

fn get_db_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".contextbridge")
        .join("memories.db")
}

fn get_data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".contextbridge")
}

pub struct DbConnection(pub Mutex<Connection>);

fn init_db() -> Result<Connection, rusqlite::Error> {
    let db_path = get_db_path();
    
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    let conn = Connection::open(&db_path)?;
    
    conn.pragma_update(None, "journal_mode", "WAL")?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            source_app TEXT NOT NULL DEFAULT 'unknown',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    
    conn.execute(
        "ALTER TABLE memories ADD COLUMN source TEXT DEFAULT 'manual'",
        [],
    ).ok();
    
    // Add content_hash for deduplication
    conn.execute(
        "ALTER TABLE memories ADD COLUMN content_hash TEXT",
        [],
    ).ok();
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash)",
        [],
    ).ok();
    
    Ok(conn)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/// Calculate hash of content for deduplication
fn calculate_content_hash(content: &str) -> String {
    let mut hasher = DefaultHasher::new();
    // Normalize whitespace and lowercase for comparison
    let normalized: String = content
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    normalized.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

/// Check if content is duplicate within last N hours
fn is_duplicate_content(conn: &Connection, content_hash: &str, hours: i64) -> bool {
    let cutoff = chrono::Local::now()
        .checked_sub_signed(chrono::Duration::hours(hours))
        .map(|t| t.to_rfc3339())
        .unwrap_or_default();
    
    conn.query_row(
        "SELECT COUNT(*) FROM memories WHERE content_hash = ? AND created_at > ?",
        params![content_hash, cutoff],
        |row| row.get::<_, i32>(0),
    )
    .unwrap_or(0) > 0
}

/// Calculate image hash for frame differencing
fn calculate_image_hash(path: &str) -> Option<u64> {
    // Use sips to get image dimensions as a quick hash proxy
    // For proper frame differencing, we'd need image processing libs
    let output = Command::new("sips")
        .args(["-g", "pixelWidth", "-g", "pixelHeight", path])
        .output()
        .ok()?;
    
    let _output_str = String::from_utf8_lossy(&output.stdout);
    let mut hasher = DefaultHasher::new();
    
    // Also include file modification time for change detection
    if let Ok(metadata) = std::fs::metadata(path) {
        if let Ok(modified) = metadata.modified() {
            modified.hash(&mut hasher);
        }
    }
    
    // Quick sampling of file for hash
    if let Ok(data) = std::fs::read(path) {
        // Sample every 1000th byte for performance
        for (i, byte) in data.iter().enumerate() {
            if i % 1000 == 0 {
                byte.hash(&mut hasher);
            }
        }
    }
    
    Some(hasher.finish())
}

/// Clean similarity of two text strings (0.0 to 1.0)
fn text_similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    
    let a_lower = a.to_lowercase();
    let b_lower = b.to_lowercase();
    
    let a_words: std::collections::HashSet<&str> = a_lower
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .collect();
    
    let b_words: std::collections::HashSet<&str> = b_lower
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .collect();
    
    if a_words.is_empty() || b_words.is_empty() {
        return 0.0;
    }
    
    let intersection = a_words.intersection(&b_words).count();
    let union = a_words.union(&b_words).count();
    
    intersection as f64 / union as f64
}

// Simple term vector compatible with MCP server's TF-IDF approach
fn build_term_vector(text: &str) -> String {
    use std::collections::HashMap;
    
    let stop_words: std::collections::HashSet<&str> = [
        "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
        "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
        "this", "but", "his", "by", "from", "they", "we", "say", "her", "is",
    ].iter().cloned().collect();
    
    let tokens: Vec<String> = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .filter(|t| t.len() > 1 && !stop_words.contains(t))
        .map(|s| s.to_string())
        .collect();
    
    let total = tokens.len().max(1) as f64;
    let mut freq: HashMap<String, f64> = HashMap::new();
    
    for token in &tokens {
        *freq.entry(token.clone()).or_insert(0.0) += 1.0 / total;
    }
    
    serde_json::to_string(&freq).unwrap_or_else(|_| "{}".to_string())
}

// ═══════════════════════════════════════════════════════════════════════════════
// OCR using macOS Vision Framework
// ═══════════════════════════════════════════════════════════════════════════════

/// Perform OCR on an image using macOS Vision framework via Swift script
fn perform_ocr(image_path: &str) -> OCRResult {
    // Swift script to perform OCR using Vision framework
    let swift_script = r#"
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    print("ERROR: No image path provided")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath) else {
    print("ERROR: Could not load image")
    exit(1)
}

guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("ERROR: Could not create CGImage")
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
    guard let observations = request.results else {
        print("ERROR: No results")
        exit(1)
    }
    
    var allText: [String] = []
    var totalConfidence: Float = 0
    var count: Int = 0
    
    for observation in observations {
        if let topCandidate = observation.topCandidates(1).first {
            allText.append(topCandidate.string)
            totalConfidence += topCandidate.confidence
            count += 1
        }
    }
    
    let text = allText.joined(separator: "\n")
    let avgConfidence = count > 0 ? totalConfidence / Float(count) : 0
    
    print("TEXT_START")
    print(text)
    print("TEXT_END")
    print("CONFIDENCE:\(avgConfidence)")
} catch {
    print("ERROR: \(error.localizedDescription)")
    exit(1)
}
"#;

    // Write the Swift script to a temp file
    let script_path = std::env::temp_dir().join("contextbridge_ocr.swift");
    if let Err(e) = std::fs::write(&script_path, swift_script) {
        return OCRResult {
            success: false,
            text: None,
            confidence: None,
            error: Some(format!("Failed to write OCR script: {}", e)),
        };
    }

    // Execute the Swift script
    let output = Command::new("swift")
        .arg(&script_path)
        .arg(image_path)
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            if !output.status.success() {
                return OCRResult {
                    success: false,
                    text: None,
                    confidence: None,
                    error: Some(format!("OCR failed: {}", stderr)),
                };
            }
            
            // Parse the output
            let mut text = String::new();
            let mut confidence: Option<f64> = None;
            let mut in_text = false;
            
            for line in stdout.lines() {
                if line == "TEXT_START" {
                    in_text = true;
                    continue;
                }
                if line == "TEXT_END" {
                    in_text = false;
                    continue;
                }
                if line.starts_with("CONFIDENCE:") {
                    confidence = line.replace("CONFIDENCE:", "").parse().ok();
                    continue;
                }
                if in_text {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(line);
                }
            }
            
            OCRResult {
                success: true,
                text: if text.is_empty() { None } else { Some(text) },
                confidence,
                error: None,
            }
        }
        Err(e) => OCRResult {
            success: false,
            text: None,
            confidence: None,
            error: Some(format!("Failed to execute OCR: {}", e)),
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Database Commands
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn get_all_memories(db: State<DbConnection>, limit: Option<usize>) -> Result<Vec<Memory>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100);
    
    let mut stmt = conn
        .prepare("SELECT id, content, tags, source_app, created_at, source FROM memories ORDER BY created_at DESC LIMIT ?")
        .map_err(|e| e.to_string())?;
    
    let memories = stmt
        .query_map(params![limit], |row| {
            let tags_json: String = row.get(2)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let source: Option<String> = row.get(5).ok();
            
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                tags,
                source: source.unwrap_or_else(|| "manual".to_string()),
                source_app: row.get(3).ok(),
                timestamp: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(memories)
}

#[tauri::command]
fn search_memories(db: State<DbConnection>, query: String, limit: Option<usize>) -> Result<Vec<Memory>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(20);
    let search_pattern = format!("%{}%", query.to_lowercase());
    
    let mut stmt = conn
        .prepare("SELECT id, content, tags, source_app, created_at, source FROM memories WHERE LOWER(content) LIKE ? OR LOWER(tags) LIKE ? ORDER BY created_at DESC LIMIT ?")
        .map_err(|e| e.to_string())?;
    
    let memories = stmt
        .query_map(params![search_pattern, search_pattern, limit], |row| {
            let tags_json: String = row.get(2)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let source: Option<String> = row.get(5).ok();
            
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                tags,
                source: source.unwrap_or_else(|| "manual".to_string()),
                source_app: row.get(3).ok(),
                timestamp: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(memories)
}

#[tauri::command]
fn get_memory_stats(db: State<DbConnection>) -> Result<MemoryStats, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    let total: usize = conn
        .query_row("SELECT COUNT(*) FROM memories", [], |row| row.get(0))
        .unwrap_or(0);
    
    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_count: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM memories WHERE created_at LIKE ?",
            params![format!("{}%", today)],
            |row| row.get(0),
        )
        .unwrap_or(0);
    
    let db_path = get_db_path();
    let storage_bytes = std::fs::metadata(&db_path)
        .map(|m| m.len())
        .unwrap_or(0);
    
    let mut sources = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT source, COUNT(*) FROM memories GROUP BY source") {
        if let Ok(rows) = stmt.query_map([], |row| {
            let source: String = row.get(0).unwrap_or_else(|_| "unknown".to_string());
            let count: usize = row.get(1)?;
            Ok((source, count))
        }) {
            for row in rows.flatten() {
                sources.insert(row.0, row.1);
            }
        }
    }
    
    Ok(MemoryStats {
        total_memories: total,
        memories_today: today_count,
        storage_bytes,
        sources,
    })
}

#[tauri::command]
fn save_memory(
    db: State<DbConnection>,
    content: String,
    tags: Vec<String>,
    source: String,
    source_app: Option<String>,
) -> Result<Memory, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    // Check for duplicates
    let content_hash = calculate_content_hash(&content);
    if is_duplicate_content(&conn, &content_hash, 1) {
        return Err("Duplicate content within last hour".to_string());
    }
    
    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let source_app_str = source_app.clone().unwrap_or_else(|| "unknown".to_string());
    
    let embedding = build_term_vector(&content);
    
    conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, content, embedding, tags_json, source_app_str, source, content_hash, now, now],
    ).map_err(|e| e.to_string())?;
    
    Ok(Memory {
        id,
        content,
        tags,
        source,
        source_app,
        timestamp: now,
    })
}

#[tauri::command]
fn delete_memory(db: State<DbConnection>, id: String) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    let rows = conn
        .execute("DELETE FROM memories WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(rows > 0)
}

#[tauri::command]
fn delete_all_memories(db: State<DbConnection>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    let rows = conn
        .execute("DELETE FROM memories", [])
        .map_err(|e| e.to_string())?;
    
    conn.execute("VACUUM", []).ok();
    
    Ok(rows)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture Commands
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn capture_screenshot(app: tauri::AppHandle) -> CaptureResult {
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp"));
    let screenshots_dir = data_dir.join("screenshots");
    std::fs::create_dir_all(&screenshots_dir).ok();
    let path = screenshots_dir.join(format!("capture_{}.png", timestamp));

    match Command::new("screencapture")
        .args(["-x", "-C", path.to_str().unwrap_or("/tmp/cb_capture.png")])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                CaptureResult {
                    success: true,
                    path: Some(path.to_string_lossy().to_string()),
                    error: None,
                }
            } else {
                CaptureResult {
                    success: false,
                    path: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                }
            }
        }
        Err(e) => CaptureResult {
            success: false,
            path: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn get_active_window() -> ActiveWindow {
    let script = r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            set frontWindow to ""
            try
                tell application process frontApp
                    set frontWindow to name of front window
                end tell
            end try
        end tell
        return frontApp & "|" & frontWindow
    "#;

    match Command::new("osascript").arg("-e").arg(script).output() {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let parts: Vec<&str> = result.splitn(2, '|').collect();
            ActiveWindow {
                app_name: parts.first().unwrap_or(&"Unknown").to_string(),
                window_title: parts.get(1).unwrap_or(&"").to_string(),
                timestamp: Local::now().to_rfc3339(),
            }
        }
        Err(_) => ActiveWindow {
            app_name: "Unknown".into(),
            window_title: "".into(),
            timestamp: Local::now().to_rfc3339(),
        },
    }
}

#[tauri::command]
fn get_clipboard() -> ClipboardContent {
    match Command::new("pbpaste").output() {
        Ok(output) => ClipboardContent {
            content: String::from_utf8_lossy(&output.stdout).to_string(),
            timestamp: Local::now().to_rfc3339(),
        },
        Err(_) => ClipboardContent {
            content: String::new(),
            timestamp: Local::now().to_rfc3339(),
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Continuous Capture + OCR Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn perform_ocr_on_image(image_path: String) -> OCRResult {
    perform_ocr(&image_path)
}

#[tauri::command]
fn capture_and_ocr(
    _app: tauri::AppHandle,
    db: State<DbConnection>,
    capture_state: State<ContinuousCaptureState>,
) -> ContinuousCaptureResult {
    // Take screenshot to temp location
    let timestamp = Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
    let temp_dir = std::env::temp_dir().join("contextbridge_capture");
    std::fs::create_dir_all(&temp_dir).ok();
    let temp_path = temp_dir.join(format!("capture_{}.png", timestamp));
    
    // Capture screenshot silently
    let capture_result = Command::new("screencapture")
        .args(["-x", "-C", temp_path.to_str().unwrap_or("/tmp/cb_ocr.png")])
        .output();
    
    let capture_ok = match capture_result {
        Ok(output) => output.status.success(),
        Err(_) => false,
    };
    
    if !capture_ok {
        return ContinuousCaptureResult {
            success: false,
            changed: false,
            ocr_text: None,
            saved_memory_id: None,
            error: Some("Screenshot capture failed".to_string()),
        };
    }
    
    // Calculate image hash for frame differencing
    let current_hash = calculate_image_hash(temp_path.to_str().unwrap_or("")).unwrap_or(0);
    let last_hash = *capture_state.last_frame_hash.lock().unwrap();
    
    // If screen hasn't changed significantly, skip OCR
    if current_hash == last_hash && last_hash != 0 {
        // Delete temp file
        std::fs::remove_file(&temp_path).ok();
        
        return ContinuousCaptureResult {
            success: true,
            changed: false,
            ocr_text: None,
            saved_memory_id: None,
            error: None,
        };
    }
    
    // Update last frame hash
    *capture_state.last_frame_hash.lock().unwrap() = current_hash;
    
    // Perform OCR
    let ocr_result = perform_ocr(temp_path.to_str().unwrap_or(""));
    
    // Delete temp screenshot immediately after OCR
    std::fs::remove_file(&temp_path).ok();
    
    if !ocr_result.success {
        return ContinuousCaptureResult {
            success: false,
            changed: true,
            ocr_text: None,
            saved_memory_id: None,
            error: ocr_result.error,
        };
    }
    
    let ocr_text = match ocr_result.text {
        Some(text) if !text.trim().is_empty() => text,
        _ => {
            return ContinuousCaptureResult {
                success: true,
                changed: true,
                ocr_text: None,
                saved_memory_id: None,
                error: None,
            };
        }
    };
    
    // Check similarity with last OCR text
    let last_ocr = capture_state.last_ocr_text.lock().unwrap().clone();
    let similarity = text_similarity(&ocr_text, &last_ocr);
    
    // If text is too similar (>80% overlap), skip saving
    if similarity > 0.8 {
        return ContinuousCaptureResult {
            success: true,
            changed: true,
            ocr_text: Some(ocr_text),
            saved_memory_id: None,
            error: None,
        };
    }
    
    // Update last OCR text
    *capture_state.last_ocr_text.lock().unwrap() = ocr_text.clone();
    
    // Increment capture count
    *capture_state.capture_count.lock().unwrap() += 1;
    
    // Get active window for context
    let active_window = get_active_window();
    
    // Auto-generate tags based on content
    let mut tags = vec!["ocr".to_string(), "screen-capture".to_string()];
    if ocr_text.contains("http://") || ocr_text.contains("https://") {
        tags.push("contains-url".to_string());
    }
    if ocr_text.lines().any(|l| l.contains("func ") || l.contains("fn ") || l.contains("def ") || l.contains("class ")) {
        tags.push("code".to_string());
    }
    
    // Save to database
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => {
            return ContinuousCaptureResult {
                success: false,
                changed: true,
                ocr_text: Some(ocr_text),
                saved_memory_id: None,
                error: Some(format!("Database error: {}", e)),
            };
        }
    };
    
    // Check for duplicates
    let content_hash = calculate_content_hash(&ocr_text);
    if is_duplicate_content(&conn, &content_hash, 1) {
        return ContinuousCaptureResult {
            success: true,
            changed: true,
            ocr_text: Some(ocr_text),
            saved_memory_id: None,
            error: None,
        };
    }
    
    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let source_app = if active_window.app_name != "Unknown" {
        active_window.app_name.clone()
    } else {
        "Screen".to_string()
    };
    
    let embedding = build_term_vector(&ocr_text);
    
    let insert_result = conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, ocr_text, embedding, tags_json, source_app, "ocr", content_hash, now, now],
    );
    
    match insert_result {
        Ok(_) => ContinuousCaptureResult {
            success: true,
            changed: true,
            ocr_text: Some(ocr_text),
            saved_memory_id: Some(id),
            error: None,
        },
        Err(e) => ContinuousCaptureResult {
            success: false,
            changed: true,
            ocr_text: Some(ocr_text),
            saved_memory_id: None,
            error: Some(format!("Failed to save: {}", e)),
        },
    }
}

#[tauri::command]
fn start_continuous_capture(capture_state: State<ContinuousCaptureState>) -> ContinuousCaptureStatus {
    *capture_state.is_active.lock().unwrap() = true;
    *capture_state.capture_count.lock().unwrap() = 0;
    *capture_state.last_frame_hash.lock().unwrap() = 0;
    *capture_state.last_ocr_text.lock().unwrap() = String::new();
    
    ContinuousCaptureStatus {
        is_active: true,
        capture_count: 0,
    }
}

#[tauri::command]
fn stop_continuous_capture(capture_state: State<ContinuousCaptureState>) -> ContinuousCaptureStatus {
    let count = *capture_state.capture_count.lock().unwrap();
    *capture_state.is_active.lock().unwrap() = false;
    
    ContinuousCaptureStatus {
        is_active: false,
        capture_count: count,
    }
}

#[tauri::command]
fn get_continuous_capture_status(capture_state: State<ContinuousCaptureState>) -> ContinuousCaptureStatus {
    ContinuousCaptureStatus {
        is_active: *capture_state.is_active.lock().unwrap(),
        capture_count: *capture_state.capture_count.lock().unwrap(),
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording Commands
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordingResult {
    pub success: bool,
    pub is_recording: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
fn start_screen_recording(
    app: tauri::AppHandle,
    recording_state: State<RecordingState>,
) -> RecordingResult {
    let mut is_recording = recording_state.is_recording.lock().unwrap();
    
    if *is_recording {
        return RecordingResult {
            success: false,
            is_recording: true,
            path: None,
            error: Some("Already recording".to_string()),
        };
    }
    
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp"));
    let recordings_dir = data_dir.join("recordings");
    std::fs::create_dir_all(&recordings_dir).ok();
    
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let path = recordings_dir.join(format!("recording_{}.mov", timestamp));
    let path_str = path.to_string_lossy().to_string();
    
    match Command::new("screencapture")
        .args(["-V", "36000", "-C", &path_str])
        .spawn()
    {
        Ok(child) => {
            *recording_state.process.lock().unwrap() = Some(child);
            *recording_state.current_path.lock().unwrap() = Some(path_str.clone());
            *is_recording = true;
            
            RecordingResult {
                success: true,
                is_recording: true,
                path: Some(path_str),
                error: None,
            }
        }
        Err(e) => RecordingResult {
            success: false,
            is_recording: false,
            path: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn stop_screen_recording(recording_state: State<RecordingState>) -> RecordingResult {
    let mut is_recording = recording_state.is_recording.lock().unwrap();
    let mut process = recording_state.process.lock().unwrap();
    let current_path = recording_state.current_path.lock().unwrap().clone();
    
    if !*is_recording {
        return RecordingResult {
            success: false,
            is_recording: false,
            path: None,
            error: Some("Not recording".to_string()),
        };
    }
    
    if let Some(mut child) = process.take() {
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(child.id() as i32, libc::SIGINT);
            }
        }
        
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = child.kill();
        let _ = child.wait();
    }
    
    *is_recording = false;
    *recording_state.current_path.lock().unwrap() = None;
    
    RecordingResult {
        success: true,
        is_recording: false,
        path: current_path,
        error: None,
    }
}

#[tauri::command]
fn get_recording_status(recording_state: State<RecordingState>) -> RecordingResult {
    let is_recording = *recording_state.is_recording.lock().unwrap();
    let current_path = recording_state.current_path.lock().unwrap().clone();
    
    RecordingResult {
        success: true,
        is_recording,
        path: current_path,
        error: None,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Entry
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = match init_db() {
        Ok(conn) => DbConnection(Mutex::new(conn)),
        Err(e) => {
            eprintln!("Failed to initialize database: {}", e);
            std::process::exit(1);
        }
    };

    let recording_state = RecordingState::default();
    let continuous_capture_state = ContinuousCaptureState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db)
        .manage(recording_state)
        .manage(continuous_capture_state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let quit = MenuItem::with_id(app, "quit", "Quit ContextBridge", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
            let capture = MenuItem::with_id(app, "capture", "Capture Now", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &capture, &quit])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("ContextBridge — Your AI Memory")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "capture" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("trigger-capture", ());
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database
            get_all_memories,
            search_memories,
            get_memory_stats,
            save_memory,
            delete_memory,
            delete_all_memories,
            // Capture
            capture_screenshot,
            get_active_window,
            get_clipboard,
            // OCR & Continuous Capture
            perform_ocr_on_image,
            capture_and_ocr,
            start_continuous_capture,
            stop_continuous_capture,
            get_continuous_capture_status,
            // Screen Recording
            start_screen_recording,
            stop_screen_recording,
            get_recording_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
