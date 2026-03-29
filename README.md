# ai_workflow_log_analyzer

A standalone CLI tool that analyzes [ai_workflow.js](https://github.com/your-org/ai_workflow.js) execution log files, surfacing failures, bugs, prompt quality issues, and performance regressions — powered by the GitHub Copilot SDK.

## Features

- **Failure detection** — CRITICAL events, SDK timeouts, uncaught exceptions
- **Performance analysis** — slow steps, high LLM latency, memory spikes (configurable thresholds)
- **Bug detection** — retry patterns, malformed output, unexpected step outcomes
- **Prompt quality** — LLM-assisted review of every prompt+response pair via Copilot SDK
- **Interactive TUI** — 4-panel Ink/React terminal UI with keyboard navigation
- **Headless output** — `--json` and `--md` modes for CI/scripting

## Requirements

- Node.js ≥ 18
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line) installed and authenticated (`gh copilot --version`)

## Install

```bash
npm install -g ai-workflow-log-analyzer
```

Or run directly with `npx`:

```bash
npx ai-workflow-log-analyzer --tui /path/to/project
```

## Usage

### Interactive TUI (default)

```bash
analyze-logs --tui /path/to/ai-workflow-project
```

### Headless / CI

```bash
# JSON report (stdout or file)
analyze-logs --json report.json /path/to/project

# Markdown report
analyze-logs --md report.md /path/to/project

# Analyze a specific run by ID
analyze-logs --run workflow_20260327_012345 --json /path/to/project

# Skip LLM-assisted prompt quality (faster)
analyze-logs --skip-prompt-quality --md report.md /path/to/project

# Custom thresholds
analyze-logs --threshold-config thresholds.yaml /path/to/project
```

### TUI Layout

