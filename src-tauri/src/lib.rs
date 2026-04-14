use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Emitter, Manager, RunEvent, State,
};
use uuid::Uuid;

mod capture;

// ═══════════════════════════════════════════════════════════════════════════════
// Scene Snapshot — buffered in memory for AI scene understanding
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SceneSnapshot {
    pub app_name: String,
    pub window_title: String,
    pub ocr_text: String,
    pub timestamp: String,
    pub browser_url: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture State — thread-safe with atomics for the background loop
// ═══════════════════════════════════════════════════════════════════════════════

const SCENE_BUFFER_MAX: usize = 30;

pub struct CaptureState {
    pub is_active: Arc<AtomicBool>,
    pub last_content_hash: Mutex<u64>,
    pub last_window_info: Arc<Mutex<String>>,
    pub last_ocr_text: Arc<Mutex<String>>,
    pub capture_count: Arc<AtomicU32>,
    pub thread_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
    pub scene_buffer: Arc<Mutex<Vec<SceneSnapshot>>>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
            last_content_hash: Mutex::new(0),
            last_window_info: Arc::new(Mutex::new(String::new())),
            last_ocr_text: Arc::new(Mutex::new(String::new())),
            capture_count: Arc::new(AtomicU32::new(0)),
            thread_handle: Mutex::new(None),
            scene_buffer: Arc::new(Mutex::new(Vec::new())),
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
    pub memory_tier: String,
    pub importance: Option<i32>,
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
        .join(".goldfish")
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

    // Lock down file permissions to owner-only (600) on Unix systems.
    // The user's memory database contains OCR of everything on their screen —
    // other users on the same machine should not be able to read it.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for suffix in &["", "-wal", "-shm"] {
            let path = if suffix.is_empty() {
                db_path.clone()
            } else {
                PathBuf::from(format!("{}{}", db_path.display(), suffix))
            };
            if path.exists() {
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
        }
    }
    
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
    
    // Add columns if they don't exist (safe migration pattern)
    conn.execute("ALTER TABLE memories ADD COLUMN source TEXT DEFAULT 'manual'", []).ok();
    conn.execute("ALTER TABLE memories ADD COLUMN content_hash TEXT", []).ok();
    conn.execute("ALTER TABLE memories ADD COLUMN memory_type TEXT DEFAULT 'raw'", []).ok();
    conn.execute("ALTER TABLE memories ADD COLUMN memory_tier TEXT DEFAULT 'hot'", []).ok();
    conn.execute("ALTER TABLE memories ADD COLUMN importance INTEGER DEFAULT 3", []).ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(memory_tier)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source)",
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
        .prepare("SELECT id, content, tags, source_app, created_at, source, memory_tier, importance FROM memories ORDER BY created_at DESC LIMIT ?")
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
                memory_tier: row.get::<_, String>(6).unwrap_or_else(|_| "hot".to_string()),
                importance: row.get(7).ok(),
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
        .prepare("SELECT id, content, tags, source_app, created_at, source, memory_tier, importance FROM memories WHERE LOWER(content) LIKE ? OR LOWER(tags) LIKE ? ORDER BY created_at DESC LIMIT ?")
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
                memory_tier: row.get::<_, String>(6).unwrap_or_else(|_| "hot".to_string()),
                importance: row.get(7).ok(),
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
        memory_tier: "hot".to_string(),
        importance: None,
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
// Tiered Memory Commands
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn get_memories_by_tier(db: State<DbConnection>, tier: String, limit: Option<usize>) -> Result<Vec<Memory>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare("SELECT id, content, tags, source_app, created_at, source, memory_tier, importance FROM memories WHERE memory_tier = ? ORDER BY created_at DESC LIMIT ?")
        .map_err(|e| e.to_string())?;

    let memories = stmt
        .query_map(params![tier, limit], |row| {
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
                memory_tier: row.get::<_, String>(6).unwrap_or_else(|_| "hot".to_string()),
                importance: row.get(7).ok(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(memories)
}

#[tauri::command]
fn get_hot_memories_older_than(db: State<DbConnection>, hours: i64, limit: Option<usize>) -> Result<Vec<Memory>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(200);
    let cutoff = chrono::Local::now()
        .checked_sub_signed(chrono::Duration::hours(hours))
        .map(|t| t.to_rfc3339())
        .unwrap_or_default();

    let mut stmt = conn
        .prepare("SELECT id, content, tags, source_app, created_at, source, memory_tier, importance FROM memories WHERE memory_tier = 'hot' AND created_at < ? ORDER BY created_at ASC LIMIT ?")
        .map_err(|e| e.to_string())?;

    let memories = stmt
        .query_map(params![cutoff, limit], |row| {
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
                memory_tier: row.get::<_, String>(6).unwrap_or_else(|_| "hot".to_string()),
                importance: row.get(7).ok(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(memories)
}

#[tauri::command]
fn compact_memories(
    db: State<DbConnection>,
    ids_to_delete: Vec<String>,
    new_memory_content: String,
    new_memory_tags: Vec<String>,
    new_memory_tier: String,
    new_memory_source_app: Option<String>,
    new_memory_importance: Option<i32>,
) -> Result<Memory, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Use a transaction for atomicity
    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    // Delete old memories
    for id in &ids_to_delete {
        if let Err(e) = conn.execute("DELETE FROM memories WHERE id = ?", params![id]) {
            conn.execute("ROLLBACK", []).ok();
            return Err(format!("Failed to delete memory {}: {}", id, e));
        }
    }

    // Insert compacted memory
    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = serde_json::to_string(&new_memory_tags).unwrap_or_else(|_| "[]".to_string());
    let source_app_str = new_memory_source_app.clone().unwrap_or_else(|| "unknown".to_string());
    let embedding = build_term_vector(&new_memory_content);
    let content_hash = format!("{:x}", calculate_content_hash(&new_memory_content));
    let importance = new_memory_importance.unwrap_or(3);

    if let Err(e) = conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, memory_tier, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, new_memory_content, embedding, tags_json, source_app_str, "compacted", content_hash, new_memory_tier, importance, now, now],
    ) {
        conn.execute("ROLLBACK", []).ok();
        return Err(format!("Failed to insert compacted memory: {}", e));
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

    println!("[Goldfish] Compacted {} memories into 1 {} memory", ids_to_delete.len(), new_memory_tier);

    Ok(Memory {
        id,
        content: new_memory_content,
        tags: new_memory_tags,
        source: "compacted".to_string(),
        source_app: new_memory_source_app,
        timestamp: now,
        memory_tier: new_memory_tier,
        importance: Some(importance),
    })
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

    match Command::new("/usr/sbin/screencapture")
        .args(["-x", "-C", path.to_str().unwrap_or("/tmp/gf_capture.png")])
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
    capture_state.capture_count.fetch_add(1, Ordering::Relaxed);
    
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

    // Privacy blocklist: never capture from apps that show secrets on screen.
    // Password managers, banking apps, 2FA tools, etc. — even the app name in
    // a memory log is too much information.
    let app_name_lower = window.app_name.to_lowercase();
    const SENSITIVE_APPS: &[&str] = &[
        "1password",
        "bitwarden",
        "dashlane",
        "lastpass",
        "keychain access",
        "keepassxc",
        "nordpass",
        "enpass",
        "proton pass",
        "authy",
        "google authenticator",
        "duo mobile",
        "microsoft authenticator",
        "banking",
        "venmo",
        "zelle",
    ];
    if SENSITIVE_APPS.iter().any(|a| app_name_lower.contains(a)) {
        return CaptureResult {
            success: true,
            changed: false,
            summary: String::new(),
            saved_id: None,
            error: None,
        };
    }

    // Also skip captures where window title contains sensitive keywords
    let title_lower = window.window_title.to_lowercase();
    const SENSITIVE_TITLE_KEYWORDS: &[&str] = &[
        "password",
        "passphrase",
        "private key",
        "secret key",
        "api key",
        "credit card",
        "card number",
        "social security",
        "ssn",
        "2fa",
        "two-factor",
    ];
    if SENSITIVE_TITLE_KEYWORDS.iter().any(|kw| title_lower.contains(kw)) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// Two-tier capture: fast context polling + slow OCR on change
// ═══════════════════════════════════════════════════════════════════════════════

/// Save a context snapshot to the database (fast, no OCR)
fn save_context_snapshot(
    app_name: &str,
    window_title: &str,
    browser_url: Option<&str>,
    source: &str,
) {
    let summary = generate_smart_summary(app_name, window_title, browser_url);
    let content = if let Some(url) = browser_url {
        format!("[{}] {}\nURL: {}", app_name, window_title, url)
    } else {
        format!("[{}] {}", app_name, window_title)
    };

    let mut tags = vec![source.to_string()];
    let app_lower = app_name.to_lowercase();
    if app_lower.contains("code") || app_lower.contains("terminal") || app_lower.contains("xcode") {
        tags.push("coding".to_string());
    }
    if app_lower.contains("chrome") || app_lower.contains("safari") || app_lower.contains("firefox") || app_lower.contains("arc") {
        tags.push("browsing".to_string());
    }
    if app_lower.contains("slack") || app_lower.contains("discord") || app_lower.contains("messages") || app_lower.contains("zoom") {
        tags.push("communication".to_string());
    }

    let conn = match init_db() {
        Ok(c) => c,
        Err(e) => { eprintln!("[Goldfish] DB error: {}", e); return; }
    };

    let content_hash = calculate_content_hash(&content);
    let content_hash_str = format!("{:x}", content_hash);
    if is_duplicate_recent(&conn, &content_hash_str, 2) { return; }

    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let embedding = build_term_vector(&summary);

    let _ = conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, content, embedding, tags_json, app_name, source, content_hash_str, now, now],
    );
}

/// Process a screenshot with OCR and save. Runs on a worker thread.
fn ocr_worker(
    screenshot_path: PathBuf,
    app_name: String,
    window_title: String,
    last_ocr_text: Arc<Mutex<String>>,
    capture_count: Arc<AtomicU32>,
) {
    let ocr_text = capture::ocr_tesseract(&screenshot_path).unwrap_or_default();
    let _ = std::fs::remove_file(&screenshot_path);

    if ocr_text.len() < 20 { return; }

    // Dedup against last OCR
    let last_ocr = last_ocr_text.lock().unwrap().clone();
    let similarity = capture::text_similarity(&ocr_text, &last_ocr);
    if similarity > 0.85 && !last_ocr.is_empty() { return; }
    *last_ocr_text.lock().unwrap() = ocr_text.clone();

    let content = format!(
        "[{}] {}\n\n---\n{}",
        app_name,
        if window_title.is_empty() { "No title".to_string() } else { window_title.clone() },
        if ocr_text.len() > 10000 { format!("{}...", &ocr_text[..10000]) } else { ocr_text.clone() }
    );

    let mut tags = vec!["ocr-capture".to_string()];
    let app_lower = app_name.to_lowercase();
    if app_lower.contains("code") || app_lower.contains("terminal") || app_lower.contains("xcode") {
        tags.push("coding".to_string());
    }
    if app_lower.contains("chrome") || app_lower.contains("safari") || app_lower.contains("firefox") || app_lower.contains("arc") {
        tags.push("browsing".to_string());
    }

    let conn = match init_db() {
        Ok(c) => c,
        Err(e) => { eprintln!("[Goldfish] OCR worker DB error: {}", e); return; }
    };

    let content_hash = calculate_content_hash(&content);
    let content_hash_str = format!("{:x}", content_hash);
    if is_duplicate_recent(&conn, &content_hash_str, 5) { return; }

    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let embedding = build_term_vector(&content);

    let _ = conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, content, embedding, tags_json, app_name, "ocr-capture", content_hash_str, now, now],
    );

    capture_count.fetch_add(1, Ordering::Relaxed);
    capture::cleanup_old_screenshots();
}

