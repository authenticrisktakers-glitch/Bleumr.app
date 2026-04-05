# Workspace (Multi-Agent Orchestration)

> **Availability:** Pro and Stellur tiers only.

## Overview

Workspace is Bleumr's multi-agent system that breaks complex tasks into smaller pieces and assigns them to specialized AI agents working in parallel. Instead of a single conversation thread, Workspace deploys a team of agents — each with a distinct role — to tackle your project from multiple angles simultaneously.

## Agents

Workspace uses five specialized agents:

### Planner
The task architect. The Planner analyzes your request, breaks it into actionable steps, determines dependencies, and creates a structured execution plan.

### Researcher
The knowledge hunter. The Researcher gathers information, searches the web, reads documents, and compiles background knowledge needed for the task.

### Coder
The developer. The Coder writes, reviews, and debugs code. It produces working implementations based on the Planner's specifications and the Researcher's findings.

### Designer
The creative. The Designer creates visual assets, UI layouts, and design recommendations. It focuses on user experience and visual presentation.

### Executor
The action-taker. The Executor carries out concrete actions — running code, testing implementations, making API calls, and monitoring progress.

## How to Use Workspace

1. Open **Workspace** from the sidebar.
2. Describe your project or task in the input field. Be as detailed as possible.
3. The Planner agent will analyze your request and create a task breakdown.
4. All relevant agents activate and begin working in parallel.
5. Monitor progress in real time — each agent's work is displayed in its own panel.
6. Review the combined results when agents complete their tasks.

## Example Projects

- "Build a landing page for a fitness app with a signup form, pricing section, and testimonials."
- "Research the top 5 competitors in the meal delivery space and create a comparison report."
- "Write a Python script that scrapes weather data and visualizes it in a chart."
- "Design a database schema for a task management application and write the SQL migrations."

## Monitoring Progress

- Each agent displays its current status: working, waiting, or completed.
- Agent outputs (text, code, designs) appear in real time as they are generated.
- The Planner coordinates dependencies — agents wait for prerequisite tasks before proceeding.

## Limitations

- Workspace tasks consume AI calls from your daily quota. Complex projects with multiple agents may use a significant portion of your daily limit.
- Agents work independently and may occasionally produce overlapping or conflicting outputs. Review all results before using them.
- Workspace is best suited for well-defined tasks. Ambiguous or extremely broad requests may produce scattered results.
- Agent outputs are AI-generated and should be reviewed for accuracy, especially code and factual claims.

## Disclaimer

Workspace agents are AI-powered tools that generate content, code, and recommendations. All outputs should be reviewed by a qualified person before use in production systems, business decisions, or any context where accuracy is critical. Bleumr does not guarantee the correctness, completeness, or fitness of agent outputs for any particular purpose.

---

*Workspace is a premium feature under active development. We are continuously improving agent coordination, output quality, and the range of supported task types.*
