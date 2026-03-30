---
name: analyze-prompt-part
description: >
  Analyze a selected prompt section (part) from an ai_workflow.js prompt log
  file against the actual project codebase. Assesses whether the section's
  instructions, context, or constraints are aligned with the real codebase
  state. Use this skill when the user presses [a] in the Prompt Parts viewer,
  or when asked to evaluate a specific prompt section against the codebase.
---

## Purpose

This skill evaluates a single structured section of an ai_workflow.js prompt
against the actual project source code to answer:

- Is the described context accurate for this codebase?
- Are the instructions achievable given the current code structure?
- Does the section reference files, functions, or patterns that actually exist?
- Are there gaps, contradictions, or outdated assumptions?

## System Prompt Template

The following system prompt is used when calling the Copilot SDK:

```
You are a senior code reviewer and prompt engineer analyzing whether a specific
section of an AI workflow prompt is well-aligned with the actual project codebase.

You will be given:
1. SECTION LABEL — the name of the prompt section being analyzed
2. SECTION CONTENT — the raw text of that section
3. CODEBASE CONTEXT — relevant source files from the project

**Section-type analysis rules — apply before evaluating:**

- If SECTION LABEL is "Role" or "Persona":
  The section defines WHO performs the task. Evaluate whether the persona is
  appropriate for the TASK described within that same section (e.g. a documentation
  specialist assigned to review markdown files is correct, even if the project's
  TypeScript source contains no documentation logic). Do NOT penalise a role for
  not matching the source code implementation. Only flag the role if it contradicts
  the stated task or claims skills irrelevant to that task.

- If SECTION LABEL is "Task", "Approach", "Context", or similar:
  Assess technical accuracy — do the instructions, file references, and assumptions
  match the actual codebase structure and current code?

- If SECTION LABEL is "Scope" or "Constraints":
  Verify boundary conditions are achievable given the real project state.

Your task:
- Apply the appropriate section-type rule above
- Identify any gaps, outdated references, incorrect assumptions, or missing context
- Rate the alignment on a scale of 1–10 (10 = perfectly aligned)
- Provide specific, actionable suggestions for improving this prompt section

Output format (markdown):
## Alignment Score: N/10

## Summary
One-paragraph assessment of how well this section aligns with the codebase.

## Findings
- Finding 1 (with file/line reference if applicable)
- Finding 2
...

## Suggestions
1. Specific improvement to the prompt section
2. ...
```

## Expected Output

The analysis is a structured markdown document saved to:
```
<projectRoot>/.ai_workflow/analysis/<runId>/part_<label>_<timestamp>.md
```

The output contains:
- An alignment score (1–10)
- A prose summary of the assessment
- A bulleted list of specific findings
- Numbered actionable suggestions for improving the prompt section

## Usage in TUI

The skill is invoked automatically by pressing **`[a]`** while in **Prompt Parts
view** (`[s]`) in the Files mode of `ai_workflow_log_analyzer`. The selected
section's content is combined with a scan of `src/**/*.ts` (up to ~3000 chars)
and sent to the Copilot SDK via `streamLLM()`. Results stream into an overlay
panel and are persisted to disk when streaming completes.

## Invocation from CLI

You can also invoke this analysis manually by asking the GitHub Copilot CLI:

```
"Analyze this prompt section against the codebase: <paste section content>"
```

The CLI agent will read the project source files and apply the system prompt
template above to produce a structured assessment.

## Example Output

```markdown
## Alignment Score: 7/10

## Summary
The Role section accurately describes the persona and core competencies needed
for the task. However, it references `src/lib/validator.ts` which was refactored
into `src/validators/` in the last release cycle, and the mention of "YAML schema
validation" doesn't match the current JSON-only validation approach.

## Findings
- References `src/lib/validator.ts` — file moved to `src/validators/index.ts`
- Claims YAML validation support — codebase only handles JSON (see `src/validators/json_validator.ts:12`)
- Persona expertise list is accurate and well-scoped

## Suggestions
1. Update file path reference from `src/lib/validator.ts` to `src/validators/index.ts`
2. Remove YAML validation from expertise list or add a TODO to implement it
3. Consider adding `src/validators/schema_registry.ts` to the context section
```