/// Background capture loop — two concurrent pipelines:
///
/// PIPELINE 1 — Context tracker (every 500ms, ~15ms each):
///   AppleScript → app name, window title, browser URL
///   Saves instantly on any change. Never misses an app switch.
///
/// PIPELINE 2 — Screenshot queue + OCR consumer:
///   Producer: takes screenshots every 1s, pushes to queue
///   Consumer: pops from queue, runs OCR, saves to DB at its own pace
///   Screenshots pile up if OCR falls behind — that's fine, it catches up.
///   Old screenshots are cleaned up after processing.
fn capture_loop(
    is_active: Arc<AtomicBool>,
    last_ocr_text: Arc<Mutex<String>>,
    last_window_info: Arc<Mutex<String>>,
    capture_count: Arc<AtomicU32>,
    scene_buffer: Arc<Mutex<Vec<SceneSnapshot>>>,
    _interval_ms: u64,
) {
    use std::sync::mpsc;

    println!("[Goldfish] Capture loop started — context=500ms, screenshots=1s");

    // Channel for screenshot queue: producer (capture) → consumer (OCR)
    let (tx, rx) = mpsc::channel::<(PathBuf, String, String)>();

    // ── OCR CONSUMER THREAD ──
    // Runs at its own pace, never blocks the capture loop
    let ocr_active = Arc::clone(&is_active);
    let ocr_last_text = Arc::clone(&last_ocr_text);
    let ocr_count = Arc::clone(&capture_count);
    let ocr_scene_buffer = Arc::clone(&scene_buffer);

    let ocr_thread = std::thread::spawn(move || {
        println!("[Goldfish] OCR consumer started");
        while let Ok((screenshot_path, app_name, window_title)) = rx.recv() {
            if !ocr_active.load(Ordering::Relaxed) {
                // Drain remaining items and clean up files
                let _ = std::fs::remove_file(&screenshot_path);
                while let Ok((path, _, _)) = rx.try_recv() {
                    let _ = std::fs::remove_file(&path);
                }
                break;
            }

            let start = std::time::Instant::now();
            let ocr_text = capture::ocr_tesseract(&screenshot_path).unwrap_or_default();
            let _ = std::fs::remove_file(&screenshot_path);

            if ocr_text.len() < 20 { continue; }

            // Dedup against last OCR — low threshold to catch scrolling/new content
            let last = ocr_last_text.lock().unwrap().clone();
            let similarity = capture::text_similarity(&ocr_text, &last);
            if similarity > 0.6 && !last.is_empty() { continue; }
            *ocr_last_text.lock().unwrap() = ocr_text.clone();

            println!(
                "[Goldfish] OCR processed in {:?}: app={}, chars={}",
                start.elapsed(), app_name, ocr_text.len()
            );

            // If AppleScript didn't return app name, try to extract from first line of OCR
            let effective_app = if app_name.is_empty() || app_name == "Unknown" {
                ocr_text.lines().next().unwrap_or("Unknown").trim().to_string()
            } else {
                app_name.clone()
            };
            let effective_title = if window_title.is_empty() || window_title == "No title" {
                // Try second line of OCR for window title hint
                ocr_text.lines().nth(1).unwrap_or("").trim().to_string()
            } else {
                window_title.clone()
            };

            // Push to scene buffer for AI processing
            {
                let mut buffer = ocr_scene_buffer.lock().unwrap();
                // Extract browser URL from window_title if present
                let browser_url = window_title.lines()
                    .find(|l| l.starts_with("URL: "))
                    .map(|l| l.trim_start_matches("URL: ").to_string());
                buffer.push(SceneSnapshot {
                    app_name: effective_app.clone(),
                    window_title: effective_title.clone(),
                    ocr_text: if ocr_text.len() > 5000 { ocr_text[..5000].to_string() } else { ocr_text.clone() },
                    timestamp: Local::now().to_rfc3339(),
                    browser_url,
                });
                // Ring buffer: drop oldest when over max
                if buffer.len() > SCENE_BUFFER_MAX {
                    buffer.remove(0);
                }
                println!("[Goldfish] Scene buffer: {} snapshots", buffer.len());
            }

            // Build content and save
            let content = format!(
                "[{}] {}\n\n---\n{}",
                effective_app,
                if effective_title.is_empty() { "Screen Capture".to_string() } else { effective_title },
                if ocr_text.len() > 10000 { format!("{}...", &ocr_text[..10000]) } else { ocr_text.clone() }
            );

            let mut tags = vec!["ocr-capture".to_string()];
            let app_lower = effective_app.to_lowercase();
            if app_lower.contains("code") || app_lower.contains("terminal") || app_lower.contains("xcode") {
                tags.push("coding".to_string());
            }
            if app_lower.contains("chrome") || app_lower.contains("safari") || app_lower.contains("firefox") || app_lower.contains("arc") {
                tags.push("browsing".to_string());
            }
            if app_lower.contains("slack") || app_lower.contains("discord") || app_lower.contains("messages") || app_lower.contains("zoom") {
                tags.push("communication".to_string());
            }

            if let Ok(conn) = init_db() {
                let content_hash = calculate_content_hash(&content);
                let content_hash_str = format!("{:x}", content_hash);
                if !is_duplicate_recent(&conn, &content_hash_str, 5) {
                    let id = Uuid::new_v4().to_string();
                    let now = Local::now().to_rfc3339();
                    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
                    let embedding = build_term_vector(&content);
                    let _ = conn.execute(
                        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        params![id, content, embedding, tags_json, effective_app, "ocr-capture", content_hash_str, now, now],
                    );
                    ocr_count.fetch_add(1, Ordering::Relaxed);
                }
            }

            // Periodic cleanup
            capture::cleanup_old_screenshots();
        }
        println!("[Goldfish] OCR consumer stopped");
    });

    // ── MAIN LOOP: adaptive rate — fast when active, backs off when idle ──
    let mut last_context = String::new();
    let intervals_ms: [u64; 4] = [750, 2000, 5000, 10000];
    let mut interval_tier: usize = 0;
    let mut unchanged_ticks: u32 = 0;

    while is_active.load(Ordering::Relaxed) {
        let tick_start = std::time::Instant::now();
        let current_interval = std::time::Duration::from_millis(intervals_ms[interval_tier]);

        // Get context metadata (fast, ~15ms)
        let (app_name, window_title, browser_url) = capture::get_rich_context();

        // Skip system UI
        if app_name == "Unknown" || app_name == "loginwindow" || app_name == "ScreenSaverEngine" {
            std::thread::sleep(current_interval);
            continue;
        }

        // Detect context changes
        let current_context = format!(
            "{}|{}|{}",
            app_name, window_title, browser_url.as_deref().unwrap_or("")
        );
        if current_context != last_context && !last_context.is_empty() {
            println!(
                "[Goldfish] App switch: {} → {}",
                last_context.split('|').next().unwrap_or("?"), app_name
            );
            *last_window_info.lock().unwrap() = current_context.clone();
            // Snap back to fastest capture rate
            if interval_tier > 0 {
                interval_tier = 0;
                unchanged_ticks = 0;
                println!("[Goldfish] Context changed — snap back to {}ms", intervals_ms[0]);
            }
        } else {
            // Screen is static — progressive backoff
            unchanged_ticks += 1;
            if unchanged_ticks >= 3 && interval_tier < intervals_ms.len() - 1 {
                interval_tier += 1;
                unchanged_ticks = 0;
                println!("[Goldfish] Screen static — backoff to {}ms", intervals_ms[interval_tier]);
            }
        }
        last_context = current_context;

        // ── SCREENSHOT: capture and queue, never wait ──
        if let Ok(screenshot_path) = capture::take_screenshot() {
            let url_str = browser_url.unwrap_or_default();
            let enriched_title = if url_str.is_empty() {
                window_title.clone()
            } else {
                format!("{}\nURL: {}", window_title, url_str)
            };
            let _ = tx.send((screenshot_path, app_name.clone(), enriched_title));
            capture_count.fetch_add(1, Ordering::Relaxed);
        }

        // Sleep for remaining interval
        let elapsed = tick_start.elapsed();
        if elapsed < current_interval {
            std::thread::sleep(current_interval - elapsed);
        }
    }

    // Signal OCR consumer to stop by dropping the sender
    drop(tx);
    let _ = ocr_thread.join();

    println!("[Goldfish] Capture loop stopped");
}

