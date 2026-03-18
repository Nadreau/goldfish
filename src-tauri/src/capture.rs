// capture.rs — Rapid screen capture with OCR
// 
// Pipeline:
// 1. Screenshot every ~1 second
// 2. OCR via tesseract or Vision.framework
// 3. Detect meaningful changes
// 4. Store to memory with full context

use std::process::Command;
use std::path::PathBuf;
use std::fs;
use chrono::Local;

/// Check if screen recording permission is granted (without triggering a prompt)
pub fn check_screen_permission() -> bool {
    // Use macOS CoreGraphics API to check permission silently
    // CGPreflightScreenCaptureAccess returns true if already granted, false otherwise
    // It does NOT show a dialog — that's the key difference from CGRequestScreenCaptureAccess
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true // assume granted on non-macOS
    }
}

/// Request screen recording permission (shows the OS dialog once)
pub fn request_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn CGRequestScreenCaptureAccess() -> bool;
        }
        unsafe { CGRequestScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Check if tesseract is installed
pub fn check_tesseract_installed() -> bool {
    // Try common paths since GUI apps don't inherit shell PATH
    let tesseract_paths = [
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "tesseract",
    ];
    
    for path in tesseract_paths {
        if Command::new(path)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

/// Take a screenshot and return the path
pub fn take_screenshot() -> Result<PathBuf, String> {
    let timestamp = Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
    let temp_dir = std::env::temp_dir().join("goldfish");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    
    let path = temp_dir.join(format!("screen_{}.png", timestamp));
    let path_str = path.to_string_lossy().to_string();
    
    // -x = no sound, -C = capture cursor
    let output = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-C", &path_str])
        .output()
        .map_err(|e| format!("Screenshot failed: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Screenshot failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(path)
}

/// Find tesseract binary path
fn find_tesseract() -> &'static str {
    // Check common paths since GUI apps don't inherit shell PATH
    let paths = [
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
    ];
    
    for path in paths {
        if std::path::Path::new(path).exists() {
            return path;
        }
    }
    "tesseract" // fallback
}

/// OCR a screenshot — tries Vision.framework (via Python helper) first, falls back to Tesseract
pub fn ocr_tesseract(image_path: &PathBuf) -> Result<String, String> {
    // Try Vision.framework first — much better on macOS retina displays
    if let Ok(text) = ocr_with_vision(image_path) {
        if !text.is_empty() {
            return Ok(text);
        }
    }

    // Fallback to Tesseract
    let output = Command::new(find_tesseract())
        .args([
            image_path.to_string_lossy().as_ref(),
            "stdout",
            "-l", "eng",
            "--psm", "3",
        ])
        .output()
        .map_err(|e| format!("Tesseract failed: {}", e))?;

    if !output.status.success() {
        return Err(format!("Tesseract error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// OCR using macOS Vision.framework via Python helper (GPU-accelerated, much better for retina)
fn ocr_with_vision(image_path: &PathBuf) -> Result<String, String> {
    // Find the Python Vision helper relative to the executable
    let helper_paths = [
        // Development: relative to src-tauri/target/debug/
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("../../helpers/ocr-vision.py").canonicalize().ok()))
            .flatten(),
        // Also try from the src-tauri directory directly
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("../../../src-tauri/helpers/ocr-vision.py").canonicalize().ok()))
            .flatten(),
        // Absolute fallback for development
        Some(PathBuf::from("/Users/nikonadreau/Desktop/contextbridge/src-tauri/helpers/ocr-vision.py")),
    ];

    for maybe_path in &helper_paths {
        if let Some(helper) = maybe_path {
            if helper.exists() {
                let output = Command::new("python3")
                    .arg(helper.to_string_lossy().as_ref())
                    .arg(image_path.to_string_lossy().as_ref())
                    .output()
                    .map_err(|e| format!("Vision OCR failed: {}", e))?;

                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !text.is_empty() {
                        return Ok(text);
                    }
                }
            }
        }
    }

    Err("Vision helper not found".to_string())
}

/// OCR using macOS Vision framework via pre-compiled helper binary
/// Falls back to tesseract if Vision helper not available
pub fn ocr_vision(image_path: &PathBuf) -> Result<String, String> {
    // Look for the pre-compiled Vision OCR helper
    let possible_paths = [
        // Development: in the helpers folder
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("../helpers/ocr-vision")))
            .unwrap_or_default(),
        // Production: bundled with app
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("ocr-vision")))
            .unwrap_or_default(),
        // Fallback: in Resources
        PathBuf::from("/Applications/Goldfish.app/Contents/MacOS/ocr-vision"),
    ];
    
    for helper_path in &possible_paths {
        if helper_path.exists() {
            let output = Command::new(helper_path)
                .arg(image_path.to_string_lossy().as_ref())
                .output();
            
            match output {
                Ok(out) if out.status.success() => {
                    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !text.is_empty() {
                        return Ok(text);
                    }
                }
                _ => continue,
            }
        }
    }
    
    // Fallback to tesseract
    ocr_tesseract(image_path)
}

