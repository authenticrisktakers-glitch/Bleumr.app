#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║              BLEUMR INSTALLER — macOS                        ║
# ║  Double-click this file to install Bleumr and clear the      ║
# ║  "damaged / unidentified developer" Gatekeeper block.        ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Why this exists:
#   Bleumr is not yet signed with an Apple Developer ID, so macOS
#   quarantines it and refuses to open it ("Bleumr is damaged" or
#   "unidentified developer"). This script copies the app into
#   /Applications and removes the quarantine flag so it opens
#   normally. It does NOT need the internet.
#
# Safe to run multiple times.

# Best-effort throughout — never abort on a single non-fatal step.
set +e

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m'

APP_NAME="Bleumr"
APP_DEST="/Applications/${APP_NAME}.app"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pause_exit() {
  echo ""
  echo -e "  ${DIM}Press any key to close this window...${NC}"
  read -n 1 -s
  exit "${1:-0}"
}

clear
echo ""
echo -e "${PURPLE}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}  ║${WHITE}        BLEUMR INSTALLER — macOS          ${PURPLE}║${NC}"
echo -e "${PURPLE}  ╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Locate Bleumr — already-installed app, a .app, or a .dmg ──
MOUNT_POINT=""
SOURCE_APP=""

# 1a. A Bleumr.app sitting next to this script, on the Desktop, or in Downloads
for d in "$SCRIPT_DIR" "$HOME/Desktop" "$HOME/Downloads"; do
  if [ -d "$d/${APP_NAME}.app" ]; then
    SOURCE_APP="$d/${APP_NAME}.app"
    break
  fi
done

# 1b. Otherwise look for a Bleumr DMG and mount it
if [ -z "$SOURCE_APP" ]; then
  DMG_FILE=""
  for d in "$SCRIPT_DIR" "$HOME/Downloads" "$HOME/Desktop"; do
    CANDIDATE=$(ls -t "$d"/${APP_NAME}*.dmg 2>/dev/null | head -1)
    if [ -n "$CANDIDATE" ]; then DMG_FILE="$CANDIDATE"; break; fi
  done

  if [ -n "$DMG_FILE" ]; then
    echo -e "  ${CYAN}Found installer:${NC} ${DIM}${DMG_FILE}${NC}"
    # The .dmg is itself quarantined when downloaded — clear it first.
    xattr -dr com.apple.quarantine "$DMG_FILE" 2>/dev/null
    MOUNT_POINT=$(hdiutil attach "$DMG_FILE" -nobrowse -noverify -noautoopen 2>/dev/null | grep "/Volumes" | awk -F'\t' '{print $NF}')
    if [ -n "$MOUNT_POINT" ]; then
      SOURCE_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)
    fi
  fi
fi

# 1c. Or it's already in /Applications and just needs un-quarantining
if [ -z "$SOURCE_APP" ] && [ -d "$APP_DEST" ]; then
  echo -e "  ${DIM}Bleumr is already in /Applications — repairing it in place.${NC}"
  SOURCE_APP="$APP_DEST"
fi

if [ -z "$SOURCE_APP" ]; then
  echo -e "  ${RED}Couldn't find Bleumr.${NC}"
  echo -e "  ${DIM}Put the Bleumr .dmg (or Bleumr.app) in your Downloads"
  echo -e "  folder or next to this file, then run this again.${NC}"
  pause_exit 1
fi

# ── Step 2: Quit Bleumr if it's running ─────────────────────────
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  echo -e "  ${YELLOW}Closing the running copy of Bleumr...${NC}"
  osascript -e "tell application \"${APP_NAME}\" to quit" 2>/dev/null
  sleep 2
  pkill -x "$APP_NAME" 2>/dev/null
  sleep 1
fi

# ── Step 3: Copy into /Applications (unless it's already the target) ──
if [ "$SOURCE_APP" != "$APP_DEST" ]; then
  echo -e "  ${CYAN}Installing to /Applications...${NC}"
  rm -rf "$APP_DEST" 2>/dev/null
  cp -R "$SOURCE_APP" /Applications/
  if [ ! -d "$APP_DEST" ]; then
    echo -e "  ${RED}Couldn't copy into /Applications.${NC}"
    echo -e "  ${DIM}Drag Bleumr to your Applications folder manually, then run this again.${NC}"
    [ -n "$MOUNT_POINT" ] && hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null
    pause_exit 1
  fi
fi

# ── Step 4: The actual fix — strip quarantine + re-bless the app ──
echo -e "  ${CYAN}Clearing the macOS quarantine flag...${NC}"
xattr -cr "$APP_DEST" 2>/dev/null
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null

# On Apple Silicon an unsigned app must carry at least an ad-hoc
# signature or it shows "is damaged". Re-apply one as a safety net.
echo -e "  ${CYAN}Re-blessing the app for Gatekeeper...${NC}"
codesign --force --deep --sign - "$APP_DEST" 2>/dev/null

# ── Step 5: Unmount the DMG if we mounted one ───────────────────
if [ -n "$MOUNT_POINT" ]; then
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null
fi

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║   Done! Bleumr is installed and ready.   ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 6: Launch ──────────────────────────────────────────────
echo -ne "  ${WHITE}Open Bleumr now? [Y/n]:${NC} "
read -r LAUNCH
LAUNCH=${LAUNCH:-Y}
if [[ "$LAUNCH" =~ ^[Yy]$ ]]; then
  open "$APP_DEST" 2>/dev/null \
    || echo -e "  ${DIM}Open it from your Applications folder.${NC}"
fi

pause_exit 0
