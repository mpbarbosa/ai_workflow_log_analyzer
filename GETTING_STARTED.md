# Getting Started (Contributors)

This guide is for developers who want to contribute to or extend `ai_workflow_log_analyzer`.
For installation and end-use, see [README.md](README.md).

---

## Prerequisites

- **Node.js ≥ 18** — `node --version`
- **npm ≥ 9** — `npm --version`
- **GitHub Copilot CLI** authenticated — `gh copilot --version` (required only for
  LLM-assisted features; offline dev is possible with `--skip-prompt-quality`)

---

## Setup

```bash
git clone https://github.com/your-org/ai_workflow_log_analyzer
cd ai_workflow_log_analyzer
npm install
```

Verify the setup passes all tests:

```bash
npm test
```

> Tests that exercise the Copilot SDK are mocked — no network access is required.

---

## Common Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev -- --help` | Print all CLI flags, arguments, and usage examples |
| `npm run dev -- --tui /path/to/project` | Run the TUI without building (uses `tsx`) |
| `npm run dev -- --json /path/to/project` | Run headless JSON output without building |
| `npm run build` | Compile `src/` → `dist/` |
| `npm run type:check` | Type-check without emitting (`tsc --noEmit`) |
| `npm test` | Run all tests |
| `npm test -- --testPathPatterns=parsers` | Run a single test folder |
| `npm test -- --testNamePattern="analyzes failures"` | Run a single test by name |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |

> **Never use bare `node`** to run TypeScript source. Always use `npm run dev` (which uses `tsx`)
> because `@github/copilot-sdk` → `vscode-jsonrpc/node` breaks Node's strict ESM resolver.

---

## Project Layout

```text
src/
├── types/index.ts              ← shared interfaces and DEFAULT_THRESHOLDS
├── parsers/                    ← log_parser, prompt_parser, metrics_parser
├── analyzers/                  ← one file per issue category
├── lib/
│   ├── pipeline.ts             ← runAnalysisPipeline() orchestrator
│   └── copilot_client.ts       ← @github/copilot-sdk wrapper
├── reporters/                  ← json_reporter, markdown_reporter
└── tui/
    ├── App.tsx                 ← root Ink component
    ├── components/             ← all Ink panels and overlays
    └── hooks/                  ← useAnalysis, useRunSelector, useFileTree
test/
├── fixtures/sample_run/        ← minimal fixture logs for integration tests
├── analyzers/                  ← unit tests per analyzer
├── parsers/                    ← unit tests per parser
├── reporters/                  ← unit tests per reporter
└── lib/                        ← pipeline and copilot_client tests
```

---

## Adding a New Analyzer

Analyzers are pure synchronous functions: `(events: AnyLogEvent[]) => Issue[]`.

### 1. Create the source file

```typescript
// src/analyzers/my_analyzer.ts

/**
 * My Analyzer — detects <describe what it detects>.
 * @module analyzers/my_analyzer
 */

import type { AnyLogEvent } from '../parsers/log_parser.js';
import type { Issue } from '../types/index.js';

let _counter = 0;
const nextId = () => `my-${++_counter}`;

/**
 * Detects <something> in the event stream.
 */
export function analyzeMyThing(events: AnyLogEvent[]): Issue[] {
  const issues: Issue[] = [];
  // ... detection logic ...
  return issues;
}
```

### 2. Plug it into the pipeline

In `src/lib/pipeline.ts`, import and call the new function alongside the existing analyzers:

```typescript
import { analyzeMyThing } from '../analyzers/my_analyzer.js';

// Inside runAnalysisPipeline():
const myIssues = analyzeMyThing(events);

// Add to the issues array:
issues: [...failures, ...perfIssues, ...bugs, ...docIssues, ...myIssues, ...promptIssues],
```

### 3. Register the category

If your analyzer introduces a new `IssueCategory` value, add it to the union in `src/types/index.ts`:

```typescript
export type IssueCategory = 'failure' | 'performance' | 'bug' | 'documentation' | 'prompt_quality' | 'my_thing';
```

Then update the `CATEGORY_LABEL` and `SEVERITY_ICON` maps in `src/reporters/markdown_reporter.ts`
so the Markdown reporter can render it.

### 4. Write tests

Add `test/analyzers/my_analyzer.test.ts`. Use the fixture files in
`test/fixtures/sample_run/` or create inline event arrays:

```typescript
import { describe, it, expect } from '@jest/globals';
import { analyzeMyThing } from '../../src/analyzers/my_analyzer.js';

describe('analyzeMyThing', () => {
  it('returns empty array for clean events', () => {
    expect(analyzeMyThing([])).toEqual([]);
  });
});
```

---

## Adding a New Reporter

Reporters consume an `AnalysisReport` and produce output (string or file).

### 1. Create the reporter source file

```typescript
// src/reporters/csv_reporter.ts

/**
 * CSV Reporter — serialises an AnalysisReport as comma-separated values.
 * @module reporters/csv_reporter
 */

import type { AnalysisReport } from '../types/index.js';

/** Serialises the report's issues as a CSV string. */
export function toCsv(report: AnalysisReport): string {
  const header = 'id,category,severity,title';
  const rows = report.issues.map(
    (i) => `${i.id},${i.category},${i.severity},"${i.title.replace(/"/g, '""')}"`
  );
  return [header, ...rows].join('\n');
}
```

### 2. Wire up the CLI flag (optional)

In `src/bin/analyze-logs.ts`, add a new `--csv` flag via `commander` and call
`toCsv()` + write to disk, following the pattern used by `--json` and `--md`.

---

## Extending the TUI

The TUI is an [Ink](https://github.com/vadimdemedes/ink) + React application rooted at
`src/tui/App.tsx`. Key extension points:

### Adding a new panel

1. Create `src/tui/components/MyPanel.tsx` with a standard Ink `Box`/`Text` layout.
2. Import and render it in `App.tsx` inside the appropriate mode branch (`analysis` or `files`).
3. Add its `PanelId` to the `PanelId` union in `src/types/index.ts`.
4. Add a `Tab`/`Shift+Tab` case in `App.tsx`'s `handleKeyInput` to route focus to it.
5. Update the `StatusBar` hints for the new panel.

### Adding scrollable content

Ink has no ref-based scroll control. Follow the `globalThis` scroll handler pattern:

```typescript
// In your component:
useEffect(() => {
  globalThis.__myPanelScroll = { up: () => setOffset(o => Math.max(0, o - 1)), down: ... };
  return () => { delete globalThis.__myPanelScroll; };
}, []);
```

Then read `globalThis.__myPanelScroll` in `App.tsx`'s keyboard handler.

### Adding a new hook

Place hooks in `src/tui/hooks/`. Each hook should be a single responsibility:
`useMyFeature.ts` → default export `useMyFeature()`.

---

## Running Against Real Logs

Point the dev server at any `ai_workflow.js` project that has a `.ai_workflow/logs/` directory:

```bash
npm run dev -- --tui /path/to/your/ai_workflow_project
```

Use `--skip-prompt-quality` to skip LLM calls during rapid iteration:

```bash
npm run dev -- --tui /path/to/project --skip-prompt-quality
```

---

*See [ARCHITECTURE.md](ARCHITECTURE.md) for a full system design walkthrough.*  
*See [API.md](API.md) for programmatic API reference.*  
*See [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards, versioning, and terminology.*
