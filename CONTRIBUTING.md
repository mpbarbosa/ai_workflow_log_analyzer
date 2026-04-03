# Contributing

## Overview

This document defines documentation standards, versioning conventions, and terminology for `ai_workflow_log_analyzer`.
All contributors — human and AI — should follow these standards to keep the codebase consistent.

---

## Documentation Audience

Different documentation files in this project serve different readers:

| File | Primary audience |
|------|-----------------|
| `README.md` | Anyone installing or running the CLI — installation, quick-start, feature overview |
| `ARCHITECTURE.md` | Internal contributors and AI agents — system design, component relationships |
| `FUNCTIONAL_REQUIREMENTS.md` | Internal contributors and AI agents — feature specifications and constraints |
| `CONTRIBUTING.md` | Internal contributors and AI agents — standards, conventions, and terminology |
| `API.md` | Internal contributors and AI agents — programmatic API reference for pipeline, analyzers, reporters, and copilot client |
| `GETTING_STARTED.md` | Internal contributors — developer onboarding, dev environment setup, and extension guide |
| `.github/copilot-instructions.md` | AI agents (GitHub Copilot, workflow LLMs) — canonical project context |
| Inline JSDoc / TSDoc | Any developer using the package — IDE hover docs, AI autocomplete context |

**This is a developer-facing tool.** There are no external end-users with separate user guides.
All prose documentation (ARCHITECTURE, FUNCTIONAL_REQUIREMENTS, CONTRIBUTING) targets
internal contributors. When in doubt, write for a developer who is new to the codebase
and needs to understand the *why*, not just the *what*.

---

## Code Documentation Standards

### Module headers

Every source file must open with a JSDoc module header that names the module's responsibility and its `@module` path.

```typescript
/**
 * Bug Analyzer — detects retry patterns, unexpected outcomes, and malformed step output.
 * @module analyzers/bug_analyzer
 */
```

### Exported functions

Every exported function must have a JSDoc block. One-liners are fine for simple functions; use `@param` / `@returns` tags when the signature is not self-explanatory.

```typescript
/**
 * Analyzes log events for bugs.
 */
export function analyzeBugs(events: AnyLogEvent[]): Issue[] { … }

/**
 * Runs the full analysis pipeline on a workflow run directory.
 * @param runDir   - Path to workflow_YYYYMMDD_HHMMSS/ directory
 * @param metricsDir - Path to .ai_workflow/metrics/ directory
 */
export async function runAnalysisPipeline(
  runDir: string,
  metricsDir: string,
  opts: PipelineOptions = {},
): Promise<AnalysisReport> { … }
```

### Interface and type field comments

Document fields that are not obvious from their name and type alone. Prefer inline `/** … */` for short comments; use multi-line `/** … */` when context or examples are needed.

```typescript
export interface PromptRecord {
  /** Inferred from AI call log events; may be undefined if not matched */
  latencyMs?: number;
}

export interface ThresholdConfig {
  /** Step duration threshold in ms; above this is flagged as slow (default: 30000) */
  stepDurationWarningMs: number;
}
```

### Inline comments

Only add inline comments where the *why* is not obvious from the code itself. Do not re-state what the code does.

```typescript
// Track retries per step — group consecutive retry events
const retryCounts = new Map<…>();
```

### What does NOT need a comment

- Private helper functions with self-explanatory names
- Trivial getters / one-line wrappers
- `import` statements

---

## Actionable Output Standards

The analyzer surfaces three canonical categories of bugs. All generated output — issue `title`,
`detail`, and `fixRecommendation` — must target **internal contributors**, not end-users.

### Bug-detection trigger categories

| Category | Trigger condition | Severity |
|----------|------------------|----------|
| Retry patterns | `kind === 'retry'` events with `count >= 2` for the same `stepId` | `high` if retries exhausted; `medium` if eventual success |
| Unexpected outcomes | Log message matches `/(unexpected (result\|outcome\|response)\|mismatch\|assertion failed)/i` | `medium` |
| Malformed output | Log message matches `/(malformed\|invalid json\|parse error\|unexpected token\|syntax error\|failed to parse)/i` | `high` |

### Output authoring rules

