#!/usr/bin/env bash
# Goldfish installer — one-line macOS install
# Usage: curl -fsSL https://nadreau.github.io/goldfish/install.sh | bash
set -e

CYAN='\033[0;36m'
AMBER='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${AMBER}${BOLD}🐟 Installing Goldfish${NC}"
echo ""

# macOS check
if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}Goldfish is macOS-only for now. Sorry!${NC}"
  exit 1
fi

# Architecture check
ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" && "$ARCH" != "x86_64" ]]; then
  echo -e "${RED}Unsupported architecture: $ARCH${NC}"
  exit 1
fi

# Fetch latest release DMG URL from GitHub API
echo -e "${CYAN}→ Finding latest release…${NC}"
DMG_URL="$(curl -fsSL https://api.github.com/repos/Nadreau/goldfish/releases/latest \
  | grep browser_download_url \
  | grep '\.dmg"' \
  | head -1 \
  | cut -d '"' -f 4)"

if [[ -z "$DMG_URL" ]]; then
  echo -e "${RED}Could not locate a release DMG. Please download manually:${NC}"
  echo "https://github.com/Nadreau/goldfish/releases/latest"
  exit 1
fi

TMPDIR="$(mktemp -d)"
DMG_PATH="$TMPDIR/Goldfish.dmg"
echo -e "${CYAN}→ Downloading: $(basename "$DMG_URL")${NC}"
curl -fL --progress-bar -o "$DMG_PATH" "$DMG_URL"

echo -e "${CYAN}→ Mounting…${NC}"
MOUNT_POINT="$(hdiutil attach -nobrowse -quiet "$DMG_PATH" | tail -1 | awk '{ for (i=3; i<=NF; i++) printf "%s%s", $i, (i<NF ? " " : ""); print "" }')"

if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT" ]]; then
  echo -e "${RED}Failed to mount DMG${NC}"
  exit 1
fi

echo -e "${CYAN}→ Copying Goldfish.app to /Applications…${NC}"
# Remove any prior install quietly
if [[ -d "/Applications/Goldfish.app" ]]; then
  rm -rf "/Applications/Goldfish.app"
fi
cp -R "$MOUNT_POINT/Goldfish.app" "/Applications/"

echo -e "${CYAN}→ Ejecting DMG…${NC}"
hdiutil detach -quiet "$MOUNT_POINT" || true

echo -e "${CYAN}→ Clearing quarantine attribute (macOS first-launch unblock)…${NC}"
xattr -cr "/Applications/Goldfish.app" 2>/dev/null || true

# Clean up
rm -rf "$TMPDIR"

echo ""
echo -e "${GREEN}${BOLD}✓ Goldfish installed!${NC}"
echo ""
echo -e "  ${BOLD}Open it:${NC} open /Applications/Goldfish.app"
echo -e "  ${BOLD}Or:${NC}    Launchpad → Goldfish"
echo ""
echo -e "  The onboarding will connect your AI tools (Claude, Cursor, etc.)"
echo -e "  automatically. 🐟"
echo ""
