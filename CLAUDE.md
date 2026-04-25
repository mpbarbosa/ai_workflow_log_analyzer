# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev -- --tui /path/to/ai-workflow-project   # run TUI without building (uses tsx)
npm run build                                         # tsc → dist/
npm run type:check                                    # tsc --noEmit
npm test                                              # all tests
npm test -- --testPathPattern=parsers                # single folder
npm test -- --testNamePattern="extracts persona"     # single test by name
npm run test:coverage                                 # with coverage report
npm run lint
npm run lint:fix
npm run verify                                        # lint + type-check + build + tests (CI equivalent)
npm run test:docker                                   # build verify image and run tests in Docker
```

**Never run with bare `node`.** `@github/copilot-sdk` transitively imports `vscode-jsonrpc/node` without a `.js` extension, which breaks Node's strict ESM resolver. Always use `tsx` — the `dev`/`start` scripts already do this.

## Architecture

The tool has two independent halves that share the type system in `src/types/index.ts`.

### Half 1: Headless Analysis Pipeline

```
src/bin/analyze-logs.ts
  └─ runAnalysisPipeline() in src/lib/pipeline.ts
       ├─ Parsers (parallel):   log_parser → AnyLogEvent[]
       │                        prompt_parser → PromptRecord[]
       │                        metrics_parser → MetricsData
       ├─ Analyzers (pure fns): failure_analyzer, performance_analyzer, bug_analyzer
       │                        prompt_quality_analyzer (optional, calls Copilot SDK)
       └─ Reporters:            json_reporter / markdown_reporter → AnalysisReport
```

The pipeline can run headlessly via `--json` or `--md` flags. `skipPromptQuality: true` also implies `skipSummary: true`; pass both for offline/CI runs.

### Half 2: Ink/React TUI

`src/tui/App.tsx` is the root. It manages all state and keyboard routing across two modes:

| Mode | Panels | Toggle |
|------|--------|--------|
| `analysis` | RunSelector · IssuesPanel · MetricsPanel · DetailOverlay | `v` |
| `files` | RunSelector · FileTree · FileViewer / PromptSplitViewer | `v` |

**Files mode layout states:** tree-only → tree + FileViewer → tree + PromptSplitViewer (prompt `.md` files under `prompts/` + `[p]`). `[z]` zooms the active pane to full width.

**Scroll state pattern:** Ink doesn't support refs for imperative control. Scrollable components expose handlers on `globalThis` (`__fileViewerScroll`, `__promptSplitScroll`, `__promptPartsScroll`). `App.tsx` reads these from key handlers.

### Key Files

- `src/lib/pipeline.ts` — single entry point for all analysis; orchestrates parsers → analyzers → reporters
- `src/lib/copilot_client.ts` — typed wrapper around `@github/copilot-sdk`; **session lifecycle per call** (create `CopilotClient` + session, use, destroy; never reuse)
- `src/tui/hooks/useAnalysis.ts` — state machine (`idle → running → done/error`) wrapping `runAnalysisPipeline`
- `src/tui/hooks/useRunSelector.ts` — discovers `workflow_YYYYMMDD_HHMMSS/` dirs under `.ai_workflow/logs/`
- `src/types/index.ts` — shared interfaces + `DEFAULT_THRESHOLDS` (analyzers receive resolved `ThresholdConfig`, never raw CLI options)

## Key Conventions

### ESM imports require `.js` extensions

`module: NodeNext` requires `.js` even for `.ts` source files — in `src/` **and** in `test/`:

```typescript
import { parsePromptFileContent } from '../parsers/prompt_parser.js';  // ✅
import { parsePromptFileContent } from '../parsers/prompt_parser.ts';  // ❌
```

### `AnyLogEvent` lives in the parser, not in types

```typescript
import { type AnyLogEvent } from '../parsers/log_parser.js';  // ✅
import { type AnyLogEvent } from '../types/index.js';          // ❌ doesn't exist
```

### Unused parameters must be prefixed `_`

ESLint enforces `argsIgnorePattern: '^_'`. All unused function parameters must be named `_foo`.

## Testing

Tests live in `test/` mirroring `src/`. `tsconfig.json` excludes `test/` from compilation; `ts-jest` (ESM preset) runs them directly.

**Fixture path pattern** (use `import.meta.url`, not `__dirname`):

```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/sample_run');
```

**ESM mocking:** use `jest.unstable_mockModule()` + dynamic `await import()` instead of `jest.mock()`. Import `jest` from `@jest/globals`.

Analyzer tests must cover the zero-issue (clean input) case and at least one issue-producing case.

## Documentation

Every `src/` file opens with a JSDoc module header (`/** … @module path/to/module */`). Every exported function/class/interface needs a JSDoc block. The authoritative audience table and terminology glossary are in `CONTRIBUTING.md`. Canonical term definitions in `CONTRIBUTING.md § "Terminology Glossary"` must be used consistently. This is a **developer-facing tool** — no end-user guides.
