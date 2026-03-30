# GitHub Copilot CLI Skills

This directory contains [GitHub Copilot CLI skills](https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent-to-work-on-tasks/about-assigning-tasks-to-copilot) — structured prompts that extend the CLI with project-specific workflows.

## Available Skills

| Skill | Location | Description |
|-------|----------|-------------|
| `analyze-prompt-part` | [`.github/skills/analyze-prompt-part/`](skills/analyze-prompt-part/SKILL.md) | Evaluate a selected prompt section from an `ai_workflow.js` prompt log file against the actual codebase. Assesses whether the section's instructions, context, or constraints are aligned with the real codebase state. |

## Usage

Skills are invoked via the GitHub Copilot CLI. Each skill directory contains a `SKILL.md` file with the full instructions and any accepted parameters.

To invoke `analyze-prompt-part`, press `[a]` in the Prompt Parts viewer of the TUI, or ask the Copilot CLI to evaluate a specific prompt section against the codebase.
