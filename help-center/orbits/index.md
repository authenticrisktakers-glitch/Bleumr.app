# Orbits (Background Goal Tracking)

> **Availability:** Basic Orbits on Free tier. Full Orbits on Pro and Stellur.

## Overview

Orbits are persistent background agents that track long-running goals for you. Unlike a one-time chat message, an Orbit continuously monitors a situation and notifies you when something relevant happens. Think of Orbits as a personal assistant that watches the world for you.

## How Orbits Work

1. Tell JUMARI what you want to track. For example: "Watch Bitcoin price and tell me when it drops below $60,000."
2. JUMARI creates an Orbit — a background task with a defined goal, check interval, and priority.
3. The Orbit runs periodic checks in the background while you use other features or even when the app is idle.
4. When the Orbit discovers something relevant (a "finding"), you receive a notification.
5. You can click on a finding to open a linked chat thread for deeper investigation.

## Example Orbits

- "Monitor apartment listings in downtown Austin under $2,000/month."
- "Track the price of NVIDIA stock and alert me to significant changes."
- "Watch for new job postings for senior React developers at [company]."
- "Keep an eye on flight prices from LAX to Tokyo for next March."
- "Alert me when [product] goes on sale on Amazon."

## Managing Orbits

### Viewing Orbits
- Click the **Orbits** section in the sidebar to see all active, paused, and completed Orbits.
- Each Orbit shows its status, last check time, and number of findings.

### Orbit Status
- **Active**: The Orbit is currently monitoring and checking periodically.
- **Paused**: The Orbit is temporarily stopped. You can resume it at any time.
- **Completed**: The Orbit has achieved its goal or been manually marked as complete.
- **Failed**: The Orbit encountered repeated errors and stopped automatically.

### Findings
- Findings are displayed in a notification center accessible from the sidebar.
- Unread findings show a badge count.
- Each finding includes a timestamp, summary, and metadata.
- Click a finding to open a chat thread linked to that Orbit for follow-up discussion.

### Pausing and Resuming
- Click the pause button on an active Orbit to temporarily stop checks.
- Click resume to restart monitoring.

### Deleting Orbits
- Delete an Orbit from the Orbits panel. This removes the Orbit and all its findings.
- Deleted Orbits cannot be recovered.

## Configuration

- **Check Interval**: How often the Orbit checks for updates. This depends on the nature of the task and is set automatically by JUMARI based on urgency.
- **Priority**: Orbits can be marked as high, medium, or low priority. High-priority Orbits are checked more frequently.

## Limitations

- Orbits rely on web searches and available APIs to gather information. They cannot access paywalled content, private databases, or information that requires authentication.
- The accuracy and timeliness of Orbit findings depend on the availability and freshness of web data.
- Orbits consume AI calls from your daily quota. On the Free tier, Orbit checks are limited to conserve your 15 daily calls.
- Orbits run within the Bleumr application. They do not run when the application is completely closed (not running in the background or system tray).

## Disclaimer

Orbits are an AI-powered monitoring tool and are not a substitute for professional monitoring services. Information provided by Orbits may be inaccurate, delayed, or incomplete. Do not rely on Orbits for time-critical decisions such as financial trading, medical monitoring, or safety-related alerts. Always verify important information from authoritative sources.

---

*Orbits is an evolving feature. We are working on improving check frequency, notification delivery, and the range of trackable data sources.*
