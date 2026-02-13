use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════════════════════════
// Capture State
// ═══════════════════════════════════════════════════════════════════════════════

pub struct CaptureState {
    pub is_active: Mutex<bool>,
    pub last_content_hash: Mutex<u64>,
    pub last_window_info: Mutex<String>,
    pub capture_count: Mutex<u32>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            is_active: Mutex::new(false),
            last_content_hash: Mutex::new(0),
            last_window_info: Mutex::new(String::new()),
            capture_count: Mutex::new(0),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording State
// ═══════════════════════════════════════════════════════════════════════════════

pub struct RecordingState {
    pub is_recording: Mutex<bool>,
    pub recording_pid: Mutex<Option<u32>>,
    pub recording_path: Mutex<Option<String>>,
    pub recording_start: Mutex<Option<String>>,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            is_recording: Mutex::new(false),
            recording_pid: Mutex::new(None),
            recording_path: Mutex::new(None),
            recording_start: Mutex::new(None),
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
    pub source: String,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureResult {
    pub success: bool,
    pub changed: bool,
    pub summary: String,
    pub saved_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureStatus {
    pub is_active: bool,
    pub capture_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub recording_path: Option<String>,
    pub recording_start: Option<String>,
    pub duration_seconds: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordingResult {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
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
    
    // Add columns if they don't exist
    conn.execute("ALTER TABLE memories ADD COLUMN source TEXT DEFAULT 'manual'", []).ok();
    conn.execute("ALTER TABLE memories ADD COLUMN content_hash TEXT", []).ok();
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)",
        [],
    )?;
    
    Ok(conn)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

fn calculate_content_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    let normalized: String = content.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
    normalized.hash(&mut hasher);
    hasher.finish()
}

fn is_duplicate_recent(conn: &Connection, content_hash: &str, minutes: i64) -> bool {
    let cutoff = chrono::Local::now()
        .checked_sub_signed(chrono::Duration::minutes(minutes))
        .map(|t| t.to_rfc3339())
        .unwrap_or_default();
    
    conn.query_row(
        "SELECT COUNT(*) FROM memories WHERE content_hash = ? AND created_at > ?",
        params![content_hash, cutoff],
        |row| row.get::<_, i32>(0),
    ).unwrap_or(0) > 0
}

fn build_term_vector(text: &str) -> String {
    use std::collections::HashMap;
    
    let stop_words: std::collections::HashSet<&str> = [
        "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
        "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
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

/// Generate a smart summary based on app + window title + clipboard
fn generate_smart_summary(app_name: &str, window_title: &str, clipboard: Option<&str>) -> String {
    let app_lower = app_name.to_lowercase();
    let title_lower = window_title.to_lowercase();
    
    // Browser patterns
    if app_lower.contains("chrome") || app_lower.contains("safari") || app_lower.contains("firefox") || app_lower.contains("arc") || app_lower.contains("edge") {
        // Email patterns
        if title_lower.contains("gmail") || title_lower.contains("mail") || title_lower.contains("inbox") {
            if title_lower.contains(" - ") {
                let parts: Vec<&str> = window_title.splitn(2, " - ").collect();
                if let Some(subject) = parts.first() {
                    return format!("Reading email: {}", subject.trim());
                }
            }
            return "Checking email".to_string();
        }
        
        // YouTube
        if title_lower.contains("youtube") {
            if title_lower.contains(" - youtube") {
                let video_title = window_title.replace(" - YouTube", "").trim().to_string();
                if !video_title.is_empty() && video_title.len() < 80 {
                    return format!("Watching: {}", video_title);
                }
            }
            return "Browsing YouTube".to_string();
        }
        
        // GitHub
        if title_lower.contains("github") {
            if title_lower.contains("pull request") {
                return "Reviewing pull request on GitHub".to_string();
            }
            if title_lower.contains("issues") {
                return "Browsing GitHub issues".to_string();
            }
            return format!("On GitHub: {}", window_title.split(" · ").next().unwrap_or("repository"));
        }
        
        // Slack/Discord in browser
        if title_lower.contains("slack") {
            return "Chatting in Slack".to_string();
        }
        if title_lower.contains("discord") {
            return "Chatting in Discord".to_string();
        }
        
        // Google Docs/Sheets
        if title_lower.contains("google docs") || title_lower.contains("google sheets") || title_lower.contains("google slides") {
            let doc_type = if title_lower.contains("sheets") { "spreadsheet" }
                else if title_lower.contains("slides") { "presentation" }
                else { "document" };
            return format!("Editing {} in Google Docs", doc_type);
        }
        
        // Notion
        if title_lower.contains("notion") {
            return "Working in Notion".to_string();
        }
        
        // Twitter/X
        if title_lower.contains("twitter") || title_lower.contains(" / x") || title_lower.contains("x.com") {
            return "Browsing Twitter/X".to_string();
        }
        
        // LinkedIn
        if title_lower.contains("linkedin") {
            return "On LinkedIn".to_string();
        }
        
        // Reddit
        if title_lower.contains("reddit") {
            return "Browsing Reddit".to_string();
        }
        
        // Stack Overflow
        if title_lower.contains("stack overflow") {
            return "Looking up on Stack Overflow".to_string();
        }
        
        // Generic browser - use page title
        if !window_title.is_empty() && window_title.len() < 100 {
            return format!("Browsing: {}", window_title);
        }
        return format!("Browsing in {}", app_name);
    }
    
    // Code editors
    if app_lower.contains("code") || app_lower.contains("vscode") || app_lower.contains("visual studio") {
        if !window_title.is_empty() {
            // Extract filename from VS Code title
            let parts: Vec<&str> = window_title.split(" — ").collect();
            if let Some(file_part) = parts.first() {
                let filename = file_part.trim();
                if filename.contains('.') {
                    return format!("Editing {} in VS Code", filename);
                }
            }
        }
        return "Coding in VS Code".to_string();
    }
    
    if app_lower.contains("xcode") {
        return "Developing in Xcode".to_string();
    }
    
    if app_lower.contains("cursor") {
        return "Coding with Cursor AI".to_string();
    }
    
    // Terminal
    if app_lower.contains("terminal") || app_lower.contains("iterm") || app_lower.contains("warp") || app_lower.contains("kitty") {
        return "Working in terminal".to_string();
    }
    
    // Communication apps
    if app_lower.contains("slack") {
        if !window_title.is_empty() {
            return format!("Slack: {}", window_title);
        }
        return "Chatting in Slack".to_string();
    }
    
    if app_lower.contains("discord") {
        return "Chatting in Discord".to_string();
    }
    
    if app_lower.contains("messages") || app_lower.contains("imessage") {
        return "Messaging".to_string();
    }
    
    if app_lower.contains("zoom") {
        return "In a Zoom call".to_string();
    }
    
    if app_lower.contains("teams") {
        return "In Microsoft Teams".to_string();
    }
    
    // Design apps
    if app_lower.contains("figma") {
        return "Designing in Figma".to_string();
    }
    
    if app_lower.contains("sketch") {
        return "Designing in Sketch".to_string();
    }
    
    // Notes/Writing
    if app_lower.contains("notes") {
        return "Taking notes".to_string();
    }
    
    if app_lower.contains("obsidian") {
        return "Writing in Obsidian".to_string();
    }
    
    if app_lower.contains("notion") {
        return "Working in Notion".to_string();
    }
    
    // Finder
    if app_lower.contains("finder") {
        if !window_title.is_empty() {
            return format!("Browsing files: {}", window_title);
        }
        return "Managing files in Finder".to_string();
    }
    
    // Preview
    if app_lower.contains("preview") {
        if !window_title.is_empty() {
            return format!("Viewing: {}", window_title);
        }
        return "Viewing document in Preview".to_string();
    }
    
    // Music/Spotify
    if app_lower.contains("spotify") || app_lower.contains("music") {
        if !window_title.is_empty() && !title_lower.contains("spotify") {
            return format!("Listening to: {}", window_title);
        }
        return "Listening to music".to_string();
    }
    
    // Calendar
    if app_lower.contains("calendar") {
        return "Checking calendar".to_string();
    }
    
    // Use clipboard for context if meaningful
    if let Some(clip) = clipboard {
        if !clip.is_empty() && clip.len() > 10 && clip.len() < 200 {
            // Check if clipboard has code
            if clip.contains("function") || clip.contains("const ") || clip.contains("import ") {
                return format!("Working with code in {}", app_name);
            }
            // Check if clipboard is a URL
            if clip.starts_with("http") {
                return format!("Copied link from {}", app_name);
            }
        }
    }
    
    // Default: use app name with window title
    if !window_title.is_empty() && window_title.len() < 60 && window_title != app_name {
        return format!("{}: {}", app_name, window_title);
    }
    
    format!("Using {}", app_name)
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
    let storage_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    
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
    
    let content_hash = format!("{:x}", calculate_content_hash(&content));
    if is_duplicate_recent(&conn, &content_hash, 5) {
        return Err("Duplicate content within last 5 minutes".to_string());
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
    let rows = conn.execute("DELETE FROM memories WHERE id = ?", params![id]).map_err(|e| e.to_string())?;
    Ok(rows > 0)
}

#[tauri::command]
fn delete_all_memories(db: State<DbConnection>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let rows = conn.execute("DELETE FROM memories", []).map_err(|e| e.to_string())?;
    conn.execute("VACUUM", []).ok();
    Ok(rows)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture Commands
// ═══════════════════════════════════════════════════════════════════════════════

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
        return frontApp & "|||" & frontWindow
    "#;

    match Command::new("osascript").arg("-e").arg(script).output() {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let parts: Vec<&str> = result.splitn(2, "|||").collect();
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

#[tauri::command]
fn capture_screenshot(app: tauri::AppHandle) -> CaptureResult {
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("/tmp"));
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
                    changed: true,
                    summary: format!("Screenshot saved: {}", path.to_string_lossy()),
                    saved_id: None,
                    error: None,
                }
            } else {
                CaptureResult {
                    success: false,
                    changed: false,
                    summary: String::new(),
                    saved_id: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                }
            }
        }
        Err(e) => CaptureResult {
            success: false,
            changed: false,
            summary: String::new(),
            saved_id: None,
            error: Some(e.to_string()),
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Smart Capture — The Main Feature
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn smart_capture(
    db: State<DbConnection>,
    capture_state: State<CaptureState>,
) -> CaptureResult {
    // Get current window info
    let window = get_active_window();
    let clipboard = get_clipboard();
    
    // Generate a smart summary
    let summary = generate_smart_summary(
        &window.app_name,
        &window.window_title,
        if clipboard.content.len() > 5 { Some(&clipboard.content) } else { None }
    );
    
    // Create a content hash to detect changes
    let content_key = format!("{}|{}|{}", window.app_name, window.window_title, &clipboard.content[..clipboard.content.len().min(100)]);
    let content_hash = calculate_content_hash(&content_key);
    
    // Check if anything changed
    let last_hash = *capture_state.last_content_hash.lock().unwrap();
    let last_window = capture_state.last_window_info.lock().unwrap().clone();
    let current_window = format!("{}|{}", window.app_name, window.window_title);
    
    // If nothing changed, skip
    if content_hash == last_hash && current_window == last_window {
        return CaptureResult {
            success: true,
            changed: false,
            summary: String::new(),
            saved_id: None,
            error: None,
        };
    }
    
    // Update state
    *capture_state.last_content_hash.lock().unwrap() = content_hash;
    *capture_state.last_window_info.lock().unwrap() = current_window;
    *capture_state.capture_count.lock().unwrap() += 1;
    
    // Skip if unknown app or system UI
    if window.app_name == "Unknown" || window.app_name == "loginwindow" || window.app_name == "ScreenSaverEngine" {
        return CaptureResult {
            success: true,
            changed: false,
            summary: String::new(),
            saved_id: None,
            error: None,
        };
    }
    
    // Auto-generate tags
    let mut tags = vec!["activity".to_string()];
    let app_lower = window.app_name.to_lowercase();
    
    if app_lower.contains("code") || app_lower.contains("terminal") || app_lower.contains("xcode") {
        tags.push("coding".to_string());
    }
    if app_lower.contains("chrome") || app_lower.contains("safari") || app_lower.contains("firefox") || app_lower.contains("arc") {
        tags.push("browsing".to_string());
    }
    if app_lower.contains("slack") || app_lower.contains("discord") || app_lower.contains("messages") || app_lower.contains("zoom") {
        tags.push("communication".to_string());
    }
    
    // Save to database
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => {
            return CaptureResult {
                success: false,
                changed: true,
                summary: summary.clone(),
                saved_id: None,
                error: Some(format!("Database error: {}", e)),
            };
        }
    };
    
    // Check for duplicates
    let content_hash_str = format!("{:x}", content_hash);
    if is_duplicate_recent(&conn, &content_hash_str, 2) {
        return CaptureResult {
            success: true,
            changed: true,
            summary,
            saved_id: None,
            error: None,
        };
    }
    
    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let embedding = build_term_vector(&summary);
    
    let insert_result = conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, summary, embedding, tags_json, window.app_name, "smart-capture", content_hash_str, now, now],
    );
    
    match insert_result {
        Ok(_) => CaptureResult {
            success: true,
            changed: true,
            summary,
            saved_id: Some(id),
            error: None,
        },
        Err(e) => CaptureResult {
            success: false,
            changed: true,
            summary,
            saved_id: None,
            error: Some(format!("Failed to save: {}", e)),
        },
    }
}

#[tauri::command]
fn start_capture(capture_state: State<CaptureState>) -> CaptureStatus {
    *capture_state.is_active.lock().unwrap() = true;
    *capture_state.capture_count.lock().unwrap() = 0;
    *capture_state.last_content_hash.lock().unwrap() = 0;
    *capture_state.last_window_info.lock().unwrap() = String::new();
    
    CaptureStatus {
        is_active: true,
        capture_count: 0,
    }
}

#[tauri::command]
fn stop_capture(capture_state: State<CaptureState>) -> CaptureStatus {
    let count = *capture_state.capture_count.lock().unwrap();
    *capture_state.is_active.lock().unwrap() = false;
    
    CaptureStatus {
        is_active: false,
        capture_count: count,
    }
}

#[tauri::command]
fn get_capture_status(capture_state: State<CaptureState>) -> CaptureStatus {
    CaptureStatus {
        is_active: *capture_state.is_active.lock().unwrap(),
        capture_count: *capture_state.capture_count.lock().unwrap(),
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording Commands
// ═══════════════════════════════════════════════════════════════════════════════

fn get_recordings_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".contextbridge")
        .join("recordings")
}

#[tauri::command]
fn start_recording(recording_state: State<RecordingState>) -> RecordingResult {
    // Check if already recording
    if *recording_state.is_recording.lock().unwrap() {
        return RecordingResult {
            success: false,
            path: None,
            error: Some("Already recording".to_string()),
        };
    }
    
    // Create recordings directory
    let recordings_dir = get_recordings_dir();
    if let Err(e) = std::fs::create_dir_all(&recordings_dir) {
        return RecordingResult {
            success: false,
            path: None,
            error: Some(format!("Failed to create recordings directory: {}", e)),
        };
    }
    
    // Generate filename with timestamp
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("recording_{}.mov", timestamp);
    let path = recordings_dir.join(&filename);
    let path_str = path.to_string_lossy().to_string();
    
    // Start screen recording using screencapture -V (video mode)
    // -V records video, -C captures cursor, -T 0 means no timeout (runs until stopped)
    match Command::new("screencapture")
        .args(["-V", "-C", &path_str])
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            *recording_state.is_recording.lock().unwrap() = true;
            *recording_state.recording_pid.lock().unwrap() = Some(pid);
            *recording_state.recording_path.lock().unwrap() = Some(path_str.clone());
            *recording_state.recording_start.lock().unwrap() = Some(Local::now().to_rfc3339());
            
            RecordingResult {
                success: true,
                path: Some(path_str),
                error: None,
            }
        }
        Err(e) => RecordingResult {
            success: false,
            path: None,
            error: Some(format!("Failed to start recording: {}", e)),
        },
    }
}

