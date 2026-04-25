# GitHub Copilot CLI Skills

This directory contains [GitHub Copilot CLI skills](https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent-to-work-on-tasks/about-assigning-tasks-to-copilot) — structured prompts that extend the CLI with project-specific workflows.

## Available Skills

| Skill | Location | Description |
|-------|----------|-------------|
| `analyze-prompt-part` | [`.github/skills/analyze-prompt-part/`](skills/analyze-prompt-part/SKILL.md) | Evaluate a selected prompt section from an `ai_workflow.js` prompt log file against the actual codebase. Assesses whether the section's instructions, context, or constraints are aligned with the real codebase state. |
| `fix-prompt-response-issues` | [`.github/skills/fix-prompt-response-issues/`](skills/fix-prompt-response-issues/SKILL.md) | Read a prompt log response, extract only concrete actionable issues, and fix them in the repository that owns the log. Stops cleanly when the response contains no real issues. |
| `update-olinda-sdk` | [`.github/skills/update-olinda-sdk/`](skills/update-olinda-sdk/SKILL.md) | Update the `olinda_copilot_sdk.ts` GitHub tarball dependency to the latest published release tag (or a specific target version), reinstall, verify, and commit. |

## Usage

Skills are invoked via the GitHub Copilot CLI. Each skill directory contains a `SKILL.md` file with the full instructions and any accepted parameters.

To invoke `analyze-prompt-part`, press `[a]` in the Prompt Parts viewer of the TUI, or ask the Copilot CLI to evaluate a specific prompt section against the codebase.

To invoke `fix-prompt-response-issues`, press `[f]` while a prompt log file is open in the Files-mode viewer, or ask the Copilot CLI to fix actionable issues reported in a prompt response.

To invoke `update-olinda-sdk`, ask the Copilot CLI to update the `olinda_copilot_sdk.ts` dependency, or specify a target version: "update olinda_copilot_sdk.ts to v0.10.0".
