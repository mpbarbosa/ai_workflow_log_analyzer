# Architecture

## Overview

`ai_workflow_log_analyzer` is a **standalone TypeScript/Ink TUI tool** that reads `.ai_workflow/logs/` directories
produced by [ai_workflow.js](https://github.com/mpbarbosa/ai_workflow.js) and surfaces failures, bugs, prompt quality
issues, and performance regressions in an interactive terminal dashboard.

### Run Directory Structure

Every `workflow_YYYYMMDD_HHMMSS/` directory must contain a `run_metadata.json` file so the analyzer can identify its source project:

```text
workflow_YYYYMMDD_HHMMSS/
├── run_metadata.json        ← { projectRoot, runId, timestamp }
├── workflow.log             ← main text log (timestamp-prefixed lines)
├── steps/
│   ├── step_01.log
│   └── step_02.log
└── prompts/
    └── step_01/
        └── 001_persona.md
```

`run_metadata.json` shape:

```json
{
  "projectRoot": "/absolute/path/to/project",
  "runId": "workflow_YYYYMMDD_HHMMSS",
  "timestamp": "2026-03-29T20:45:19.000Z"
}
```

The parser tolerates a missing `run_metadata.json` (backward compatibility); `AnalysisReport.projectRoot` will be
`undefined` in that case. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full log format contract.

The codebase is split into two halves that share types but otherwise have no circular dependencies:

```text
src/
├── parsers/         ← Read & parse raw log/prompt/metrics files from disk
├── analyzers/       ← Pure functions: detect issues from parsed data
├── lib/             ← Orchestration (pipeline) + Copilot SDK wrapper
├── reporters/       ← Headless output: JSON, Markdown
├── types/           ← Shared TypeScript interfaces (no logic)
└── tui/             ← Ink/React interactive dashboard
    ├── components/  ← All Ink components
    ├── hooks/       ← Custom React hooks
    └── App.tsx      ← Root component: all keyboard routing + mode state
```

---

## Half 1: Headless Analysis Pipeline

### Parsers (`src/parsers/`)

| File | Responsibility |
|------|---------------|
| `log_parser.ts` | Reads `.jsonl` step log files → `AnyLogEvent[]`; exports `AnyLogEvent` union type |
| `prompt_parser.ts` | Reads `prompts/step_XX/*.md` → `PromptRecord[]`; also exports `parsePromptParts()` for section parsing |
| `metrics_parser.ts` | Reads `metrics/*.json` → `MetricsData` |

### Analyzers (`src/analyzers/`)

All analyzers are **pure functions** — they take parsed data and return `Issue[]`:

| File | What it detects |
|------|----------------|
| `failure_analyzer.ts` | Step failures, errors, non-zero exit codes |
| `performance_analyzer.ts` | Slow steps, high LLM latency, memory spikes |
| `bug_analyzer.ts` | Retries, malformed output, parse errors |
| `prompt_quality_analyzer.ts` | LLM-scored prompt quality (calls Copilot SDK) |

### Pipeline (`src/lib/pipeline.ts`)

`runAnalysisPipeline(runDir, metricsDir, opts)` orchestrates:

1. **Parse** — parallel: `parseRunLogsToArray`, `parseRunPrompts`, `parseMetrics`
2. **Analyze** — synchronous: failures, performance, bugs
3. **Prompt quality** — optional, sequential (SDK rate limits)
4. **Aggregate** — flatten issues, compute counts
5. **Summarize** — optional LLM executive summary

Progress reported via `opts.onProgress(phase, done, total)`.

### Copilot SDK (`src/lib/copilot_client.ts`)

Typed wrapper around `@github/copilot-sdk`. **Session lifecycle per call** — each function creates its own `CopilotClient` + session, waits for `idle` event, then destroys both. Never reuse sessions.

Key exported functions:

- `analyzeWithLLM(req)` — one-shot request → `LlmResponse`
- `streamLLM(req, signal?)` — async generator → `StreamChunk` stream (supports `AbortSignal`)
- `analyzePromptQuality(persona, model, prompt, response)` — returns `{ score, feedback, suggestions }`
- `summarizeReport(reportJson)` — 3–5 sentence executive summary
- `analyzePromptPartVsCodebase(part, projectRoot)` — streams analysis of a prompt section vs codebase

### Reporters (`src/reporters/`)

| File | Output |
|------|--------|
| `json_reporter.ts` | `toJson(report)` → JSON string |
| `markdown_reporter.ts` | `toMarkdown(report)` → Markdown string |

---

## Half 2: Ink TUI

### Root Component (`src/tui/App.tsx`)

Manages all state and keyboard routing. Two top-level modes:

| Mode | `focusedPanel` options | Activated by |
|------|----------------------|-------------|
| `analysis` | `runs`, `issues`, `metrics`, `detail` | default, `[v]` |
| `files` | `runs`, `filetree`, `fileviewer` | `[v]` |

Key state variables:

- `mode`, `focusedPanel` — current view
- `promptSplitMode` — split prompt/response view (`[p]`)
- `promptPartsMode` — navigable prompt sections view (`[s]`)
- `promptZoomedPane` — full-screen pane in split mode (`[z]`)
- `showPartAnalysis` — part analysis overlay active (`[a]`)

### Components (`src/tui/components/`)

| Component | Purpose |
|-----------|---------|
| `Header.tsx` | Top bar: project name, run ID, status badge |
| `StatusBar.tsx` | Bottom bar: context-sensitive keyboard hints + right-side status |
| `RunSelector.tsx` | Left panel: scrollable list of discovered workflow runs |
| `IssuesPanel.tsx` | Filterable issue list with severity/category icons |
| `MetricsPanel.tsx` | ASCII bar charts for step durations and LLM latency |
| `DetailOverlay.tsx` | Full-screen issue drill-down |
| `LLMStreamPanel.tsx` | Streaming LLM re-analysis panel |
| `FileTree.tsx` | Recursive file tree navigator |
| `FileViewer.tsx` | Read-only file viewer with log line colouring; routes `.md` to `MarkdownRenderer` |
| `PromptSplitViewer.tsx` | Side-by-side prompt/response panes with zoom |
| `PromptPartsViewer.tsx` | Navigable prompt section list + markdown content pane |
| `PartAnalysisOverlay.tsx` | Streaming Copilot analysis of a selected prompt section |
| `MarkdownRenderer.tsx` | Renders markdown to Ink JSX (headings, code blocks, lists, etc.) |
| `HelpOverlay.tsx` | Full-screen keyboard shortcut reference |

### Hooks (`src/tui/hooks/`)

| Hook | Purpose |
|------|---------|
| `useRunSelector.ts` | Scans `.ai_workflow/logs/` for `workflow_*` dirs; manages selection |
| `useAnalysis.ts` | Drives `runAnalysisPipeline`; manages state machine (`idle`→`running`→`done`/`error`) |
| `useFileTree.ts` | Reads directory tree for selected run; manages expand/collapse/selection |

### Cross-Component Communication

Ink does not support React refs for scroll/navigation. Scrollable components expose handlers on `globalThis`:

| Global | Exposed by | Methods |
|--------|-----------|---------|
| `__fileViewerScroll` | `FileViewer` | `up`, `down`, `pageUp`, `pageDown`, `jumpStart`, `jumpEnd` |
| `__promptSplitScroll` | `PromptSplitViewer` | same + pane switching |
| `__promptPartsScroll` | `PromptPartsViewer` | same + `prevPart`, `nextPart`, `getSelectedPart` |

`App.tsx` reads these from key handlers via `(globalThis as Record<string, unknown>)[target]`.

---

## Files Mode — Three View States

```text
FILES MODE
──────────

State 1: Tree only           State 2: Tree + FileViewer     State 3: PARTS / SPLIT
┌──────┬──────────────┐     ┌──────┬───────────────────┐   ┌───────────────────────┐
│ Runs │  File Tree   │     │ Runs │ Tree │  Viewer     │   │ Runs │ [Sections][Content]
└──────┴──────────────┘     └──────┴──────┴─────────────┘   └───────────────────────┘
                                    (file open)              (promptPartsMode / zoom)
```

---

## Data Flow Diagram

```text
.ai_workflow/logs/workflow_*/
  step_XX.jsonl        →  log_parser      → AnyLogEvent[]
  prompts/step_XX/*.md →  prompt_parser   → PromptRecord[]
.ai_workflow/metrics/  →  metrics_parser  → MetricsData

                           pipeline.ts
                         ┌─────────────┐
  AnyLogEvent[]     ─→   │ failure_    │
  PromptRecord[]    ─→   │ perf_       │  → Issue[]  →  AnalysisReport
  MetricsData       ─→   │ bug_        │
  (optional SDK)    ─→   │ prompt_     │
                         └─────────────┘
                                ↓
                    TUI (App.tsx) or Reporter (JSON/MD)
```

---

## Key Conventions

1. **`.js` extensions on all imports** — `module: NodeNext` requires `.js` even for `.ts` source files
2. **`AnyLogEvent`** lives in `src/parsers/log_parser.ts`, not `src/types/index.ts`
3. **Unused parameters** prefixed with `_` (ESLint rule)
4. **Test fixtures** in `test/fixtures/sample_run/` — minimal `.jsonl` files for unit tests
5. **`tsconfig.json` excludes** `test/` from compilation (tested via Jest/ts-jest only)
6. **Copilot SDK per-call lifecycle** — create `CopilotClient` + session, use, destroy; never reuse
7. **`tsx` required** — `@github/copilot-sdk` → `vscode-jsonrpc/node` breaks bare `node` ESM resolution
8. **Prompt file format** — `**Label**:` or `**Label:**` at line start marks section boundaries; `parsePromptParts()` handles both

---

## Testing Strategy

Tests live in `test/` and mirror the `src/` layout. `tsconfig.json` excludes `test/` from compilation;
tests are executed directly by `ts-jest` (ESM preset) via `jest.config.mjs`.

### Layout

```text
test/
├── fixtures/sample_run/        ← minimal fixture logs used by integration tests
│   ├── run_metadata.json
│   ├── workflow.log
│   ├── steps/
│   └── prompts/
├── analyzers/                  ← one test file per analyzer
├── parsers/                    ← one test file per parser
├── reporters/                  ← reporter serialisation tests
├── lib/                        ← pipeline and copilot_client tests
└── index.test.ts               ← smoke test for the CLI entry point
```

### Running tests

```bash
npm test                                          # all tests
npm test -- --testPathPattern=analyzers           # single folder
npm test -- --testNamePattern="analyzes failures" # single test by name
```

### Writing tests

- Import from `../../src/module.js` (`.js` extension required even in test files)
- Use `import.meta.url` + `fileURLToPath` instead of `__dirname` for fixture paths:

  ```typescript
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const FIXTURE_DIR = join(__dirname, '../fixtures/sample_run');
  ```

- In ESM mode, use `jest.unstable_mockModule()` + a dynamic `await import()` instead of `jest.mock()`.
  Import `jest` from `@jest/globals`, not the global.
- Analyzer tests should cover the zero-issue case (clean events) and at least one issue-producing case.
- Parser tests should use `test/fixtures/sample_run/` rather than synthetic strings where possible.

---

## Error Handling Patterns

### Parser errors — tolerated locally

Each parser (`log_parser`, `prompt_parser`, `metrics_parser`) handles malformed input
by skipping bad lines/files rather than throwing. A missing `run_metadata.json` returns
`{ projectRoot: undefined }` (backward compat with pre-0.3.0 logs). Parsers never crash
the pipeline.

### Pipeline errors — surfaced as rejection

`runAnalysisPipeline()` does not catch errors internally. If a parser throws an unexpected
error (e.g. filesystem permission denied) or an LLM call rejects, the returned `Promise`
rejects. Callers must handle this.

### TUI error state — `useAnalysis` state machine

The `useAnalysis` hook wraps `runAnalysisPipeline()` in a try/catch and maps outcomes to
`state: 'error'`. The caught error message is stored in the `error` field and displayed by
`App.tsx` in a full-screen error panel. The user can press `r` to retry.

```text
idle ──run()──► running ──success──► done
                        └──catch───► error ──run()──► running
```

### LLM errors — skipped with partial results

`analyzeAllPrompts()` uses `Promise.all`, so a single LLM failure rejects the whole batch.
The pipeline catches this at the prompt-quality phase and continues with `promptQuality: []`
rather than failing the entire report. The same applies to `summarizeReport()`.

---

## Related Documents

- [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md) — numbered FRs that this architecture implements
- [CHANGELOG.md](CHANGELOG.md) — version history and release notes
- [CONTRIBUTING.md](CONTRIBUTING.md) — documentation standards, versioning rules, terminology glossary
- [API.md](API.md) — programmatic API reference for pipeline, analyzers, reporters, and copilot client
- [GETTING_STARTED.md](GETTING_STARTED.md) — contributor onboarding and extension guide

---

*Applies to **v0.2.2**. Update this line whenever the package version is bumped.*