All generated output targets **internal contributors and AI agents** (see [Documentation Audience](#documentation-audience)).
There are no external end-users — do not write end-user or product-facing prose.

- Write for a developer debugging a failed workflow run — assume familiarity with the codebase.
- `fixRecommendation` must name the concrete action (e.g. "Add try/catch around JSON.parse"), not
  generic advice.
- Do not include end-user or product-facing language. See [Code Documentation Standards](#code-documentation-standards)
  for the JSDoc module-header convention all source files must follow.

**Example — well-formed issue object:**

```json
{
  "title": "JSON.parse called without try/catch in metrics_parser.ts",
  "detail": "parseMetrics() at src/parsers/metrics_parser.ts:42 calls JSON.parse on raw file content with no error handling. A malformed metrics file will throw an uncaught SyntaxError and crash the pipeline.",
  "fixRecommendation": "Wrap the JSON.parse call in a try/catch and return a safe default (e.g. { history: [] }) on failure, consistent with how log_parser.ts handles parse errors at line 87."
}
```

---

## Version Number Accuracy

This project uses **semantic versioning** (`MAJOR.MINOR.PATCH`).

The single source of truth is **`package.json`**. Whenever the version changes, update all of the following in the same commit:

| File | What to update |
|------|---------------|
| `package.json` | `"version"` field |
| `CHANGELOG.md` | Add a new `## [X.Y.Z] — YYYY-MM-DD` section |
| `ARCHITECTURE.md` | Footer line: `*Applies to **vX.Y.Z**.*` |
| `FUNCTIONAL_REQUIREMENTS.md` | Footer line: `*Applies to **vX.Y.Z**.*` |

Version bumping rules:

- **PATCH** — bug fixes, doc corrections, test additions, documentation-only updates (e.g. rewording, added examples, clarified behaviour)
- **MINOR** — new features, new CLI flags, new analyzer/reporter
- **MAJOR** — breaking changes to the log format contract, CLI interface, or public API

> **Trivial edits** (typo fixes, whitespace, formatting-only changes with no content impact) do **not** require a version bump or a `CHANGELOG.md` entry.

When a documentation change affects system design, component interfaces, or feature specifications,
also review and update `ARCHITECTURE.md` and/or `FUNCTIONAL_REQUIREMENTS.md` in the same commit to keep them consistent.

---

## Cross-Reference Conventions

Docs should link to each other as follows:

| From | Links to |
|------|----------|
| `README.md` | ARCHITECTURE.md, FUNCTIONAL_REQUIREMENTS.md, CHANGELOG.md, CONTRIBUTING.md, API.md, GETTING_STARTED.md |
| `ARCHITECTURE.md` | FUNCTIONAL_REQUIREMENTS.md, CHANGELOG.md, CONTRIBUTING.md, API.md, GETTING_STARTED.md |
| `FUNCTIONAL_REQUIREMENTS.md` | ARCHITECTURE.md, CHANGELOG.md |
| `API.md` | ARCHITECTURE.md, CONTRIBUTING.md |
| `GETTING_STARTED.md` | ARCHITECTURE.md, API.md, CONTRIBUTING.md |
| `CHANGELOG.md` | No outbound doc links required |
| `CONTRIBUTING.md` | No outbound doc links required |

Use relative links (e.g. `[ARCHITECTURE.md](ARCHITECTURE.md)`) so they resolve both in GitHub and local editors.

---

## Log Format Contract

The analyzer consumes log files written by [ai_workflow.js](https://github.com/mpbarbosa/ai_workflow.js). Every run directory **must** contain a `run_metadata.json` file:

```json
{
  "projectRoot": "/absolute/path/to/project",
  "runId": "workflow_YYYYMMDD_HHMMSS",
  "timestamp": "2026-03-29T20:45:19.000Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `projectRoot` | ✅ | Absolute path to the project root on the machine that ran the workflow |
| `runId` | ✅ | Matches the parent directory name (`workflow_YYYYMMDD_HHMMSS`) |
| `timestamp` | ✅ | ISO 8601 start time |

The parser tolerates a missing `run_metadata.json` (backward compatibility with pre-0.3.0 logs), but `AnalysisReport.projectRoot` will be `undefined` in that case.

---

## Terminology Glossary

Use these terms consistently in code, comments, and docs.

| Term | Type | Definition |
|------|------|------------|
| `AnyLogEvent` | Discriminated union | All possible parsed log event shapes. Defined in `src/parsers/log_parser.ts` (not `src/types/`). Import from `../parsers/log_parser.js`. |
| `RunInfo` | Interface | Lightweight descriptor of a discovered run directory: `runId`, `path`, `startTime`, `stepCount`. Used by `useRunSelector`. |
| `Issue` | Interface | A single detected problem with `id`, `category`, `severity`, `title`, `detail`, `evidence`, optional `fixRecommendation`. The core output of all analyzers. |
| `PromptRecord` | Interface | One parsed prompt+response pair from a `prompts/step_XX/*.md` file, including `persona`, `model`, `prompt`, `response`, optional `latencyMs`. |
| `ThresholdConfig` | Interface | User-configurable numeric thresholds for performance and quality. Defaults exported as `DEFAULT_THRESHOLDS` from `src/types/index.ts`. |
| `AnalysisReport` | Interface | The full output of `runAnalysisPipeline()`: `runId`, `metrics`, `issues[]`, `promptQuality[]`, optional `summary`, `counts`, optional `projectRoot`. |
| run directory | Path | A `workflow_YYYYMMDD_HHMMSS/` directory under `.ai_workflow/logs/`. |
| metrics directory | Path | `.ai_workflow/metrics/` in the project root; contains per-run JSON metric snapshots. |
| prompt file | File | Any `.md` file under a `prompts/` subdirectory within a run directory. Detected by `isPromptFile()` from `src/tui/components/PromptSplitViewer.tsx`. |
