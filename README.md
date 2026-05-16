# Bleumr

AI-powered desktop browser and agent platform.

## Download

Get the latest release from the [Releases page](https://github.com/authenticrisktakers-glitch/Bleumr.app/releases).

### macOS Installation

Bleumr is not yet signed with an Apple Developer ID, so macOS will say it is
"damaged" or from an "unidentified developer". This is expected — the app is
safe; macOS just blocks unsigned apps by default. Pick whichever fix is easiest:

**Easiest — one command (recommended).** Open Terminal and paste:

```
curl -fsSL https://bleumr.com/install.sh | bash
```

It finds the downloaded `.dmg` (or an installed copy), installs Bleumr, clears
the quarantine flag, and opens it. Nothing leaves your Mac.

**Or — double-click the installer.** Download `install-bleumr.command`,
**right-click it → Open** (right-click the first time, don't double-click —
that lets it past Gatekeeper), and follow the prompts.

**Or — manual.** Drag Bleumr to Applications from the DMG, then in Terminal run:

```
xattr -cr /Applications/Bleumr.app && open /Applications/Bleumr.app
```