/// Legacy command — still available for one-off captures from frontend
#[tauri::command]
fn rapid_capture_with_ocr(
    db: State<DbConnection>,
    capture_state: State<CaptureState>,
) -> CaptureResult {
    let screenshot_path = match capture::take_screenshot() {
        Ok(path) => path,
        Err(e) => {
            return CaptureResult {
                success: false, changed: false, summary: String::new(),
                saved_id: None, error: Some(format!("Screenshot failed: {}", e)),
            };
        }
    };

    let (app_name, window_title) = capture::get_active_window();
    let ocr_text = capture::ocr_tesseract(&screenshot_path).unwrap_or_default();
    let _ = std::fs::remove_file(&screenshot_path);

    if ocr_text.len() < 20 {
        return CaptureResult { success: true, changed: false, summary: String::new(), saved_id: None, error: None };
    }

    let last_ocr = capture_state.last_ocr_text.lock().unwrap().clone();
    let similarity = capture::text_similarity(&ocr_text, &last_ocr);
    if similarity > 0.8 && !last_ocr.is_empty() {
        return CaptureResult { success: true, changed: false, summary: String::new(), saved_id: None, error: None };
    }

    *capture_state.last_ocr_text.lock().unwrap() = ocr_text.clone();
    capture_state.capture_count.fetch_add(1, Ordering::Relaxed);

    let summary = generate_smart_summary(&app_name, &window_title, Some(&ocr_text));
    let content = format!("[{}] {}\n\n---\n{}", app_name,
        if window_title.is_empty() { "No title".to_string() } else { window_title.clone() },
        if ocr_text.len() > 10000 { format!("{}...", &ocr_text[..10000]) } else { ocr_text });

    let content_hash_str = format!("{:x}", calculate_content_hash(&content));
    let conn = db.0.lock().map_err(|e| e.to_string());
    let conn = match conn { Ok(c) => c, Err(_) => {
        return CaptureResult { success: false, changed: true, summary, saved_id: None, error: Some("DB lock error".into()) };
    }};

    if is_duplicate_recent(&conn, &content_hash_str, 5) {
        return CaptureResult { success: true, changed: false, summary, saved_id: None, error: None };
    }

    let id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();
    let tags_json = "[]".to_string();
    let embedding = build_term_vector(&content);
    let _ = conn.execute(
        "INSERT INTO memories (id, content, embedding, tags, source_app, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, content, embedding, tags_json, app_name, "ocr-capture", content_hash_str, now, now],
    );

    CaptureResult { success: true, changed: true, summary, saved_id: Some(id), error: None }
}

