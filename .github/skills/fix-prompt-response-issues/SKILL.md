---
name: fix-prompt-response-issues
description: >
  Read a prompt log response from ai_workflow.js, extract only concrete
  actionable issues, and fix those issues in the repository that owns the log
  file. Use this skill when the user presses [f] while a prompt log file is
  open in the TUI, or when asked to repair issues identified in a prompt
  response.
parameters:
  project_root:
    description: >
      Root directory of the repository to modify. Defaults to the current
      GitHub Copilot CLI working directory.
    default: $PWD
  prompt_log_path:
    description: >
      Absolute path to the prompt log markdown file whose response should be
      mined for actionable issues.
---

## Purpose

This skill turns a prompt response into a targeted repair workflow:

1. Read the prompt log file and isolate the `## Response` section
2. Extract only concrete, actionable issues
3. Ignore generic praise, vague suggestions, and speculative commentary
4. Fix the confirmed issues in the repository that owns the log
5. Stop cleanly when there is nothing real to fix

## Extraction rules

- Treat the prompt response as an evidence source, not as an infallible plan.
- Only act on items that describe a concrete defect, mismatch, missing element,
  incorrect file/function/behavior, or a concrete performance inefficiency tied
  to named files/modules.
- Treat file-specific performance findings as actionable when they are supported
  by the visible code and describe a real cost such as eager loading, bundle
  bloat, startup overhead, repeated work, unnecessary synchronous I/O, or
  similar inefficiency.
- Ignore broad ideas such as "consider improving", "could be cleaner", or
  "might want to refactor" unless they are backed by a specific, verifiable
  issue in the codebase. Do not discard an item merely because the remediation
  is phrased as an "optimization example" when the underlying issue is concrete
  and verified.
- Re-check every claimed issue against the live repository before editing code.
- If the response contains no concrete actionable issues, stop and reply with
  exactly:

```text
No actionable issues found in prompt response.
```

## Fix workflow

1. Open the prompt log file and read the full response, not just any excerpt.
2. Build a short list of actionable issues that can be verified in the current
   repository, including concrete performance findings when the prompt response
   ties them to named files or modules.
3. Ignore any issue that belongs to a different repository or cannot be
   confirmed from the visible code.
4. Fix each confirmed issue directly in the codebase.
5. Update any directly related developer documentation when the fix changes
   documented behavior or keybindings.
6. Run the repository's existing validation commands needed to support the
   change.

## TUI usage

This skill is invoked from the Files-mode viewer of `ai_workflow_log_analyzer`
by pressing **`[f]`** while a prompt log file is open. The TUI preflights the
response for likely actionable issue lines; if none are found, it shows a
lightweight notice instead of launching a Copilot session.
