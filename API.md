# API Reference

Programmatic API for contributors and AI agents extending `ai_workflow_log_analyzer`.
All exports are ESM-only. Import paths use `.js` extensions as required by `module: NodeNext`.

> For full JSDoc — including `@param`/`@returns` details — read the source files directly.
> This document provides a high-level reference without opening individual modules.

---

## Pipeline

### `runAnalysisPipeline(runDir, metricsDir, opts?)`

```typescript
import { runAnalysisPipeline } from './src/lib/pipeline.js';
```

Orchestrates the complete analysis of a single workflow run: parsing, analysis, optional LLM
prompt-quality review, and optional executive summary.

| Parameter | Type | Description |
|-----------|------|-------------|
| `runDir` | `string` | Absolute path to a `workflow_YYYYMMDD_HHMMSS/` directory |
| `metricsDir` | `string` | Absolute path to `.ai_workflow/metrics/` |
| `opts` | `PipelineOptions` | Optional configuration (see below) |

**Returns:** `Promise<AnalysisReport>`

### `PipelineOptions`

```typescript
interface PipelineOptions {
  thresholds?: ThresholdConfig;     // Defaults to DEFAULT_THRESHOLDS
  projectRoot?: string;             // Overrides projectRoot from run_metadata.json
  skipPromptQuality?: boolean;      // Skip LLM-assisted prompt analysis (offline/CI)
  skipSummary?: boolean;            // Skip executive summary LLM call
  onProgress?: (phase: string, done: number, total: number) => void;
}
```

---

## Analyzers

```typescript
import { analyzeFailures } from './src/analyzers/failure_analyzer.js';
import { analyzePerformance, buildMetricsSummary } from './src/analyzers/performance_analyzer.js';
import { analyzeBugs } from './src/analyzers/bug_analyzer.js';
import { analyzeDocumentation } from './src/analyzers/doc_analyzer.js';
import { analyzePromptRecord, analyzeAllPrompts } from './src/analyzers/prompt_quality_analyzer.js';
```

All synchronous analyzers are pure functions — they receive parsed events and return `Issue[]`.
They carry no side effects and can be called independently.

### `analyzeFailures(events)`

```typescript
function analyzeFailures(events: AnyLogEvent[]): Issue[]
```

Detects CRITICAL log events, SDK timeouts, and uncaught exceptions.

### `analyzePerformance(events, thresholds?)`

```typescript
function analyzePerformance(events: AnyLogEvent[], thresholds?: ThresholdConfig): Issue[]
```

Identifies slow steps, high LLM latency, and memory spikes using configurable thresholds.

### `buildMetricsSummary(metrics)`

```typescript
function buildMetricsSummary(metrics: RunMetrics): {
  slowSteps: StepMetrics[];
  highLatencyAiCalls: AiCallEvent[];
  memoryPeakMb: number;
}
```

Extracts summary statistics from a `RunMetrics` object — useful for dashboards and headless output.

### `analyzeBugs(events)`

```typescript
function analyzeBugs(events: AnyLogEvent[]): Issue[]
```

Detects retry patterns, malformed step output, and unexpected step outcomes.

### `analyzeDocumentation(events)`

```typescript
function analyzeDocumentation(events: AnyLogEvent[]): Issue[]
```

Detects documentation-related log events (e.g., missing doc updates flagged during a run).

### `analyzePromptRecord(record, thresholds?)`

```typescript
async function analyzePromptRecord(
  record: PromptRecord,
  thresholds?: ThresholdConfig
): Promise<PromptQualityResult>
```

Scores a single prompt/response pair via the Copilot SDK. Returns a `PromptQualityResult`
including an `Issue` if the score falls below `thresholds.promptQualityMinScore`.

**Requires Copilot SDK** — not suitable for offline use.

### `analyzeAllPrompts(records, thresholds?, onProgress?)`

```typescript
async function analyzeAllPrompts(
  records: PromptRecord[],
  thresholds?: ThresholdConfig,
  onProgress?: (done: number, total: number) => void
): Promise<PromptQualityResult[]>
```

Scores all prompt records for a run concurrently with `Promise.all`.

---

## Reporters

```typescript
import { toJson, writeJsonReport } from './src/reporters/json_reporter.js';
import { toMarkdown, writeMarkdownReport } from './src/reporters/markdown_reporter.js';
```

### `toJson(report)`

```typescript
function toJson(report: AnalysisReport): string
```

Serialises an `AnalysisReport` to a formatted JSON string.

### `writeJsonReport(report, outputPath)`

```typescript
async function writeJsonReport(report: AnalysisReport, outputPath: string): Promise<void>
```

Writes the JSON-serialised report to `outputPath`, creating parent directories as needed.

### `toMarkdown(report)`

```typescript
function toMarkdown(report: AnalysisReport): string
```

Renders an `AnalysisReport` to a Markdown string. Issues are grouped by category
(`failure → performance → bug → documentation → prompt_quality`). Prompt quality results
include a `█░` score bar and LLM feedback collapsed in `<details>`.

### `writeMarkdownReport(report, outputPath)`

```typescript
async function writeMarkdownReport(report: AnalysisReport, outputPath: string): Promise<void>
```

Writes the Markdown-rendered report to `outputPath`, creating parent directories as needed.

---

## Copilot Client

```typescript
import {
  analyzeWithLLM,
  streamLLM,
  analyzePromptQuality,
  summarizeReport,
  analyzePromptPartVsCodebase,
} from './src/lib/copilot_client.js';
```

