# ai_workflow_log_analyzer

A standalone CLI tool that analyzes [ai_workflow.js](https://github.com/your-org/ai_workflow.js) execution log
files, surfacing failures, bugs, prompt quality issues, and performance regressions — powered by the GitHub Copilot
SDK.

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Codebase structure, pipeline design, TUI layout, and key conventions |
| [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md) | Numbered functional requirements (FR-1.x – FR-5.x) |
| [API.md](API.md) | Programmatic API reference — pipeline, analyzers, reporters, copilot client |
| [GETTING_STARTED.md](GETTING_STARTED.md) | Contributor onboarding — setup, dev commands, and extension guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Documentation standards, versioning rules, terminology glossary |

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

Run `analyze-logs --help` (or `-h`) to print a full reference of all flags and examples directly in
your terminal.

### Interactive TUI (default)

```bash
# positional path
analyze-logs --tui /path/to/ai-workflow-project

# or using the --project flag
analyze-logs --tui --project /path/to/ai-workflow-project
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

```text
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

```text
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

```text
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
For any open file, press `s` to switch to **Parts view** (structured section list).

#### State 3a — Prompt split view (`p`)

```text
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
│ [Tab] Prompt↔Response  [z] Zoom pane  [d] Analyze folder  [f] Fix issues  [p] Raw view  [Esc] Close  [SPLIT] │
└───────────────────────────────────────────────────────────────────────────┘
```

`Tab` moves focus between the Prompt and Response panes (active pane highlighted).  
`PgUp`/`PgDn` scrolls whichever pane is focused. Press `d` to analyze the open
prompt log file's parent folder in an interactive Copilot session, or `f` to
launch the fix skill for actionable issues called out in the open prompt
response.

#### State 3b — Zoomed pane (`z`)

```text
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
│ [z] Zoom out  [PgUp/Dn] Scroll  [d] Analyze folder  [f] Fix issues  [p] Raw view  [Esc] Close      [ZOOM]   │
└───────────────────────────────────────────────────────────────────────────┘
```

The tree sidebar is hidden and the focused pane fills the full terminal width.  
Press `z` again to return to split view, or `p` to return to raw log view.

#### State 3c — Prompt Parts view (`s`)

Press `s` on any open file to switch into **Parts view**, which parses the file into named sections (bold-heading delimiters) and displays them as a navigable list:

```text
┌─ ai_workflow Log Analyzer ────────────────────────────── 📂 FILES › [PARTS] ─┐
│ Run: workflow_20260327_012345                                                   │
├───────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Sections ────────────────┐  ┌─ Content ─────────────────────────────────┐ │
│ │   Role                    │  │  **Role**:                                 │ │
│ │ ▶ Task                    │  │  You are a senior software architect with  │ │
│ │   Context                 │  │  deep knowledge of JavaScript, TypeScript, │ │
│ │   Constraints             │  │  and Node.js best practices.               │ │
│ │   Output format           │  │                                            │ │
│ └───────────────────────────┘  └────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────────────────┤
│ [↑↓] Sections  [a] Analyze codebase  [b] Reverse prompt  [d] Analyze folder  [f] Fix issues  [s] Raw view  [Esc] Close  │
└───────────────────────────────────────────────────────────────────────────────┘
```

Use `↑`/`↓` to navigate sections. Press `a` to stream a Copilot analysis of the
selected section against your project's codebase. Press `b` to
reverse-engineer the selected section into a reusable master prompt. Press `d`
to analyze the open prompt log file's parent folder in an interactive Copilot
session. Press `f` to launch the Copilot fix skill against actionable issues
extracted from the prompt response.

#### State 3d — Part analysis overlay (`a` / `b`)

With a part selected in Parts view, press `a` to open the codebase-alignment overlay or `b` to open the reverse-prompting overlay:

```text
┌─ ai_workflow Log Analyzer ──────────────────────────── 📂 FILES › [ANALYZING] ─┐
│ Run: workflow_20260327_012345                                                     │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ▶ Analyzing: Task                                                                │
│  ─────────────────────────────────────────────────────────────────────────────── │
│  The **Task** section defines a broad code review directive without              │
│  explicit success criteria. Observations:                                        │
│                                                                                   │
│  1. **Scope too wide** — "comprehensive validation" with no scoped file list     │
│     increases token usage without improving result quality.                      │
│  2. **Missing output schema** — the LLM cannot infer whether to return JSON,    │
│     markdown, or prose; add an explicit format instruction.                      │
│  …                                                                                │
│  ──────────────────────────────────────────────────────────────────────────────  │
│  ✓ Saved: .ai_workflow/analysis/workflow_20260327_012345/part_task_2026-03-27… │
├──────────────────────────────────────────────────────────────────────────────────┤
│ [PgUp/Dn] Scroll  [Esc] Cancel / Close                               [ANALYZING] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

The analysis streams token-by-token from the Copilot SDK.  
When complete, the result is saved to `<projectRoot>/.ai_workflow/analysis/<runId>/part_<label>_<timestamp>.md`.  
Press `Esc` to cancel in-flight streaming or to close a completed overlay.

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
| `Esc` | Viewer / overlay | Close file or cancel analysis, return to tree |
| `PgUp` / `PgDn` | Viewer | Scroll file content |
| `g` / `G` | Viewer | Jump to top / bottom |
| `d` | Viewer (prompt `.md`) | Analyze the open prompt log file's parent folder in an interactive Copilot session |
| `f` | Viewer (prompt `.md`) | Extract actionable issues from the prompt response and launch the fix skill; if none are found, show a notice and stay in the TUI |
| `p` | Viewer (prompt `.md`) | Toggle Prompt/Response split view |
| `Tab` | Split view | Switch focus: Prompt pane ↔ Response pane |
| `z` | Split view | Zoom focused pane to full-screen / zoom out |
| `s` | Viewer (any file) | Toggle Prompt Parts structured section view |
| `↑` / `↓` | Parts view | Navigate sections |
| `a` | Parts view | Stream Copilot analysis of selected section vs codebase |
| `PgUp` / `PgDn` | Analysis overlay | Scroll analysis text |
| `h` | Any | Open/close help overlay |

## Input: Log structure

The tool reads the `.ai_workflow/` directory produced by ai_workflow.js:

```text
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
npm run type:check

# Run tests
npm test

# Run the CI suite serially
npm run test:ci

# Dev mode (tsx, no compile step)
npm run dev -- --tui /path/to/project

# Build
npm run build

# Run the full verification suite in Docker
npm run test:docker
```

The GitHub Actions workflow at `.github/workflows/ci.yml` builds the `verify` Docker image and
runs `npm run verify` inside the container on every push to `main` and every pull request.

## Architecture

```text
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
    │   │                           DetailOverlay, LLMStreamPanel, StatusBar,
    │   │                           FileTree, FileViewer, PromptSplitViewer,
    │   │                           PromptPartsViewer, PartAnalysisOverlay,
    │   │                           HelpOverlay, MarkdownRenderer
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

## Skills

The `.github/skills/` directory contains
[GitHub Copilot CLI skills](https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent-to-work-on-tasks/about-assigning-tasks-to-copilot)
for project-specific workflows. See [`.github/SKILLS.md`](.github/SKILLS.md) for the full list.

## License

MIT
