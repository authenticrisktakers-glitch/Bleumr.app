# Data and Storage

## Overview

Bleumr uses a local-first data architecture. Your conversations, projects, settings, and personal information are stored on your device. This document explains how data is stored, managed, and can be exported or deleted.

## Where Data Is Stored

### Desktop App (Electron)
Data is stored in the Electron application data directory:
- **macOS**: `~/Library/Application Support/Bleumr/`
- This directory contains local storage databases, cached images, and application settings.

### Web App (PWA)
Data is stored in the browser's local storage and IndexedDB:
- Data persists as long as you do not clear your browser data.
- Different browsers maintain separate data stores.

## Types of Stored Data

| Data Type | Storage Location | Persistence |
|-----------|-----------------|-------------|
| Conversations | Local storage | Until manually deleted or app uninstalled |
| User profile | Local storage | Until manually deleted or app uninstalled |
| Settings | Local storage | Until manually deleted or app uninstalled |
| API keys | Secure storage (OS keychain on desktop) | Until manually removed |
| Calendar events | Local storage | Until manually deleted or app uninstalled |
| Web Designer projects | Local storage | Until manually deleted or app uninstalled |
| Code Lab files | Local storage | Until manually deleted or app uninstalled |
| Orbit findings | Local storage | Until manually deleted or app uninstalled |
| AI memory | Local storage | Until manually cleared |
| Frame cache (BLEU BASE GG) | In-memory only | Cleared when app closes |
| Voice audio | Not stored | Streamed and discarded |

## Exporting Data

### Conversations
1. Open **Settings** from the sidebar.
2. Navigate to the export section.
3. Click **Export Conversations**.
4. A file will be downloaded containing your conversation history.

### Web Designer Projects
1. Open a project in Web Designer.
2. Click the **Export** button.
3. A ZIP file containing all project files (HTML, CSS, JS) will be downloaded.

### Code Lab Files
- Copy code from the editor and save it to your local file system using your operating system's standard file-saving methods.

## Deleting Data

### Individual Items
- **Delete a conversation**: Right-click or use the menu on a thread in the sidebar to delete it.
- **Delete an Orbit**: Remove it from the Orbits panel.
- **Delete a calendar event**: Click the delete button on the event.
- **Delete a Web Designer project**: Use the project management menu.
- **Clear AI memory**: Ask JUMARI to "forget everything" or clear memory from Settings.

### All Data
- **Desktop**: Uninstalling Bleumr removes all local data.
- **Web**: Clear your browser's local storage and site data for the Bleumr domain.

> **Warning:** Deleted data cannot be recovered unless you have a backup or have enabled cloud sync.

## Cloud Sync

Cloud sync is an optional feature that stores encrypted copies of your data on Bleumr's servers (powered by Supabase) for cross-device access.

### How Sync Works
1. Open **Settings > Sync**.
2. Create a sync token.
3. Use the same sync token on another device to sync data.

### What Is Synced
- Conversation history
- Settings and preferences

### What Is NOT Synced
- API keys (must be entered on each device separately for security)
- Cached data (frame cache, preloaded images)
- Active sessions (voice chat, browser tabs)

### Deleting Synced Data
Contact support@bleumr.com to request deletion of all synced data from our servers.

## Storage Limits

- Local storage is limited by your device's available disk space and browser storage quotas.
- Bleumr uses efficient storage patterns, but very long conversation histories or many Web Designer projects may consume significant storage.
- The AI memory system is capped at 120 entries with automatic deduplication.
- The BLEU BASE GG frame cache is limited to 50 frames in memory and is cleared when the app closes.

---

*Bleumr is designed to give you full control over your data. If you have questions about data storage or need assistance with data management, contact support@bleumr.com.*