```
┌─ ai_workflow Log Analyzer ──────────── Run: workflow_20260326_224118 ─── ●LIVE ─┐
├── RUNS ──────┬──── ISSUES ──────────────────────────────┬──── METRICS ──────────┤
│ > 2026-03-27 │ ✗ [FAIL]  step_05: CRITICAL 51.8s        │  LLM Latency (avg 24s)│
│   2026-03-26 │ ⚠ [PERF]  step_09: 3 retries             │  step_05 ██████████   │
│   2026-03-20 │ ✗ [FAIL]  SDK timeout step_12            │  step_09 ████░░░░░░   │
│   2026-03-15 │ ⚠ [QUAL]  step_06 prompt: 62% quality    │  step_12 ██████░░░░   │
│              │ ⚠ [BUG]   step_11: attempt 2/3 retry     │                       │
│              ├──── DETAIL / LLM ANALYSIS ───────────────┤  Memory Peak: 97.8 MB │
│              │ ▶ Copilot analysis of step_05 prompt…    │                       │
│              │   "The prompt is too broad — missing     │                       │
│              │    explicit success criteria…" streaming │                       │
├──────────────┴──────────────────────────────────────────┴───────────────────────┤
│ [Tab] Panel  [↑↓] Navigate  [Enter] Detail  [f] Filter  [r] Re-analyze  [q] Quit│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Files mode (`v` to toggle)

Press `v` to switch from Analysis mode into **Files mode**, which lets you browse and read raw log files like an IDE.  Three progressively focused states are available:

#### State 1 — Tree only (no file open)

```
┌─ ai_workflow Log Analyzer ──────────────────────────────────── 📂 FILES ─┐
│ Run: workflow_20260327_012345                                              │
├───────────────────────────────────────────────────────────────────────────┤
│ ▶ workflow_20260327_012345/                                                │
│   ▼ steps/                                                                 │
│     ▶ step_01.log                                                          │
│     ▶ step_02.log                                                          │
│   ▼ prompts/                                                               │
│     ▶ step_01/                                                             │
│       ▶ 20260327T0123_1_architect.md                                       │
│   ▶ workflow.log                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│ [Tab] Panel  [↑↓] Navigate  [Enter] Open/Expand  [v] Analysis  [h] Help  │
└───────────────────────────────────────────────────────────────────────────┘
```

Use `↑`/`↓` to navigate and `Enter` to expand directories or open a file.

#### State 2 — Tree + file viewer (file open)

```
┌─ ai_workflow Log Analyzer ──────────────────────────────────── 📂 FILES ─┐
│ Run: workflow_20260327_012345                                              │
├──────────────────┬────────────────────────────────────────────────────────┤
│ ▶ workflow_20260 │  step_02.log                                           │
│   ▼ steps/       │                                                        │
│     ▶ step_01.lo │   1  [2026-03-27T01:24:01Z] ✔ [INFO]  step_02 start   │
│   > step_02.log  │   2  [2026-03-27T01:24:15Z] ✔ [INFO]  LLM response OK │
│     ▶ step_03.lo │   3  [2026-03-27T01:24:15Z] ✗ [WARN]  latency 18.4s   │
│   ▼ prompts/     │   4  [2026-03-27T01:24:16Z] ✔ [INFO]  step_02 end     │
│                  │                                                        │
│                  │                                               100% ▐▌  │
├──────────────────┴────────────────────────────────────────────────────────┤
│ [PgUp/Dn] Scroll  [g/G] Top/Bot  [p] Split Prompt/Response  [Esc] Close  │
└───────────────────────────────────────────────────────────────────────────┘
```

`Esc` closes the viewer and returns focus to the tree.  
For prompt `.md` files (any file under `prompts/`), press `p` to enter split view.

#### State 3a — Prompt split view (`p`)

```
┌─ ai_workflow Log Analyzer ──────────────────────────────────── 📂 FILES ─┐
│ Run: workflow_20260327_012345                                              │
├──────────────────┬──────────────────────────┬─────────────────────────────┤
│ ▶ workflow_20260 │  ▶ PROMPT                │   RESPONSE                  │
│   ▼ prompts/     │                          │                             │
│   > architect.md │  **Role**: You are a     │  Based on the analysis, I   │
│                  │  senior software arch-   │  found 8 undocumented…      │
│                  │  itect.                  │                             │
│                  │  **Task**: Perform       │  Recommendations:           │
│                  │  comprehensive valid-    │  1. Add missing JSDoc…      │
│                  │  ation of the codebase.  │  2. Fix retry logic…        │
├──────────────────┴──────────────────────────┴─────────────────────────────┤
│ [Tab] Prompt↔Response  [z] Zoom pane  [p] Raw view  [Esc] Close  [SPLIT] │
└───────────────────────────────────────────────────────────────────────────┘
```

`Tab` moves focus between the Prompt and Response panes (active pane highlighted).  
`PgUp`/`PgDn` scrolls whichever pane is focused.

#### State 3b — Zoomed pane (`z`)

```
┌─ ai_workflow Log Analyzer ──────────────────────────────────── 📂 FILES ─┐
│ Run: workflow_20260327_012345             ⬛ ZOOM: PROMPT                  │
├───────────────────────────────────────────────────────────────────────────┤
│  ▶ PROMPT — ZOOMED                                                        │
│                                                                           │
│  **Role**: You are a senior software architect with deep knowledge of     │
│  JavaScript, TypeScript, and Node.js best practices.                      │
│                                                                           │
│  **Task**: Perform comprehensive validation of the target codebase:       │
│  - Identify undocumented public APIs                                      │
│  - Flag unreachable code paths                                            │
│  - Detect retry logic that could cause infinite loops                     │
│                                                                           │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│ [z] Zoom out  [PgUp/Dn] Scroll  [p] Raw view  [Esc] Close      [ZOOM]   │
└───────────────────────────────────────────────────────────────────────────┘
```

The tree sidebar is hidden and the focused pane fills the full terminal width.  
Press `z` again to return to split view, or `p` to return to raw log view.

---

### Keyboard map

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle panel focus (Runs → Issues → Metrics) |
| `↑` / `↓` | Navigate items in focused panel |
| `Enter` | Open detail view for selected item |
| `f` | Cycle filter: All → Failures → Performance → Bugs → Quality |
| `r` | Re-run Copilot LLM analysis on selected item |
| `e` | Export JSON + Markdown to current directory |
| `q` / `Ctrl+C` | Quit |

#### Files mode keys

| Key | Context | Action |
|-----|---------|--------|
| `v` | Any | Toggle between Analysis and Files mode |
| `↑` / `↓` | Tree | Navigate files and directories |
| `Enter` | Tree | Expand/collapse directory or open file |
| `Esc` | Viewer | Close file, return to tree |
| `PgUp` / `PgDn` | Viewer | Scroll file content |
| `g` / `G` | Viewer | Jump to top / bottom |
| `p` | Viewer (prompt `.md`) | Toggle Prompt/Response split view |
| `Tab` | Split view | Switch focus: Prompt pane ↔ Response pane |
| `z` | Split view | Zoom focused pane to full-screen / zoom out |
| `h` | Any | Open/close help overlay |

## Input: Log structure

The tool reads the `.ai_workflow/` directory produced by ai_workflow.js:

```
<project>/.ai_workflow/
  logs/
    workflow_YYYYMMDD_HHMMSS/
      workflow.log              ← main execution log
      steps/
        step_XX.log             ← per-step log
      prompts/
        step_XX/
          <ts>_<N>_<persona>.md ← prompt + response markdown
  metrics/
    current_run.json
    history.jsonl
