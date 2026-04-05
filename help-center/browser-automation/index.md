# Browser Automation

> **Availability:** Desktop app only. Requires Pro or Stellur subscription for full access.

## Overview

Bleumr includes a built-in AI-powered browser that can navigate websites, fill forms, click buttons, extract data, and perform complex multi-step tasks on your behalf. This feature is designed for productivity automation such as research, data collection, and repetitive web tasks.

## How It Works

1. Give JUMARI a natural language command describing what you want to do on the web.
2. JUMARI parses your intent, opens the built-in browser, and begins executing the task.
3. You can watch the browser in real time as JUMARI navigates and interacts with pages.
4. JUMARI reports back with results, screenshots, or extracted data.

## Example Use Cases

- **Research**: "Search for the top 10 project management tools and compare their pricing."
- **Data Extraction**: "Go to [website] and extract all product names and prices."
- **Form Filling**: "Fill out this application form with my profile information."
- **Price Tracking**: "Check the current price of [product] on Amazon."
- **Content Research**: "Find recent news articles about [topic] and summarize them."

## Approval Workflow

For your safety, Bleumr uses an approval system for browser actions:

- **Manual Approval (Default)**: JUMARI will describe each action before performing it. You must approve or deny each step.
- **Auto-Approval Mode**: In Settings, you can enable auto-approval to allow JUMARI to execute actions without manual confirmation. Use this only for trusted, low-risk tasks.

> **Warning:** Auto-approval mode gives JUMARI permission to interact with websites on your behalf without confirmation. Do not enable this mode when the browser is logged into sensitive accounts (banking, email, social media) unless you fully understand the risks.

## Supported Actions

- Navigate to URLs
- Click buttons and links
- Fill text inputs and forms
- Select dropdown options
- Scroll pages
- Extract text and data from pages
- Take screenshots
- Execute JavaScript for advanced interactions

## Tab Management

- Bleumr manages browser tabs internally.
- You can open multiple tabs, switch between them, and close them through JUMARI commands or the tab bar.
- Each tab operates independently.

## Safety and Security

### Script Sanitization
All scripts executed in the browser are sanitized before execution. Bleumr blocks known malicious patterns and restricts access to sensitive browser APIs.

### Safety Middleware
The Safety Middleware reviews each browser action before execution to prevent:
- Navigation to known malicious websites
- Submission of sensitive personal data to untrusted forms
- Actions that could compromise your device or accounts

### What Bleumr Will Not Do
- Bleumr will not enter passwords, credit card numbers, or other sensitive credentials on your behalf.
- Bleumr will not interact with CAPTCHAs or human verification systems.
- Bleumr will not perform actions on websites that explicitly prohibit automated access (in accordance with their terms of service).

## Limitations

- Browser automation requires a stable internet connection.
- Some websites may block automated interactions through bot detection, CAPTCHAs, or rate limiting. Bleumr cannot bypass these protections.
- Complex or highly dynamic web applications (e.g., single-page apps with heavy JavaScript) may not always be navigable.
- Browser automation is not available in the web (PWA) version of Bleumr due to browser sandbox restrictions.
- The accuracy of element detection and interaction depends on the structure and accessibility of the target website.

## Disclaimer

Browser automation is provided as a productivity tool. You are responsible for ensuring that your use of browser automation complies with the terms of service of any website you interact with. Bleumr is not responsible for any consequences arising from automated interactions with third-party websites, including but not limited to account suspensions, data loss, or violations of third-party terms of service.

Automated web interactions may not always produce the expected results. Always review the outcomes of automated tasks before relying on them for important decisions.

---

*Browser automation capabilities are under active development. We regularly improve element detection, action reliability, and safety features.*