/// Check if screen recording permission is granted
#[tauri::command]
fn check_capture_permission() -> bool {
    capture::check_screen_permission()
}

/// Request screen recording permission.
/// CGRequestScreenCaptureAccess() registers the app with macOS and shows
/// a system dialog directing the user to System Settings.
#[tauri::command]
fn request_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        if capture::check_screen_permission() {
            return true;
        }
        // Register with macOS — this adds the app to Screen Recording in System Settings
        // and shows a native dialog on first call for this binary
        capture::request_screen_permission()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Check if tesseract OCR is installed
#[tauri::command]
fn check_tesseract_installed() -> bool {
    capture::check_tesseract_installed()
}

/// Start capture loop — used by both auto-start and frontend command
fn begin_capture(capture_state: &CaptureState) {
    if capture_state.is_active.load(Ordering::Relaxed) {
        return; // already running
    }

    // Check permission silently — never trigger OS dialog from auto-start.
    // The onboarding flow or Settings page handles the initial permission request.
    if !capture::check_screen_permission() {
        println!("[Goldfish] Screen recording permission not granted — capture not started. Grant in System Settings > Privacy > Screen Recording.");
        return;
    }

    capture_state.capture_count.store(0, Ordering::Relaxed);
    *capture_state.last_window_info.lock().unwrap() = String::new();
    *capture_state.last_ocr_text.lock().unwrap() = String::new();
    capture_state.scene_buffer.lock().unwrap().clear();
    capture_state.is_active.store(true, Ordering::Relaxed);

    let is_active = Arc::clone(&capture_state.is_active);
    let last_ocr = Arc::clone(&capture_state.last_ocr_text);
    let last_window = Arc::clone(&capture_state.last_window_info);
    let count = Arc::clone(&capture_state.capture_count);
    let scene_buf = Arc::clone(&capture_state.scene_buffer);

    let handle = std::thread::spawn(move || {
        capture_loop(is_active, last_ocr, last_window, count, scene_buf, 2000);
    });

    *capture_state.thread_handle.lock().unwrap() = Some(handle);
    println!("[Goldfish] Capture auto-started");
}

