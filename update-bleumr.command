#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║              BLEUMR UPDATER — macOS                         ║
# ║  Double-click this file to check for updates & install.     ║
# ╚══════════════════════════════════════════════════════════════╝
#
# What it does:
#   1. Detects your Mac architecture (Apple Silicon vs Intel)
#   2. Reads current installed version from Bleumr.app
#   3. Checks server for latest version
#   4. Downloads new DMG if update available
#   5. Mounts DMG, copies new app to /Applications, cleans up
#
# Safe to run anytime — does nothing if already up to date.

set -e

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Config ──────────────────────────────────────────────────────
UPDATE_API="https://aybwlypsrmnfogtnibho.supabase.co/functions/v1/check-update"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8"
APP_NAME="Bleumr"
APP_PATH="/Applications/${APP_NAME}.app"
DOWNLOAD_DIR="$HOME/Downloads"

clear
echo ""
echo -e "${PURPLE}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}  ║${WHITE}       BLEUMR UPDATER — macOS             ${PURPLE}║${NC}"
echo -e "${PURPLE}  ╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Detect architecture ─────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  PLATFORM="mac_arm64"
  ARCH_LABEL="Apple Silicon"
else
  PLATFORM="mac_x64"
  ARCH_LABEL="Intel"
fi
echo -e "  ${DIM}Platform:${NC} macOS ${ARCH_LABEL} (${ARCH})"

# ── Step 2: Get current installed version ────────────────────────
CURRENT_VERSION="0.0.0"
if [ -d "$APP_PATH" ]; then
  PLIST="$APP_PATH/Contents/Info.plist"
  if [ -f "$PLIST" ]; then
    CURRENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$PLIST" 2>/dev/null || echo "0.0.0")
  fi
  echo -e "  ${DIM}Installed:${NC} v${CURRENT_VERSION}"
else
  echo -e "  ${DIM}Installed:${NC} ${YELLOW}Not found${NC} (fresh install)"
fi

# ── Step 3: Check server for latest version ──────────────────────
echo ""
echo -e "  ${CYAN}Checking for updates...${NC}"
echo ""

RESPONSE=$(curl -s -f \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  "${UPDATE_API}?platform=${PLATFORM}&current=${CURRENT_VERSION}" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$RESPONSE" ]; then
  echo -e "  ${RED}Could not reach update server.${NC}"
  echo -e "  ${DIM}Check your internet connection and try again.${NC}"
  echo ""
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 1
fi

# Parse JSON response (using python for reliability — ships with macOS)
LATEST_VERSION=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version',''))" 2>/dev/null)
NEEDS_UPDATE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('needs_update',False)).lower())" 2>/dev/null)
DOWNLOAD_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('download_url',''))" 2>/dev/null)
RELEASE_NOTES=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('release_notes','')[:500])" 2>/dev/null)

if [ -z "$LATEST_VERSION" ]; then
  echo -e "  ${RED}Could not parse server response.${NC}"
  echo ""
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 1
fi

echo -e "  ${DIM}Latest version:${NC} v${LATEST_VERSION}"
echo -e "  ${DIM}Your version:${NC}   v${CURRENT_VERSION}"
echo ""

# ── Step 4: Check if update needed ───────────────────────────────
if [ "$NEEDS_UPDATE" != "true" ]; then
  echo -e "  ${GREEN}You're up to date!${NC} No update needed."
  echo ""
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 0
fi

# Show release notes
if [ -n "$RELEASE_NOTES" ]; then
  echo -e "  ${WHITE}What's new in v${LATEST_VERSION}:${NC}"
  echo -e "  ${DIM}$(echo "$RELEASE_NOTES" | head -10 | sed 's/^/  /')${NC}"
  echo ""
fi

# ── Step 5: Confirm download ─────────────────────────────────────
if [ -z "$DOWNLOAD_URL" ]; then
  echo -e "  ${RED}No download URL available for your platform.${NC}"
  echo -e "  ${DIM}Visit https://bleumr.app to download manually.${NC}"
  echo ""
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 1
fi

echo -e "  ${YELLOW}Update available: v${CURRENT_VERSION} → v${LATEST_VERSION}${NC}"
echo ""
echo -ne "  ${WHITE}Download and install? [Y/n]:${NC} "
read -r CONFIRM
CONFIRM=${CONFIRM:-Y}

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo ""
  echo -e "  ${DIM}Update skipped.${NC}"
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 0
fi

# ── Step 6: Download DMG ─────────────────────────────────────────
DMG_FILE="${DOWNLOAD_DIR}/${APP_NAME}-${LATEST_VERSION}-${ARCH}.dmg"
echo ""
echo -e "  ${CYAN}Downloading Bleumr v${LATEST_VERSION}...${NC}"
echo -e "  ${DIM}${DOWNLOAD_URL}${NC}"
echo ""

curl -L --progress-bar -o "$DMG_FILE" "$DOWNLOAD_URL"

if [ ! -f "$DMG_FILE" ] || [ ! -s "$DMG_FILE" ]; then
  echo -e "  ${RED}Download failed.${NC}"
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 1
fi

echo ""
echo -e "  ${GREEN}Download complete!${NC} ($(du -h "$DMG_FILE" | cut -f1))"

# ── Step 7: Close Bleumr if running ──────────────────────────────
if pgrep -x "$APP_NAME" > /dev/null 2>&1; then
  echo ""
  echo -e "  ${YELLOW}Closing Bleumr...${NC}"
  osascript -e "tell application \"${APP_NAME}\" to quit" 2>/dev/null || true
  sleep 2
  # Force kill if still running
  pkill -x "$APP_NAME" 2>/dev/null || true
  sleep 1
fi

# ── Step 8: Mount DMG and install ────────────────────────────────
echo -e "  ${CYAN}Installing...${NC}"

# Mount the DMG
MOUNT_POINT=$(hdiutil attach "$DMG_FILE" -nobrowse -noverify -noautoopen 2>/dev/null | grep "/Volumes" | awk -F'\t' '{print $NF}')

if [ -z "$MOUNT_POINT" ]; then
  echo -e "  ${RED}Failed to mount DMG.${NC}"
  echo -e "  ${DIM}You can install manually: open ${DMG_FILE}${NC}"
  echo ""
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 1
fi

# Find the .app inside the mounted DMG
NEW_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)

if [ -z "$NEW_APP" ]; then
  echo -e "  ${RED}Could not find app in DMG.${NC}"
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  echo -e "  ${DIM}Press any key to exit...${NC}"
  read -n 1 -s
  exit 1
fi

# Remove old app and copy new one
if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
fi

cp -R "$NEW_APP" /Applications/

# Remove quarantine attribute so macOS doesn't block it
xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null || true

# Unmount DMG
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true

# Clean up downloaded DMG
rm -f "$DMG_FILE"

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║  Update complete! Bleumr v${LATEST_VERSION} installed  ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 9: Launch the app ───────────────────────────────────────
echo -ne "  ${WHITE}Launch Bleumr now? [Y/n]:${NC} "
read -r LAUNCH
LAUNCH=${LAUNCH:-Y}

if [[ "$LAUNCH" =~ ^[Yy]$ ]]; then
  echo -e "  ${CYAN}Launching Bleumr...${NC}"
  open "$APP_PATH"
fi

echo ""
echo -e "  ${DIM}Done. You can close this window.${NC}"
echo ""
