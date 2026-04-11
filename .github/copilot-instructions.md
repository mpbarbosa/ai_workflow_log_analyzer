# Copilot Instructions

## Commands

```bash
npm run dev -- --tui /path/to/ai-workflow-project   # TUI without building
npm run build                                         # compile src/ → dist/
npm run type:check                                    # tsc --noEmit
npm test                                              # all tests
npm test -- --testPathPattern=parsers                # single test file/folder
npm test -- --testNamePattern="extracts persona"     # single test by name
npm run lint
npm run lint:fix
```

> **Never run with bare `node`.**  
> `@github/copilot-sdk` transitively imports `vscode-jsonrpc/node` (no `.js` extension), which breaks Node's strict ESM resolver. Always use `tsx` — the `dev` and `start` scripts already do this. The shebang in `src/bin/analyze-logs.ts` is `#!/usr/bin/env tsx` for the same reason.

---

## Architecture

The tool has two independent halves that share the type system in `src/types/index.ts`:

### 1. Analysis pipeline (headless)

```
CLI (src/bin/analyze-logs.ts)
  └─ runAnalysisPipeline() in src/lib/pipeline.ts
       ├─ Parsers:   log_parser → LogEvent[]
       │              prompt_parser → PromptRecord[]
       │              metrics_parser → MetricsData
       ├─ Analyzers: failure_analyzer, performance_analyzer,
       │              bug_analyzer, prompt_quality_analyzer
       │              (prompt_quality calls @github/copilot-sdk via copilot_client.ts)
       └─ Reporters: json_reporter / markdown_reporter → AnalysisReport
```

The pipeline can be run without the TUI via `--json` or `--md` flags.

### 2. Interactive TUI (Ink/React)

`src/tui/App.tsx` is the root component. It hosts two modes:

| Mode | Panels | Toggle |
|------|--------|--------|
| `analysis` | RunSelector · IssuesPanel · MetricsPanel · DetailOverlay | `v` |
| `files` | RunSelector · FileTree · FileViewer / PromptSplitViewer | `v` |

Panel focus cycles via `Tab`/`Shift+Tab`. The focused panel ID is stored in `focusedPanel` state and drives both the keyboard routing and the StatusBar hints.

**Files mode has three layout states:**

1. No file open → FileTree fills the full width
2. File open → FileTree sidebar (30 col) + FileViewer
3. Prompt file + `[p]` → FileTree sidebar + PromptSplitViewer  
   `[z]` hides the sidebar and zooms the focused pane to full width

**Prompt files** are any `.md` files under a `prompts/` directory. `isPromptFile()` is exported from `src/tui/components/PromptSplitViewer.tsx`.

### Pipeline orchestration (`src/lib/pipeline.ts`)

`runAnalysisPipeline(runDir, metricsDir, opts)` is the single entry point for all analysis:

1. Runs all three parsers **in parallel** with `Promise.all`
2. Runs the three non-LLM analyzers synchronously (pure functions over `LogEvent[]`)
3. Optionally runs `analyzeAllPrompts()` — LLM-assisted, skippable via `skipPromptQuality`
4. Optionally calls `summarizeReport()` for an executive summary — skippable via `skipSummary`

`skipPromptQuality: true` also implies `skipSummary: true` in `useAnalysis`. Pass both when running offline or in CI without Copilot access.

`metricsDir` is always `<projectRoot>/.ai_workflow/metrics/`. If it doesn't exist, `parseMetrics()` returns `{ history: [] }` and the pipeline synthesises a minimal `RunMetrics` from the parsed log events.

### `useAnalysis` hook (`src/tui/hooks/useAnalysis.ts`)

Wraps `runAnalysisPipeline` with React state for the TUI:

```typescript
const { state, report, error, progress, filter, filteredIssues, run, cycleFilter } = useAnalysis(thresholds);
```

- `state`: `'idle' | 'running' | 'done' | 'error'`
- `run(runInfo, projectRoot, skipPromptQuality)` — starts analysis; resets `report` and `error` first
- `filteredIssues` — derived from `report.issues` filtered by the current `filter` value
- `cycleFilter()` — rotates `all → failure → performance → bug → prompt_quality`
- `progress.phase` is shown in the TUI header while analysis is running

### `useRunSelector` hook (`src/tui/hooks/useRunSelector.ts`)

Discovers run directories matching `workflow_YYYYMMDD_HHMMSS` under `<aiWorkflowDir>/logs/`, sorted newest-first by `birthtime`. `selectedRun` is the highlighted `RunInfo`. Analysis is triggered by `App.tsx` when the user presses `Enter` on a run — the hook itself only handles discovery and selection.

### Reporters (`src/reporters/`)

Both reporters consume `AnalysisReport` directly:

- `toJson(report)` → formatted JSON string; `writeJsonReport(report, path)` for file output
- `toMarkdown(report)` → Markdown string; `writeMarkdownReport(report, path)` for file output

