Core idea

Orbit is an AI-native Chromium browser that combines a powerful reasoning model (the assistant) with a low-level browser automation layer (the agent). The assistant communicates with you through a conversational side-panel, while the agent directly operates the browser—clicking, scrolling, filling forms, extracting data, and interacting with external services—so complex tasks can be completed automatically.

2. Architecture – the dual-channel communication flow
Piece	What it does	How it connects
User query (typed or spoken)	Enters the system through the /rest/sse/orbit_ask endpoint.	Starts a Server-Sent Events (SSE) stream that returns the assistant’s reasoning, citations, and final answer to the UI.
Side-panel / Assistant (SSE stream)	Displays the model’s step-by-step thinking, sources, and current progress so you can watch what it’s doing.	Dedicated exclusively to the conversational interface and never carries high-frequency automation traffic.
Agent extension (orbit-agent)	A Chromium extension embedded in Orbit that executes browser automation RPCs (click, type, scroll, screenshot, etc.).	When the model needs to act on the page, the SSE stream sends an entropy_request message containing a base_url pointing to a WebSocket (wss://agent.orbit.ai). The Sidecar unpacks the task and forwards it to the extension through the browser’s extension messaging API.
WebSocket channel	Manages bidirectional, high-frequency communication required for real-time browser automation (RPC calls, screenshots, results).	Runs alongside the SSE stream; results return through the same WebSocket so the assistant can incorporate the outcome into its response.
Simplified DOM representation	Instead of sending the full HTML DOM to the model, Orbit generates a trimmed DOM that includes only interactable elements (links, buttons, textboxes, checkboxes, etc.).	This annotated DOM is delivered to the model through the ReadPage RPC method, allowing it to reason about page actions without unnecessary noise.
MCP Connector Integration (Model Context Protocol)	Provides a plugin-style bridge to external services such as Slack, GitHub, Asana, Linear, Notion, Atlassian, Gmail, Google Calendar, Shopify, and others.	The assistant can invoke these tools like native browser actions and display inputs/outputs in the side-panel.
Agent Workflow Visualization	Displays multi-step reasoning in real time, showing tool usage, intermediate results, and decisions directly in the interface.	Gives full transparency into how the assistant arrives at its answer.

Result:
The assistant can think (via SSE) and act (via the WebSocket-powered agent) simultaneously, allowing Orbit to execute complex workflows while keeping the user informed.

3. What Orbit can achieve – concrete capabilities
Capability	How it works in Orbit	Example
Research & summarization	Reads page content via the simplified DOM and extracts key information across tabs or uploaded documents.	“Summarize this article” or “Compare pricing on three hotel tabs.”
Form filling & data entry	The agent clicks fields, types text using simulated keyboard input, and submits forms across sites.	Searching LinkedIn for product manager roles and extracting results automatically.
Booking & purchasing	Navigates travel or retail sites, applies constraints (price, airline, stops), compares options, and completes checkout after permission.	“Find the cheapest flight from San Francisco to New York next Monday.”
Code generation & submission	Writes code directly in chat or embedded editors and can automatically run or submit it.	Writing Python for a coding challenge, submitting it, and verifying test results.
Voice-driven navigation	Accepts spoken commands that are transcribed into queries.	“Open the third result and scroll to the specs section.”
Automated email workflows	Reads, summarizes, drafts, and sends emails via Gmail or Outlook through MCP connectors.	Managing inbox tasks automatically.
Cross-tab context awareness	Maintains a shared context model across tabs to enable multitasking.	Pull data from a spreadsheet while filling a web form on another tab.
Enterprise controls	Supports MDM deployment, Chromium policy controls, and granular agent permissions.	Allows organizations to manage Orbit across teams.
Transparent AI operation	Shows every action in the side-panel and allows users to intervene or adjust behavior.	The assistant asks before performing sensitive tasks.
Security-focused architecture	Prevents unauthorized extensions from accessing local files and restricts MCP integrations via consent policies.	Protects against covert system access.
Offline / silent operation	Once models and extensions are installed, much of the reasoning and automation can run locally.	Suitable for secure or low-bandwidth environments.
4. Typical developer workflow (extending Orbit)

1. Register your service with the MCP connector
Expose a JSON-RPC or REST endpoint that Orbit can call (for example, an internal ticketing system).

2. Add a manifest entry in the orbit-agent extension
Declare the MCP service name, authentication method, and allowed scopes.

3. Use natural language to trigger the service
Example:
“Create a ticket for this bug.”
Orbit routes the request through MCP, displays the request and response in the side-panel, and executes follow-up actions automatically.

4. Leverage the simplified DOM
If you want Orbit to understand a custom web application, annotate key elements with:

data-orbit-interactable="true"

This ensures they appear in the trimmed DOM provided to the model.

Once model files and extensions are downloaded, the automation layer runs locally, with reasoning handled by either hosted or local models.

5. Bottom line

The Orbit assistant + orbit-agent architecture provides:

A reasoning engine capable of reading, summarizing, and planning across web content.

A low-level browser automation agent that can click, type, scroll, capture screenshots, and interact with external services via MCP.

A dual-channel architecture (SSE + WebSocket) that keeps the UI responsive while enabling real-time browser automation.

Transparent, user-controlled AI that displays actions, asks permission for sensitive tasks, and allows adjustable autonomy.

Enterprise-ready deployment with MDM support, policy controls, offline installation, and integrations with productivity platforms.

Together, these capabilities make Orbit more than a browser—it becomes an agentic co-pilot that converts natural-language intent into real web actions while keeping the user fully informed and in control.