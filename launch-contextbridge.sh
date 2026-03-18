#!/bin/bash
# ContextBridge Launcher — Always runs the latest version
# Updates HEARTBEAT.md path if needed

APP_DIR="/Users/nikonadreau/Desktop/contextbridge"
APP_BUNDLE="$APP_DIR/src-tauri/target/release/bundle/macos/ContextBridge.app"

cd "$APP_DIR"

# Check if we need to rebuild (source changed since last build)
NEEDS_BUILD=false
if [ ! -d "$APP_BUNDLE" ]; then
    NEEDS_BUILD=true
elif [ "$(find src src-tauri/src -newer "$APP_BUNDLE" 2>/dev/null | head -1)" ]; then
    NEEDS_BUILD=true
fi

if [ "$NEEDS_BUILD" = true ]; then
    echo "🔨 Building latest ContextBridge..."
    npm run tauri build 2>&1 | tail -5
    echo "✅ Build complete!"
fi

# Open the app
open "$APP_BUNDLE"