/// Fast OCR - tries Vision first (GPU accelerated), falls back to tesseract
pub fn ocr_fast(image_path: &PathBuf) -> Result<String, String> {
    // Vision is typically 5-10x faster on Apple Silicon
    ocr_vision(image_path)
}

/// Get active window info
pub fn get_active_window() -> (String, String) {
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
            (
                parts.first().unwrap_or(&"Unknown").to_string(),
                parts.get(1).unwrap_or(&"").to_string(),
            )
        }
        Err(_) => ("Unknown".to_string(), "".to_string()),
    }
}

/// Fast context snapshot — grabs app, window title, and browser URL in one call (~15ms)
/// This is the fast layer: no screenshots, no OCR, just metadata.
pub fn get_rich_context() -> (String, String, Option<String>) {
    let script = r#"
        set frontApp to ""
        set frontWindow to ""
        set browserURL to ""

        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            try
                tell application process frontApp
                    set frontWindow to name of front window
                end tell
            end try
        end tell

        -- Get browser URL if applicable
        if frontApp is "Google Chrome" then
            try
                tell application "Google Chrome"
                    set browserURL to URL of active tab of front window
                end tell
            end try
        else if frontApp is "Safari" then
            try
                tell application "Safari"
                    set browserURL to URL of front document
                end tell
            end try
        else if frontApp is "Arc" then
            try
                tell application "Arc"
                    set browserURL to URL of active tab of front window
                end tell
            end try
        else if frontApp is "Firefox" then
            -- Firefox doesn't support AppleScript URL, use window title
            set browserURL to ""
        end if

        return frontApp & "|||" & frontWindow & "|||" & browserURL
    "#;

    match Command::new("osascript").arg("-e").arg(script).output() {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let parts: Vec<&str> = result.splitn(3, "|||").collect();
            let app = parts.first().unwrap_or(&"Unknown").to_string();
            let title = parts.get(1).unwrap_or(&"").to_string();
            let url = parts.get(2).map(|u| u.to_string()).filter(|u| !u.is_empty());
            (app, title, url)
        }
        Err(_) => ("Unknown".to_string(), "".to_string(), None),
    }
}

/// Clean up old screenshots to save disk space
pub fn cleanup_old_screenshots() {
    let temp_dir = std::env::temp_dir().join("goldfish");
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        let now = std::time::SystemTime::now();
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    // Delete files older than 5 minutes
                    if now.duration_since(modified).unwrap_or_default().as_secs() > 300 {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

/// Calculate similarity between two strings (for deduplication)
pub fn text_similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    
    let a_words: std::collections::HashSet<&str> = a.split_whitespace().collect();
    let b_words: std::collections::HashSet<&str> = b.split_whitespace().collect();
    
    let intersection = a_words.intersection(&b_words).count();
    let union = a_words.union(&b_words).count();
    
    if union == 0 {
        return 0.0;
    }
    
    intersection as f64 / union as f64
}