The Markdown reporter renders issues grouped by category (`failure → performance → bug → prompt_quality`) with a `█░` score bar for prompt quality results and evidence collapsed in `<details>`. To add a new issue category, update both `SEVERITY_ICON` and `CATEGORY_LABEL` maps in `markdown_reporter.ts`.

### Scroll state pattern

Ink doesn't support refs for imperative control. Scrollable components (`FileViewer`, `PromptSplitViewer`) expose their scroll handlers via `globalThis`:

```typescript
globalThis.__fileViewerScroll   = { up, down, pageUp, pageDown, jumpStart, jumpEnd }
globalThis.__promptSplitScroll  = { up, down, pageUp, pageDown, jumpStart, jumpEnd }
```

`App.tsx` reads these objects from keyboard handlers rather than prop-drilling callbacks.

---

## Documentation Standards

**This is a developer-facing tool** — all documentation targets internal contributors and AI agents. **There are no external end-users: do not create "User Guides", end-user tutorials, or FAQs aimed at the general public.** When writing prose documentation, assume the reader is a developer who is new to the codebase and needs to understand the *why*, not just the *what*.

### Documentation files

| File | Primary audience |
|------|-----------------|
| `README.md` | Anyone installing or running the CLI — installation, quick-start, feature overview |
| `ARCHITECTURE.md` | Internal contributors and AI agents — system design, component relationships |
| `FUNCTIONAL_REQUIREMENTS.md` | Internal contributors and AI agents — feature specifications and constraints |
| `CONTRIBUTING.md` | Internal contributors and AI agents — standards, conventions, and terminology |
| `.github/copilot-instructions.md` | AI agents (GitHub Copilot, workflow LLMs) — canonical project context |
| Inline JSDoc / TSDoc | Any developer using the package — IDE hover docs, AI autocomplete context |

Refer to `CONTRIBUTING.md` § "Documentation Audience" for the authoritative audience table. The key code documentation rules are:

- Every `src/` file must open with a JSDoc module header (`/** … @module path/to/module */`)
- Every exported function, class, and interface needs a JSDoc block (one-liner is fine when the signature is self-explanatory)
- Inline comments only where the *why* is non-obvious — never restate what the code does
- See `CONTRIBUTING.md` § "Code Documentation Standards" for full rules and examples

**Before making documentation changes**, review `README.md` and `CONTRIBUTING.md` to ensure any new content is consistent with existing conventions and does not duplicate what is already documented.

**Terminology**: canonical term definitions live in `CONTRIBUTING.md` § "Terminology Glossary". Use those terms consistently in code, comments, and docs.

---

## Key Conventions

### ESM imports require `.js` extensions

TypeScript source imports `.ts` files but the extension must be written as `.js`:

```typescript
import { parsePromptFileContent } from '../parsers/prompt_parser.js';  // ✅
import { parsePromptFileContent } from '../parsers/prompt_parser.ts';  // ❌
```

This is required by `module: NodeNext` + `moduleResolution: NodeNext` in `tsconfig.json`. All existing imports follow this.

### `AnyLogEvent` lives in the parser, not in types

`AnyLogEvent` is a discriminated union defined in `src/parsers/log_parser.ts` (it needs concrete knowledge of all event shapes from that file). Import it from there:

```typescript
import { type AnyLogEvent } from '../parsers/log_parser.js';  // ✅
import { type AnyLogEvent } from '../types/index.js';          // ❌ doesn't exist
```

### Unused parameters must be prefixed `_`

ESLint rule: `'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]`. All unused function parameters must be named `_foo`.

### Test fixtures

Integration tests read real log data from `test/fixtures/sample_run/`. Tests that exercise file I/O should use this path via `import.meta.url`:

```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/sample_run');
```

### Test files are excluded from compilation

`tsconfig.json` excludes `test/`. Tests are run directly by `ts-jest` (ESM preset). Tests import from `../../src/module.js` (note `.js` extension even in test files).

### Threshold defaults are co-located with types

`DEFAULT_THRESHOLDS` is exported from `src/types/index.ts` alongside `ThresholdConfig`. The CLI merges user config over the defaults (shallow merge). Analyzers receive a resolved `ThresholdConfig` — never the raw CLI options.

### `@github/copilot-sdk` session lifecycle

Each LLM call in `copilot_client.ts` creates its own `CopilotClient` + session, waits for the `idle` event to collect the full response, then destroys both. Do not reuse sessions across calls; the SDK is not designed for that.

### Prompt markdown format

Prompt `.md` files follow a strict format parsed by `parsePromptFileContent()`:

```markdown
# Prompt Log
**Timestamp:** <ISO>
**Persona:** <name>
**Model:** <model-id>

## Prompt
```

<prompt text>
```

## Response

```
<response text>
```

```

`parsePromptFileContent()` returns `null` for any file that doesn't match. The split viewer checks this at load time and shows an error pane rather than crashing.
