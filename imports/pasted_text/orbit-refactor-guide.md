Refactor this Orbit project into a production-ready Electron desktop application.

Do not ask questions.
Do not present alternatives.
Do not output planning steps.
Directly implement the required changes.

The app must remain Electron-based because embedded browsing requires bypassing CORS and iframe restrictions.

Execute the following changes exactly.

1. Enforce a secure Electron architecture

Create or refactor the project into the standard structure:

/electron
  main.ts
  preload.ts

/src
  renderer

Move all Electron logic to the main process.

Enable the following in BrowserWindow:

contextIsolation: true
nodeIntegration: false
sandbox: true

Expose only required APIs through preload using contextBridge.

Remove any direct renderer access to Node APIs.

All renderer ↔ main communication must go through validated IPC handlers.

2. Replace unsafe Electron usage

Remove:
- nodeIntegration in renderer
- direct window.electronAPI access if not routed through preload
- arbitrary IPC calls
- renderer filesystem access

Create a controlled bridge in preload.ts exposing only:

orbit.browser.open
orbit.browser.navigate
orbit.browser.reload
orbit.storage.get
orbit.storage.set
orbit.system.info

3. Implement embedded browsing correctly

Orbit requires an embedded browser.

Use Electron's BrowserView or webContents instead of unsafe iframe hacks.

Implement a browser manager in the main process that supports:

- open tab
- close tab
- navigate
- reload
- track URL
- track loading state
- handle crashes

Send browser state updates to the renderer through IPC events.

Renderer must only display state and issue navigation commands.

4. Remove localhost dependencies

Delete all references to:

http://localhost
127.0.0.1
hardcoded backend ports

Orbit must run standalone after installation.

Any logic currently relying on a localhost server must be moved into:

- the Electron main process
or
- renderer logic

5. Implement the default assistant mode (no API required)

Orbit must work without API keys.

Create a built-in assistant mode that provides:

- conversation interface
- task planning
- action previews
- agent step visualization

Do not return fake success responses.

If a feature requires a real API provider, show a UI notice:

"This feature requires a provider key."

6. Add optional BYOK providers

Create a Settings page allowing users to add API keys.

Supported providers:

OpenAI
Groq

Keys must be stored locally using Electron safe storage.

Never hardcode API keys.

If no provider key exists, fallback to built-in assistant mode.

7. Remove all misleading mocks

Delete code that returns fake success objects like:

{ success: true, mocked: true }

If functionality is unavailable, disable the action in the UI.

8. Stabilize renderer architecture

Split large files into modules.

Create folders:

/components
/hooks
/services
/state
/ui

Move logic out of giant UI components.

Ensure strong TypeScript typing.

9. Improve reliability

Add error handling for:

- page load failures
- browser crashes
- provider errors
- invalid navigation

Add loading indicators for browser tabs.

Add empty states where data may be missing.

Prevent UI crashes from undefined state.

10. Add project build and packaging

Create a complete package.json.

Add scripts:

dev
build
package

Install required packages for a modern Electron + React + Vite stack.

Configure packaging using electron-builder.

Add app metadata:

name
version
icons
build targets

11. Fix all build errors

Resolve:

- broken imports
- invalid asset references
- figma-only asset loaders
- syntax errors
- Vite build failures

Ensure:

npm install works
npm run dev works
npm run build works

12. Add project documentation

Create:

README.md
.env.example

README must include:

- install instructions
- dev instructions
- build instructions
- packaging instructions

13. Final verification

The finished app must satisfy these requirements:

- launches as an Electron desktop app
- embedded browsing works
- no localhost services required
- usable without API keys
- optional BYOK providers
- secure preload bridge
- no mocked production behavior
- builds and packages successfully

Implement the full refactor now.
Do not output explanations until the implementation is complete.