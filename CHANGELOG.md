# Changelog

All notable changes to `ai_workflow_log_analyzer` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-03-29

### Added

#### Core Analysis Pipeline
- Log parser: reads `.jsonl` step log files → typed `AnyLogEvent[]` stream
- Metrics parser: reads `.ai_workflow/metrics/` JSON files
- Prompt parser: reads `prompts/step_XX/*.md` → `PromptRecord[]`; `parsePromptParts()` for section parsing
- Failure analyzer: detects step failures, non-zero exits, uncaught exceptions
- Performance analyzer: flags slow steps, high LLM latency, memory spikes
- Bug analyzer: detects retry loops, malformed output, structural log issues
- Prompt quality analyzer: Copilot SDK-scored prompt/response pairs (0–100)
- Analysis pipeline: parallel parse → sync analyze → optional LLM → aggregate → optional summary
- JSON reporter: `toJson(report)` for machine-readable output
- Markdown reporter: `toMarkdown(report)` for human-readable output

#### Interactive TUI Dashboard (Ink/React)
- Analysis mode: run selector + issues panel + metrics panel + detail overlay
- Issue filtering: All / Failures / Performance / Bugs / Prompt Quality (`[f]`)
- Issue detail overlay: full-screen drill-down with LLM analysis field
- LLM streaming re-analysis panel (`[r]` on selected issue)
- Metrics panel: ASCII bar charts for step durations and LLM latency
- Header with run ID and live status badge
- Status bar: context-sensitive keyboard hints + right-side status chain
- Help overlay (`[h]`): full keyboard reference organised by mode

#### Files Mode (IDE-like Viewer)
- File tree navigator: recursive expand/collapse for any run directory
- Read-only file viewer: log line colour-coding, `[↑↓]`/`[PgUp/Dn]`/`[g/G]` navigation
- Markdown renderer: H1–H3 headings, bold, italic, inline code, fenced code blocks, lists, blockquotes, HR
- Prompt split view (`[p]`): side-by-side Prompt / Response panes, both markdown-rendered
- Prompt pane zoom (`[z]`): full-screen pane; `[Tab]` switches zoomed pane
- Prompt parts view (`[s]`): navigable section list (28 col) + markdown content pane
  - Section colour-coding: Role=magenta, Task=yellow, Output=cyan, Approach=green, Context=blue, Reference=gray
  - Supports `**Label**:` and `**Label:**` section boundary formats

#### CLI
- `npm start -- <projectRoot>` or `--project <path>` to specify project
- `--json [output]` and `--md [output]` for headless export
- `--run <run-id>` to target a specific workflow run
- `--skip-prompt-quality`, `--skip-summary` to bypass optional LLM calls
- `--threshold-config <path>` for JSON/YAML threshold overrides

#### Tooling / Project Setup
- TypeScript with `module: NodeNext` + `tsx` runtime (no build step for development)
- Jest test suite: 3 suites, 21 tests
- ESLint with TypeScript plugin
- `.workflow-config.yaml` for ai_workflow.js integration
- `ARCHITECTURE.md` and `FUNCTIONAL_REQUIREMENTS.md`
- `.github/copilot-instructions.md` for Copilot session context
