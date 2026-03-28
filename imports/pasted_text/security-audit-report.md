API key stored in plain React state
config.apiKey is held in useState and rendered to the DOM. It can leak via React DevTools, window.__REACT_FIBER__, localStorage serialisation, or error logs. Use SecureStorage.setSecure() + the Electron safeStorage bridge instead.
inject_script executes arbitrary LLM-generated code
ScriptSanitizer.validateScript() only blocks eval() and a few Node.js patterns. An LLM response (or a poisoned cloud AI reply) can still execute arbitrary DOM mutations, exfiltrate cookies/localStorage, or navigate to phishing pages. Add a strict allowlist of permitted script operations, not a denylist.
Template-literal script injection in callLocalBrain
Dozens of inject_script payloads interpolate user-supplied strings directly into template literals passed to executeJS. e.g. the click handler builds `targetText = \`${targetText}\`` — a backtick or ${ in user input breaks out of the string. ScriptSanitizer.escapeForJS() exists but is not called here.
localStorage fallback for secure credentials
SecureStorage falls back to plain localStorage outside Electron with a console.warn. In any web/browser context, API keys, session tokens, and user profile data land in unencrypted local storage accessible to any injected script.
selector sanitizer is bypassable
ScriptSanitizer.sanitizeSelector() strips <, javascript:, and onXXX= patterns but does not guard against CSS injection (e.g. [attr='] selector closures). Use CSS.escape() on any selector built from user input.
No Content Security Policy
No CSP header or meta-tag is configured for the renderer process. Any injected script can import external resources, call fetch(), or open new windows.
Data persistence & storage
Blocker
▼
All critical state lives in localStorage
Checkpoints (jumari_checkpoint_*), automation logs (jumari_automation_logs), bookmarks (orbit_bookmarks), and API key config are all in localStorage. localStorage is synchronous, has a 5–10 MB cap, can be wiped by the OS or browser, and is accessible to any XSS. Migrate to localforage (already imported!) or the Electron fs API.
AutomationLogger persists PII to localStorage
Log entries include full action payloads — which can contain email addresses, typed text, and URLs. These are written to localStorage.setItem('jumari_automation_logs') on every action. Strip sensitive fields before persisting or implement log rotation with a TTL.
No checkpoint expiry or cleanup
CheckpointManager.saveCheckpoint() writes indefinitely. A crashed or abandoned task leaves stale checkpoints forever. Add a TTL or call clearCheckpoint() on task completion.
ConversationHistory not persisted across sessions
The full message array lives only in React state and is lost on reload. localforage is imported but not used for conversation history. Users will lose their work on every app restart.
Safety & user approval flows
Blocker
▼
SafetyMiddleware auto-denies silently after 10 seconds
If no UI component handles the jumari_require_approval event (e.g. JumariApprovalModal is not mounted or errors out), the action is silently denied with no user feedback. The user sees the agent get stuck. Add a visible fallback state.
Safety intercept is inconsistently applied
The safety check in handleUserSubmit only triggers for inject_script and type-with-@ actions. Direct navigate, click, and scroll actions bypass SafetyMiddleware entirely — even though they can trigger purchases, form submissions, or account actions.
DurableAgentRuntime.cancel() sets state to IDLE but does not abort in-flight tasks
Calling cancel() emits a STATE_CHANGE event but does not stop the current await inside runTaskQueue. The task continues executing silently. Add an AbortController or a cancellation token checked before each step.
inject_script auto-retries 3× on error strings
Scripts that return 'Not found' or 'Error:' strings are retried up to 3 times. A script that intentionally returns 'Not found' (e.g. scraping a page that genuinely has no emails) waits ~4.5 seconds before proceeding, making the UX feel broken.
Architecture & code quality
Needs work
▼
App.tsx is ~2,400 lines — a God component
All state, all agent logic, all rendering, NLU/intent parsing, script building, and browser control live in one file. This makes testing impossible and changes risky. Extract at minimum: useAgentLoop hook, IntentParser class, and ScriptBuilder.
ElectronRPC fallback returns mocked success for all calls
Outside Electron, readFile returns 'mocked_file_content', checkFileExists returns true, and verifyVisual returns true. This makes integration errors invisible during development and will cause silent data corruption in production.
AgentWebSocket is not actually a WebSocket
AgentWebSocket.connect() sets isConnected=true immediately and never opens a real socket. The send() method logs but does nothing. If a backend agent process is ever added, this is a silent no-op that will confuse debugging.
webviewRef / webviewRefs are legacy refs kept for 'compatibility'
The codebase has a comment: 'will be removed'. These refs coexist with useBrowserEngine, creating two sources of truth for the active webview. The legacy ref is still used in large portions of the agentic loop.
MAX_STEPS is 15 with no exponential backoff
The agent loop runs up to 15 LLM steps with a fixed ~2s artificial delay per step. A slow cloud API + 15 steps = 30+ second hangs with no progress feedback beyond the animated sphere.
Error handling & observability
Needs work
▼
console.error is monkey-patched in a useEffect
The app overrides console.error globally to capture errors into devErrors state. This intercept is never cleaned up properly (the cleanup fn is in the return, but the new fn captures prev state via closure). In React Strict Mode, this runs twice and creates duplicate entries.
No error reporting or telemetry
All errors are logged to localStorage (max 100 entries) and the dev overlay. There is no integration with Sentry, Datadog, or a similar service. Production failures will be invisible.
VerificationEngine.snapshots grows unbounded in memory
takeSnapshot() stores full document.body.innerHTML strings in a Map with no eviction. Long sessions on complex pages can consume hundreds of MB.
No unit or integration tests present
No test files were found in the source tree. The intent parser (detectIntent), script builders, and SafetyMiddleware contain complex branching logic with no coverage.
Performance
Minor
▼
Artificial delays add 1.8–3s per agent step
callLocalBrain adds await new Promise(r => setTimeout(r, 1800 + Math.random() * 1500)) to simulate 'thinking'. Remove these in production — they provide no user value and make tasks 3× slower.
LocalLLMEngine initialisation blocks the render thread
TinyLlama-1.1B is initialised in the main renderer thread via WebLLM. Model downloads can be 500 MB+. This will freeze the UI. Move to a Web Worker.
read_page querySelectorAll on entire document body every step
Every read_page action annotates every input/button/a/h/p/span/li element in the DOM, then serialises up to 4,000 characters to pass back to the LLM. On complex pages this is expensive and produces noisy output.