All functions in this module create a new `CopilotClient` + session per call and destroy them
when done. **Do not reuse sessions** — the SDK is not designed for that.

### `analyzeWithLLM(req)`

```typescript
async function analyzeWithLLM(req: LlmRequest): Promise<LlmResponse>
```

Single-shot LLM call. Waits for the `session.idle` event, then returns the full response.

```typescript
interface LlmRequest {
  prompt: string;
  systemMessage?: string;
  model?: string;   // defaults to 'gpt-4.1'
}
interface LlmResponse {
  content: string;
  model: string;
  latencyMs: number;
}
```

### `streamLLM(req, signal?)`

```typescript
async function* streamLLM(req: LlmRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk>
```

Streaming variant. Yields `StreamChunk` objects as tokens arrive; the final chunk has `done: true`.

```typescript
interface StreamChunk { delta: string; done: boolean; }
```

### `analyzePromptQuality(persona, model, prompt, response)`

```typescript
async function analyzePromptQuality(
  persona: string,
  model: string,
  prompt: string,
  response: string
): Promise<{ score: number; feedback: string; suggestions: string[] }>
```

LLM judge that scores a prompt/response pair 0–100 and returns structured feedback.
Prompt is capped at 3 000 chars; response at 1 500 chars before being sent to the LLM.

### `summarizeReport(reportJson)`

```typescript
async function summarizeReport(reportJson: string): Promise<string>
```

Generates a one-paragraph executive summary of an `AnalysisReport` JSON string
(capped at 4 000 chars).

### `analyzePromptPartVsCodebase(label, lines, projectRoot, signal?)`

```typescript
async function* analyzePromptPartVsCodebase(
  label: string,
  lines: string[],
  projectRoot: string,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk>
```

Streams an LLM analysis of a single named prompt section (`label`) against the live codebase
at `projectRoot`. Used by the TUI's Part Analysis overlay.

---

## Key Types

```typescript
import type {
  AnalysisReport,
  ThresholdConfig,
  DEFAULT_THRESHOLDS,
  Issue,
  PromptRecord,
  RunInfo,
  IssueCategory,
  IssueSeverity,
} from './src/types/index.js';
```

### `AnalysisReport`

The full output of `runAnalysisPipeline()`.

| Field | Type | Description |
|-------|------|-------------|
| `runId` | `string` | Matches the run directory name |
| `projectRoot` | `string \| undefined` | From `run_metadata.json`; may be absent for pre-0.3.0 logs |
| `metrics` | `RunMetrics` | Timing and step count data |
| `issues` | `Issue[]` | All detected issues across all categories |
| `promptQuality` | `PromptQualityResult[]` | Per-prompt LLM scores (empty if `skipPromptQuality`) |
| `summary` | `string \| undefined` | Executive summary (absent if `skipSummary`) |
| `counts` | `Record<IssueCategory, number>` | Issue counts per category |

### `ThresholdConfig` / `DEFAULT_THRESHOLDS`

User-configurable numeric thresholds. Merge user overrides over `DEFAULT_THRESHOLDS`:

```typescript
const thresholds: ThresholdConfig = { ...DEFAULT_THRESHOLDS, ...userOverrides };
```

| Field | Default | Description |
|-------|---------|-------------|
| `stepDurationMs` | `30_000` | Step duration threshold (ms) |
| `aiLatencyMs` | `10_000` | AI call latency threshold (ms) |
| `memoryMb` | `512` | Memory usage threshold (MB) |
| `promptQualityMinScore` | `70` | Minimum acceptable prompt quality score (0–100) |

### `Issue`

A single detected problem.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Auto-generated unique ID |
| `category` | `IssueCategory` | `'failure' \| 'performance' \| 'bug' \| 'documentation' \| 'prompt_quality'` |
| `severity` | `IssueSeverity` | `'critical' \| 'high' \| 'medium' \| 'low'` |
| `stepId` | `string \| undefined` | Associated workflow step |
| `title` | `string` | Short human-readable description |
| `detail` | `string` | Full explanation |
| `evidence` | `string \| undefined` | Raw log excerpt or prompt text |
| `llmAnalysis` | `string \| undefined` | LLM-generated feedback (prompt quality only) |
| `fixRecommendation` | `string \| undefined` | Suggested remediation |

### `PromptRecord`

One parsed prompt+response pair from a `prompts/step_XX/*.md` file.

| Field | Type | Description |
|-------|------|-------------|
| `stepId` | `string` | Step the prompt belongs to |
| `persona` | `string` | Persona name from the file's front-matter |
| `model` | `string` | Model ID used for the AI call |
| `prompt` | `string` | Prompt text |
| `response` | `string` | Model response text |
| `timestamp` | `Date` | From the file's `**Timestamp:**` header |
| `latencyMs` | `number \| undefined` | Round-trip time if recorded |

### `RunInfo`

Lightweight descriptor of a discovered run directory, used by `useRunSelector`.

| Field | Type | Description |
|-------|------|-------------|
| `runId` | `string` | `workflow_YYYYMMDD_HHMMSS` |
| `path` | `string` | Absolute path to the run directory |
| `startTime` | `Date` | Parsed from the directory name |
| `stepCount` | `number` | Number of step log files found |

---

*See [ARCHITECTURE.md](ARCHITECTURE.md) for component relationships and data flow.*  
*See [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards and terminology.*