/// Stop capture loop
fn end_capture(capture_state: &CaptureState) {
    capture_state.is_active.store(false, Ordering::Relaxed);
    if let Some(handle) = capture_state.thread_handle.lock().unwrap().take() {
        let _ = handle.join();
    }
    println!("[Goldfish] Capture stopped");
}

#[tauri::command]
fn start_capture(capture_state: State<CaptureState>) -> CaptureStatus {
    begin_capture(&capture_state);
    CaptureStatus {
        is_active: true,
        capture_count: capture_state.capture_count.load(Ordering::Relaxed),
    }
}

#[tauri::command]
fn stop_capture(capture_state: State<CaptureState>) -> CaptureStatus {
    let count = capture_state.capture_count.load(Ordering::Relaxed);
    end_capture(&capture_state);
    CaptureStatus {
        is_active: false,
        capture_count: count,
    }
}

#[tauri::command]
fn get_capture_status(capture_state: State<CaptureState>) -> CaptureStatus {
    CaptureStatus {
        is_active: capture_state.is_active.load(Ordering::Relaxed),
        capture_count: capture_state.capture_count.load(Ordering::Relaxed),
    }
}

/// Drain the scene buffer — returns all buffered snapshots and clears it
#[tauri::command]
fn get_scene_buffer(capture_state: State<CaptureState>) -> Vec<SceneSnapshot> {
    let mut buffer = capture_state.scene_buffer.lock().unwrap();
    let snapshots = buffer.drain(..).collect();
    snapshots
}

