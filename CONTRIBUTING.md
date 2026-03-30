# Contributing

## Overview

This document defines documentation standards, versioning conventions, and terminology for `ai_workflow_log_analyzer`.
All contributors — human and AI — should follow these standards to keep the codebase consistent.

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

- **PATCH** — bug fixes, doc corrections, test additions
- **MINOR** — new features, new CLI flags, new analyzer/reporter
- **MAJOR** — breaking changes to the log format contract, CLI interface, or public API

---

## Cross-Reference Conventions

Docs should link to each other as follows:

| From | Links to |
|------|----------|
| `README.md` | ARCHITECTURE.md, FUNCTIONAL_REQUIREMENTS.md, CHANGELOG.md, CONTRIBUTING.md |
| `ARCHITECTURE.md` | FUNCTIONAL_REQUIREMENTS.md, CHANGELOG.md |
| `FUNCTIONAL_REQUIREMENTS.md` | ARCHITECTURE.md, CHANGELOG.md |
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
