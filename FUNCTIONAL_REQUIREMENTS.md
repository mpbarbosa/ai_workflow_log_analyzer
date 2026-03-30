# Functional Requirements

## 1. Log Analysis Pipeline

### FR-1.1 — Run Discovery

The tool shall scan `<projectRoot>/.ai_workflow/logs/` for directories matching the pattern `workflow_YYYYMMDD_HHMMSS` and present them as selectable runs ordered newest-first.

### FR-1.2 — Log Parsing

The tool shall parse `.jsonl` step log files in a run directory and reconstruct a typed event stream (`AnyLogEvent[]`) covering: step start/end, LLM calls, errors, file operations, and shell commands.

### FR-1.3 — Metrics Parsing

The tool shall parse `<projectRoot>/.ai_workflow/metrics/` JSON files and extract per-step durations, LLM call counts, latencies, and peak memory usage.

### FR-1.4 — Failure Detection

The tool shall detect and report step failures: non-zero exit codes, uncaught exceptions, and steps that never completed.

### FR-1.5 — Performance Analysis

The tool shall flag slow steps (configurable threshold, default 60 s), high LLM latency (default > 10 s per call), and memory spikes above a configurable threshold.

### FR-1.6 — Bug Detection

The tool shall identify retry loops, malformed LLM output (parse failures), and structural inconsistencies in log sequences.

### FR-1.7 — Prompt Quality Analysis

The tool shall optionally call the GitHub Copilot SDK to score each prompt/response pair (0–100) and surface
prompts scoring below a configurable threshold (default 60). Analysis runs sequentially to respect SDK rate limits.

### FR-1.8 — Run Metadata

Each run directory shall contain a `run_metadata.json` file with a `projectRoot` field (absolute path to the project
that produced the logs). The tool shall read this file during analysis and expose `projectRoot` on the
`AnalysisReport`. If the file is absent, the tool shall fall back to the value supplied via `--project` and leave
`AnalysisReport.projectRoot` undefined when neither is available.

### FR-1.8 — Executive Summary

The tool shall optionally generate a 3–5 sentence LLM summary of the full analysis report for quick orientation.

---

## 2. Interactive TUI Dashboard

### FR-2.1 — Analysis Mode

The TUI shall present an analysis mode with four panels: run selector, issues list, metrics panel, and detail overlay. The user shall be able to navigate between panels with `[Tab]`.

### FR-2.2 — Issue Filtering

The user shall be able to cycle through issue filters: All, Failures, Performance, Bugs, Prompt Quality using the `[f]` key.

### FR-2.3 — Issue Detail

Selecting an issue and pressing `[Enter]` shall open a full-screen detail overlay showing: title, severity, category, step ID, detail text, evidence, and LLM analysis.

### FR-2.4 — LLM Re-analysis Stream

Pressing `[r]` on an issue shall open a streaming panel that calls the Copilot SDK to re-analyse the selected issue in real-time.

### FR-2.5 — Metrics Visualisation

The metrics panel shall display ASCII bar charts for: top 7 slowest steps, average AI latency, peak memory, and total AI call count. Values shall be colour-coded (green/yellow/red) by performance threshold.

---

## 3. Files Mode (IDE-like Viewer)

### FR-3.1 — File Tree Navigation

In files mode, the tool shall display a recursive file tree rooted at the selected run directory. The user shall be able to expand/collapse directories and open files with `[Enter]`.

### FR-3.2 — Read-only File Viewer

Opening a file shall display its contents in a dedicated read-only panel. Log lines shall be colour-coded by severity. The viewer shall support `[↑↓]`, `[PgUp/Dn]`, `[g]`/`[G]` for navigation.

### FR-3.3 — Markdown Rendering

Files with `.md` extension shall be rendered with full markdown formatting: headings (H1–H3), **bold**, *italic*,
`` `code` ``, fenced code blocks, ordered/unordered lists, blockquotes, and horizontal rules.

### FR-3.4 — Prompt Split View

For prompt log files (under `prompts/`), pressing `[p]` shall split the viewer into side-by-side **Prompt** and **Response** panes, both rendered as markdown. `[Tab]` switches focus between panes.

### FR-3.5 — Prompt Zoom

In split view, pressing `[z]` shall zoom the focused pane to full screen. `[z]` again returns to split view.

### FR-3.6 — Prompt Parts View

Pressing `[s]` on any open file shall activate Parts view: a 28-column navigable section list on the left and the selected section's content (rendered as markdown) on the right. `[↑↓]` navigates sections.

### FR-3.7 — Prompt Part Analysis

Pressing `[a]` in Parts view shall send the selected section's content and relevant codebase context to the Copilot SDK for analysis. Results shall stream into an overlay and be saved to disk upon completion.

### FR-3.8 — Analysis File Persistence

Completed part analyses shall be saved to:

```text
<projectRoot>/.ai_workflow/analysis/<runId>/part_<label>_<timestamp>.md
```

The `analysis/<runId>/` folder shall be created automatically if it does not exist. The saved file path shall be shown in the overlay footer.

---

## 4. Status Bar

### FR-4.1 — Context-sensitive Hints

The status bar shall display keyboard shortcut hints that change based on the current mode, focused panel, and view state (split/zoom/parts). Duplicate hints for the same key shall never appear.

### FR-4.2 — Live Status

The right side of the status bar shall show: the current run ID (without `workflow_` prefix), a mode badge (`📂 FILES` / `🔍 ANALYSIS`), and a live state indicator.

### FR-4.3 — Analysis Progress

During analysis, the status bar shall show the current pipeline phase (e.g., `⟳ Prompt quality`) and update in real-time. On completion: `✓ DONE · N issues (M critical)`.

### FR-4.4 — Files Sub-state

In files mode, the status bar shall show the current sub-state: `filetree`, `fileviewer`, `[SPLIT]`, `[ZOOM: PANE]`, or `[PARTS]`.

---

## 5. Help, Export, and CLI

### FR-5.1 — Help Overlay

Pressing `[h]` shall display a full-screen keyboard shortcut reference organised by mode. `[h]` or `[Esc]` closes it.

### FR-5.2 — JSON Export

The CLI shall support `--json [output]` to write the analysis report as a JSON file without launching the TUI.

### FR-5.3 — Markdown Export

The CLI shall support `--md [output]` to write the analysis report as a Markdown file without launching the TUI.

### FR-5.4 — Project Root Argument

The CLI shall accept the project root either as a positional argument or via `--project <path>`. It shall default to the current working directory.

### FR-5.5 — Configurable Thresholds

The CLI shall accept `--threshold-config <path>` pointing to a JSON or YAML file that overrides default performance/quality thresholds.

### FR-5.6 — Skip Options

The CLI shall support `--skip-prompt-quality` (faster, no SDK) and `--skip-summary` to bypass optional LLM calls.

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — implementation design and key conventions
- [CHANGELOG.md](CHANGELOG.md) — version history and release notes
- [CONTRIBUTING.md](CONTRIBUTING.md) — documentation standards and terminology glossary

---

## Roadmap Minor Issues

Issues identified during automated log audits and addressed outside of versioned releases.

| ID     | Description                                         | Priority | Status |
|--------|-----------------------------------------------------|----------|--------|
| RI-001 | Test suites failed to run: jest.mock() in ESM mode  | Medium   | Done   |
| RI-002 | `.github/skills/` directory undocumented            | Medium   | Done   |
| RI-003 | Markdownlint not configured; 152 violations unfixed | Medium   | Done   |
| RI-004 | Sequential await in `analyzeAllPrompts`             | Low      | Done   |

---

*Applies to **v0.2.2**. Update this line whenever the package version is bumped.*