/// Get the current scene buffer count (for UI display)
#[tauri::command]
fn get_scene_buffer_count(capture_state: State<CaptureState>) -> usize {
    capture_state.scene_buffer.lock().unwrap().len()
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen Recording Commands
// ═══════════════════════════════════════════════════════════════════════════════

fn get_recordings_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".goldfish")
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
    match Command::new("/usr/sbin/screencapture")
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
// AI Tool Connection — auto-configure MCP in Claude Desktop, Claude Code, Cursor
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Clone)]
struct AiToolStatus {
    id: String,
    name: String,
    installed: bool,
    connected: bool,
    config_path: String,
}

/// Find the full path to npx — needed because GUI apps (Claude Desktop) launch
/// with a restricted PATH that excludes NVM/Homebrew, so plain "npx" won't resolve.
fn find_npx_path() -> String {
    // Check common install locations first (fastest)
    let candidates = [
        "/opt/homebrew/bin/npx",  // Apple Silicon Homebrew
        "/usr/local/bin/npx",     // Intel Homebrew / global npm
        "/usr/bin/npx",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    // Fall back to `which npx` (works if user is on a non-standard path)
    if let Ok(output) = std::process::Command::new("which").arg("npx").output() {
        if output.status.success() {
            let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !resolved.is_empty() {
                return resolved;
            }
        }
    }
    // Last resort — just "npx" and hope the PATH is set
    "npx".to_string()
}

/// Returns the MCP server entry that gets written to each tool's config
fn mcp_server_entry() -> serde_json::Value {
    let npx = find_npx_path();
    serde_json::json!({
        "command": npx,
        "args": ["-y", "goldfish-mcp"]
    })
}

/// All supported AI tools and their config file locations
fn get_tool_configs() -> Vec<(String, String, PathBuf)> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![
        (
            "claude-desktop".to_string(),
            "Claude Desktop".to_string(),
            home.join("Library/Application Support/Claude/claude_desktop_config.json"),
        ),
        (
            "claude-code".to_string(),
            "Claude Code".to_string(),
            home.join(".claude/mcp.json"),
        ),
        (
            "cursor".to_string(),
            "Cursor".to_string(),
            home.join(".cursor/mcp.json"),
        ),
        (
            "windsurf".to_string(),
            "Windsurf".to_string(),
            home.join(".codeium/windsurf/mcp_config.json"),
        ),
    ]
}

