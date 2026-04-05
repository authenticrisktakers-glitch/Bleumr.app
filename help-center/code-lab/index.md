# Code Lab

## Overview

Code Lab is Bleumr's integrated code editor and playground. Write, edit, run, and debug code directly within Bleumr — no external IDE required. Code Lab supports multiple programming languages and includes AI-powered assistance for debugging, refactoring, and optimization.

## Supported Languages

- JavaScript / TypeScript
- Python
- HTML / CSS
- SQL
- Go
- Rust
- Bash / Shell
- JSON
- And more

## Features

### Code Editor
- Full syntax highlighting for all supported languages.
- Line numbers and code folding.
- Multiple file tabs for working on several files simultaneously.

### Code Execution
- **JavaScript**: Execute JavaScript code in a sandboxed iframe environment directly in Bleumr. See console output and results in real time.
- **HTML**: Live preview of HTML files with CSS and JavaScript in a sandboxed iframe.
- **Other Languages**: Code display and editing with AI assistance. Execution for non-JavaScript languages requires an external runtime.

### AI Quick Actions
Click any of the quick action buttons above the editor for instant AI assistance:

- **Debug**: Identify and fix bugs in your code.
- **Explain**: Get a line-by-line explanation of what the code does.
- **Refactor**: Improve code structure without changing behavior.
- **Tests**: Generate unit tests for your code.
- **Add Types**: Add TypeScript type annotations to JavaScript code.
- **Optimize**: Suggest performance improvements.

### GitHub Integration
- Browse your GitHub repositories directly from Code Lab.
- View repository files and structure.
- Open files for editing and AI analysis.

> **Note:** GitHub integration is read-only. Code Lab does not push changes to your repositories. Copy the code and commit changes using your preferred Git workflow.

### Code Analysis
Code Lab includes pattern detection that identifies:
- Common anti-patterns and code smells.
- Security vulnerabilities.
- Performance bottlenecks.
- Style inconsistencies.

### API Reference
Quick-access links to external documentation:
- Stack Overflow
- npm package registry
- MDN Web Docs

## Using Code Lab

1. Open **Apps** from the sidebar.
2. Click **Code Lab**.
3. Select a language from the dropdown or start typing code.
4. Use the quick action buttons for AI assistance.
5. For JavaScript and HTML, click **Run** to execute and see results.

## Limitations

- Code execution is limited to JavaScript and HTML in the built-in sandbox. Other languages can be written and analyzed but not executed within Bleumr.
- The JavaScript sandbox has limited browser API access for security reasons. Operations such as file system access, network requests to arbitrary domains, and access to the parent page are restricted.
- AI code assistance relies on AI models and may produce incorrect or suboptimal code. Always review and test generated code before using it in production.
- GitHub integration requires authentication and may be subject to GitHub's API rate limits.

## Disclaimer

Code generated or suggested by Code Lab's AI features is provided as-is without warranty. Bleumr does not guarantee that generated code is correct, secure, efficient, or free of bugs. You are responsible for reviewing, testing, and validating all code before deployment. Bleumr is not liable for any damages arising from the use of AI-generated code.

---

*Code Lab is designed for rapid prototyping, learning, and AI-assisted development. For large-scale projects, we recommend using Code Lab alongside your preferred IDE.*
