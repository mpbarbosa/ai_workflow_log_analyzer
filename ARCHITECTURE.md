# Architecture

## Overview

`ai_workflow_log_analyzer` is a **standalone TypeScript/Ink TUI tool** that reads `.ai_workflow/logs/` directories produced by [ai_workflow.js](https://github.com/mpbarbosa/ai_workflow.js) and surfaces failures, bugs, prompt quality issues, and performance regressions in an interactive terminal dashboard.

The codebase is split into two halves that share types but otherwise have no circular dependencies:

```
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

```
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

```
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