#[tauri::command]
fn detect_ai_tools() -> Result<Vec<AiToolStatus>, String> {
    let tools = get_tool_configs();
    let mut statuses = Vec::new();

    for (id, name, config_path) in tools {
        // Check if installed: the config file exists OR the parent directory exists
        let parent_exists = config_path.parent().map(|p| p.exists()).unwrap_or(false);
        let config_exists = config_path.exists();
        let installed = parent_exists;

        // Check if goldfish is already connected
        let connected = if config_exists {
            match std::fs::read_to_string(&config_path) {
                Ok(content) => {
                    match serde_json::from_str::<serde_json::Value>(&content) {
                        Ok(json) => json.get("mcpServers")
                            .and_then(|s| s.get("goldfish"))
                            .is_some(),
                        Err(_) => false,
                    }
                }
                Err(_) => false,
            }
        } else {
            false
        };

        statuses.push(AiToolStatus {
            id,
            name,
            installed,
            connected,
            config_path: config_path.to_string_lossy().to_string(),
        });
    }

    Ok(statuses)
}

#[tauri::command]
fn connect_ai_tool(tool_id: String) -> Result<(), String> {
    let tools = get_tool_configs();
    let tool = tools.iter().find(|(id, _, _)| id == &tool_id)
        .ok_or_else(|| format!("Unknown tool: {}", tool_id))?;

    let config_path = &tool.2;

    // Read existing config or create empty one
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        // Create the parent directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        serde_json::json!({})
    };

    // Ensure mcpServers object exists
    if config.get("mcpServers").is_none() {
        config["mcpServers"] = serde_json::json!({});
    }

    // Add goldfish entry
    config["mcpServers"]["goldfish"] = mcp_server_entry();

    // Write back with pretty formatting
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