#[tauri::command]
fn stop_recording(recording_state: State<RecordingState>) -> RecordingResult {
    // Check if recording
    if !*recording_state.is_recording.lock().unwrap() {
        return RecordingResult {
            success: false,
            path: None,
            error: Some("Not recording".to_string()),
        };
    }
    
    // Get the recording PID and path
    let pid = recording_state.recording_pid.lock().unwrap().take();
    let path = recording_state.recording_path.lock().unwrap().clone();
    
    // Stop recording by sending SIGINT to the process
    if let Some(pid) = pid {
        // Use kill to send SIGINT (Ctrl+C) which gracefully stops screencapture
        let _ = Command::new("kill")
            .args(["-INT", &pid.to_string()])
            .output();
        
        // Give it a moment to finalize the file
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    
    // Update state
    *recording_state.is_recording.lock().unwrap() = false;
    *recording_state.recording_start.lock().unwrap() = None;
    
    RecordingResult {
        success: true,
        path,
        error: None,
    }
}

#[tauri::command]
fn get_recording_status(recording_state: State<RecordingState>) -> RecordingStatus {
    let is_recording = *recording_state.is_recording.lock().unwrap();
    let recording_path = recording_state.recording_path.lock().unwrap().clone();
    let recording_start = recording_state.recording_start.lock().unwrap().clone();
    
    // Calculate duration if recording
    let duration_seconds = if is_recording {
        if let Some(ref start_str) = recording_start {
            if let Ok(start) = chrono::DateTime::parse_from_rfc3339(start_str) {
                let now = Local::now();
                Some((now.signed_duration_since(start.with_timezone(&Local))).num_seconds() as u64)
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };
    
    RecordingStatus {
        is_recording,
        recording_path: if is_recording { recording_path } else { None },
        recording_start: if is_recording { recording_start } else { None },
        duration_seconds,
    }
}

#[tauri::command]
fn list_recordings() -> Result<Vec<String>, String> {
    let recordings_dir = get_recordings_dir();
    
    if !recordings_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut recordings: Vec<String> = std::fs::read_dir(&recordings_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension()
                .map(|ext| ext == "mov" || ext == "mp4")
                .unwrap_or(false)
        })
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect();
    
    // Sort by filename (which includes timestamp, so newest first)
    recordings.sort_by(|a, b| b.cmp(a));
    
    Ok(recordings)
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

    let capture_state = CaptureState::default();
    let recording_state = RecordingState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db)
        .manage(capture_state)
        .manage(recording_state)
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
            let menu = Menu::with_items(app, &[&show, &quit])?;

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
            get_active_window,
            get_clipboard,
            capture_screenshot,
            // Smart Capture
            smart_capture,
            start_capture,
            stop_capture,
            get_capture_status,
            // Screen Recording
            start_recording,
            stop_recording,
            get_recording_status,
            list_recordings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