```

## Threshold configuration

Create a YAML file and pass it with `--threshold-config`:

```yaml
# thresholds.yaml
stepDurationWarningMs: 30000    # default: 30s
stepDurationCriticalMs: 60000   # default: 60s
llmLatencyWarningMs: 15000      # default: 15s
llmLatencyCriticalMs: 30000     # default: 30s
memoryWarningMb: 500            # default: 500 MB
memoryCriticalMb: 1000          # default: 1000 MB
maxRetriesBeforeWarning: 1      # default: 1
promptQualityWarningScore: 70   # default: 70 (out of 100)
```

## Output: JSON report

```json
{
  "runId": "workflow_20260327_012345",
  "timestamp": "2026-03-27T01:23:45.000Z",
  "summary": "5 issues found (2 critical, 2 warnings, 1 info)",
  "issues": [
    {
      "id": "failure-1",
      "category": "failure",
      "severity": "critical",
      "stepId": "step_05",
      "title": "CRITICAL performance event",
      "description": "Step took 51.8s exceeding threshold",
      "evidence": "[2026-03-27T01:42:21Z] ✗ [CRITICAL] step_05 took 51.8s (memory: 97.8MB)"
    }
  ],
  "metrics": {},
  "promptQuality": []
}
```

## Development

```bash
git clone https://github.com/your-org/ai_workflow_log_analyzer
cd ai_workflow_log_analyzer
npm install

# Type check
npm run typecheck

# Run tests
npm test

# Dev mode (tsx, no compile step)
npm run dev -- --tui /path/to/project

# Build
npm run build
```

## Architecture

```
src/
├── types/index.ts              ← shared interfaces (LogEvent, Issue, …)
├── parsers/
│   ├── log_parser.ts           ← stream workflow.log + step logs → LogEvent[]
│   ├── prompt_parser.ts        ← parse prompt .md → PromptRecord[]
│   └── metrics_parser.ts       ← parse metrics JSON/JSONL → MetricsData
├── analyzers/
│   ├── failure_analyzer.ts     ← CRITICAL events, SDK failures, exceptions
│   ├── performance_analyzer.ts ← threshold-based step/LLM/memory analysis
│   ├── bug_analyzer.ts         ← retry patterns, malformed output
│   └── prompt_quality_analyzer.ts ← LLM-assisted via Copilot SDK
├── lib/
│   ├── copilot_client.ts       ← @github/copilot-sdk wrapper (one-shot + streaming)
│   └── pipeline.ts             ← orchestrates parsers → analyzers → report
├── reporters/
│   ├── json_reporter.ts
│   └── markdown_reporter.ts
└── tui/
    ├── App.tsx                 ← root Ink component; keyboard nav, panel focus
    ├── components/             ← Header, RunSelector, IssuesPanel, MetricsPanel,
    │                               DetailOverlay, LLMStreamPanel, StatusBar
    └── hooks/                  ← useAnalysis, useRunSelector
```

## Tech stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Language | **TypeScript** | Only language with official `@github/copilot-sdk` |
| TUI | **Ink + React** | Proven multi-panel TUI, same stack as ai_workflow.js |
| LLM | **@github/copilot-sdk** | Official Node.js SDK, streaming support |
| Log streaming | **readline + async generators** | Memory-safe for large workflow runs |
| CLI | **commander** | Lightweight, well-typed |
| Tests | **Jest (ESM)** | Consistent with ai_workflow.js patterns |

## License

MIT