#[tauri::command]
fn disconnect_ai_tool(tool_id: String) -> Result<(), String> {
    let tools = get_tool_configs();
    let tool = tools.iter().find(|(id, _, _)| id == &tool_id)
        .ok_or_else(|| format!("Unknown tool: {}", tool_id))?;

    let config_path = &tool.2;

    if !config_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    // Remove goldfish entry
    if let Some(servers) = config.get_mut("mcpServers") {
        if let Some(obj) = servers.as_object_mut() {
            obj.remove("goldfish");
        }
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// Goldfish Overlay Commands
// ═══════════════════════════════════════════════════════════════════════════════

/// Get global cursor position on screen (for fish curiosity tracking)
#[tauri::command]
fn get_cursor_position() -> (f64, f64) {
    #[cfg(target_os = "macos")]
    {
        #[repr(C)]
        #[derive(Copy, Clone)]
        struct CGPoint { x: f64, y: f64 }

        extern "C" {
            fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
            fn CGEventGetLocation(event: *const std::ffi::c_void) -> CGPoint;
            fn CFRelease(cf: *mut std::ffi::c_void);
        }

        unsafe {
            let event = CGEventCreate(std::ptr::null());
            if event.is_null() {
                return (0.0, 0.0);
            }
            let point = CGEventGetLocation(event);
            CFRelease(event);
            (point.x, point.y)
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        (0.0, 0.0)
    }
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    // Hide the goldfish overlay
    if let Some(overlay) = app.get_webview_window("goldfish") {
        let _ = overlay.hide();
    }
}

#[tauri::command]
fn hide_goldfish_overlay(app: tauri::AppHandle) {
    if let Some(overlay) = app.get_webview_window("goldfish") {
        let _ = overlay.hide();
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    // Stop capture before exiting
    let cs = app.state::<CaptureState>();
    end_capture(&cs);
    app.exit(0);
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

            let show = MenuItem::with_id(app, "show", "Show Goldfish", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &quit])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Goldfish — Your AI finally has a memory")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        let cs = app.state::<CaptureState>();
                        end_capture(&cs);
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        // Hide goldfish overlay when main window is shown
                        if let Some(overlay) = app.get_webview_window("goldfish") {
                            let _ = overlay.hide();
                        }
                    }
                    "pause" => {
                        let cs = app.state::<CaptureState>();
                        if cs.is_active.load(Ordering::Relaxed) {
                            end_capture(&cs);
                            // Update menu item text
                            if let Some(menu) = app.menu() {
                                if let Some(item) = menu.get("pause") {
                                    if let Some(mi) = item.as_menuitem() {
                                        let _ = mi.set_text("Resume");
                                    }
                                }
                            }
                        } else {
                            begin_capture(&cs);
                            if let Some(menu) = app.menu() {
                                if let Some(item) = menu.get("pause") {
                                    if let Some(mi) = item.as_menuitem() {
                                        let _ = mi.set_text("Pause");
                                    }
                                }
                            }
                        }
                        // Emit event to keep frontend in sync
                        let _ = app.emit("capture-state-changed", serde_json::json!({
                            "is_active": cs.is_active.load(Ordering::Relaxed)
                        }));
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click on tray icon shows the window
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        // Hide goldfish overlay when main window returns
                        if let Some(overlay) = tray.app_handle().get_webview_window("goldfish") {
                            let _ = overlay.hide();
                        }
                    }
                })
                .build(app)?;

            // Position goldfish overlay at top-right of screen
            if let Some(overlay) = app.get_webview_window("goldfish") {
                if let Some(monitor) = overlay.primary_monitor().ok().flatten() {
                    let screen = monitor.size();
                    let scale = monitor.scale_factor();
                    let logical_w = screen.width as f64 / scale;
                    let _ = overlay.set_position(tauri::PhysicalPosition::new(
                        ((logical_w - 160.0) * scale) as i32,
                        (30.0 * scale) as i32,
                    ));
                }
            }

            // Auto-start capture on launch
            let cs = app.state::<CaptureState>();
            begin_capture(&cs);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // AI Tool Connections
            detect_ai_tools,
            connect_ai_tool,
            disconnect_ai_tool,
            // Database
            get_all_memories,
            search_memories,
            get_memory_stats,
            save_memory,
            delete_memory,
            delete_all_memories,
            // Tiered Memory
            get_memories_by_tier,
            get_hot_memories_older_than,
            compact_memories,
            // Capture
            get_active_window,
            get_clipboard,
            capture_screenshot,
            // Smart Capture
            smart_capture,
            rapid_capture_with_ocr,
            check_capture_permission,
            request_capture_permission,
            check_tesseract_installed,
            start_capture,
            stop_capture,
            get_capture_status,
            get_scene_buffer,
            get_scene_buffer_count,
            // Screen Recording
            start_recording,
            stop_recording,
            get_recording_status,
            list_recordings,
            // Goldfish Overlay
            get_cursor_position,
            show_main_window,
            hide_goldfish_overlay,
            quit_app,
        ])
        // Hide to tray on window close — show the goldfish overlay instead
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    // Show the goldfish swimming on screen
                    if let Some(overlay) = window.app_handle().get_webview_window("goldfish") {
                        let _ = overlay.show();
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: clicking dock icon when window is hidden re-shows it
            if let RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    // Hide goldfish overlay when main window returns
                    if let Some(overlay) = app.get_webview_window("goldfish") {
                        let _ = overlay.hide();
                    }
                }
            }
        });
}
