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

/// Check if screen recording permission is granted
pub fn check_screen_permission() -> bool {
    // Try to take a test screenshot - if it fails, likely no permission
    let temp_path = std::env::temp_dir().join("contextbridge_permission_test.png");
    let output = Command::new("screencapture")
        .args(["-x", "-C", &temp_path.to_string_lossy()])
        .output();
    
    // Clean up test file
    let _ = fs::remove_file(&temp_path);
    
    match output {
        Ok(result) => result.status.success(),
        Err(_) => false,
    }
}

/// Check if tesseract is installed
pub fn check_tesseract_installed() -> bool {
    Command::new("tesseract")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Take a screenshot and return the path
pub fn take_screenshot() -> Result<PathBuf, String> {
    let timestamp = Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
    let temp_dir = std::env::temp_dir().join("contextbridge");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    
    let path = temp_dir.join(format!("screen_{}.png", timestamp));
    let path_str = path.to_string_lossy().to_string();
    
    // -x = no sound, -C = capture cursor
    let output = Command::new("screencapture")
        .args(["-x", "-C", &path_str])
        .output()
        .map_err(|e| format!("Screenshot failed: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Screenshot failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(path)
}

/// OCR a screenshot using tesseract
pub fn ocr_tesseract(image_path: &PathBuf) -> Result<String, String> {
    let output = Command::new("tesseract")
        .args([
            image_path.to_string_lossy().as_ref(),
            "stdout",
            "-l", "eng",
            "--psm", "3", // Fully automatic page segmentation
        ])
        .output()
        .map_err(|e| format!("Tesseract failed: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Tesseract error: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// OCR using macOS Vision framework via swift command (reserved for future use)
#[allow(dead_code)]
pub fn ocr_vision(image_path: &PathBuf) -> Result<String, String> {
    // Try Vision via swift first, fall back to tesseract
    let swift_code = format!(r#"
import Cocoa
import Vision

let imagePath = "{}"
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {{
    print("Error: Cannot load image")
    exit(1)
}}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

if let results = request.results {{
    for observation in results {{
        if let candidate = observation.topCandidates(1).first {{
            print(candidate.string)
        }}
    }}
}}
"#, image_path.to_string_lossy());
    
    // Write swift code to temp file and execute
    let swift_file = std::env::temp_dir().join("ocr_vision.swift");
    if std::fs::write(&swift_file, &swift_code).is_err() {
        return ocr_tesseract(image_path);
    }
    
    let output = Command::new("swift")
        .arg(&swift_file)
        .output();
    
    // Clean up swift file
    let _ = std::fs::remove_file(&swift_file);
    
    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if text.is_empty() {
                ocr_tesseract(image_path)
            } else {
                Ok(text)
            }
        }
        _ => ocr_tesseract(image_path)
    }
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

/// Clean up old screenshots to save disk space
pub fn cleanup_old_screenshots() {
    let temp_dir = std::env::temp_dir().join("contextbridge");
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
