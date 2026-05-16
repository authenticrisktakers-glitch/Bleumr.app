#!/bin/bash
# Bleumr — macOS one-line installer / Gatekeeper fix.
#
#   curl -fsSL https://bleumr.com/install.sh | bash
#
# Bleumr is not yet signed with an Apple Developer ID, so macOS
# quarantines it ("Bleumr is damaged" / "unidentified developer").
# This finds Bleumr (an installed copy, or a .dmg in Downloads),
# installs it, strips the quarantine flag, and opens it.
# Non-interactive and safe to re-run. No data leaves your Mac.

set +e

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'

APP_NAME="Bleumr"
APP_DEST="/Applications/${APP_NAME}.app"

echo ""
echo -e "${CYAN}  Bleumr installer — macOS${NC}"
echo ""

MOUNT_POINT=""
SOURCE_APP=""

# 1. A loose Bleumr.app on Desktop / Downloads
for d in "$HOME/Desktop" "$HOME/Downloads"; do
  [ -d "$d/${APP_NAME}.app" ] && SOURCE_APP="$d/${APP_NAME}.app" && break
done

# 2. A downloaded Bleumr .dmg
if [ -z "$SOURCE_APP" ]; then
  for d in "$HOME/Downloads" "$HOME/Desktop"; do
    DMG=$(ls -t "$d"/${APP_NAME}*.dmg 2>/dev/null | head -1)
    [ -n "$DMG" ] && break
  done
  if [ -n "$DMG" ]; then
    echo -e "  ${DIM}Found ${DMG}${NC}"
    xattr -dr com.apple.quarantine "$DMG" 2>/dev/null
    MOUNT_POINT=$(hdiutil attach "$DMG" -nobrowse -noverify -noautoopen 2>/dev/null | grep "/Volumes" | awk -F'\t' '{print $NF}')
    [ -n "$MOUNT_POINT" ] && SOURCE_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)
  fi
fi

# 3. Already installed — just repair it
if [ -z "$SOURCE_APP" ] && [ -d "$APP_DEST" ]; then
  SOURCE_APP="$APP_DEST"
  echo -e "  ${DIM}Repairing the copy already in /Applications${NC}"
fi

if [ -z "$SOURCE_APP" ]; then
  echo -e "  ${RED}Couldn't find Bleumr.${NC}"
  echo -e "  ${DIM}Download the .dmg from https://bleumr.com first (it'll land in"
  echo -e "  your Downloads folder), then run this command again.${NC}"
  echo ""
  exit 1
fi

# Quit a running copy
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  osascript -e "tell application \"${APP_NAME}\" to quit" 2>/dev/null
  sleep 2; pkill -x "$APP_NAME" 2>/dev/null; sleep 1
fi

# Install to /Applications if needed
if [ "$SOURCE_APP" != "$APP_DEST" ]; then
  echo -e "  ${CYAN}Installing to /Applications...${NC}"
  rm -rf "$APP_DEST" 2>/dev/null
  cp -R "$SOURCE_APP" /Applications/
fi
[ -n "$MOUNT_POINT" ] && hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null

if [ ! -d "$APP_DEST" ]; then
  echo -e "  ${RED}Install failed — drag Bleumr to your Applications folder, then re-run.${NC}"
  echo ""
  exit 1
fi

# The fix: drop quarantine + re-bless (Apple Silicon needs a signature)
echo -e "  ${CYAN}Clearing the macOS quarantine flag...${NC}"
xattr -cr "$APP_DEST" 2>/dev/null
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null
codesign --force --deep --sign - "$APP_DEST" 2>/dev/null

echo ""
echo -e "  ${GREEN}Done — Bleumr is installed and ready.${NC}"
echo ""
open "$APP_DEST" 2>/dev/null || echo -e "  ${DIM}Open Bleumr from your Applications folder.${NC}"
