/**
 * Shared TypeScript types for ai_workflow_log_analyzer.
 * @module types
 */

// ─── Log Events ──────────────────────────────────────────────────────────────

/** Severity level of a log entry, ordered from least to most severe. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * Base log event emitted by the workflow runner.
 * All other event types extend this interface.
 */
export interface LogEvent {
  timestamp: Date;
  level: LogLevel;
  stepId?: string;
  message: string;
  raw: string;
}

/** Log event emitted at the start or completion of an LLM (AI) call. */
export interface AiCallEvent extends LogEvent {
  kind: 'ai_call_start' | 'ai_call_complete';
  persona: string;
  model: string;
  promptChars?: number;
  responseChars?: number;
  latencyMs?: number;
}

/** Log event emitted when a workflow step starts, completes, warns, or errors. */
export interface StepEvent extends LogEvent {
  kind: 'step_start' | 'step_complete' | 'step_warning' | 'step_error';
  stepId: string;
  durationMs?: number;
  issueCount?: number;
}

/** Log event carrying performance measurements for a workflow step. */
export interface PerformanceEvent extends LogEvent {
  kind: 'performance';
  stepId: string;
  durationMs: number;
  memoryMb?: number;
  isCritical: boolean;
}

/** Log event emitted when a step is retried after a failure. */
export interface RetryEvent extends LogEvent {
  kind: 'retry';
  stepId: string;
  attempt: number;
  maxAttempts: number;
}

// ─── Prompt Records ───────────────────────────────────────────────────────────

export interface PromptRecord {
  stepId: string;
  timestamp: Date;
  sequenceNum: number;
  persona: string;
  model: string;
  prompt: string;
  response: string;
  promptChars: number;
  responseChars: number;
  /** Inferred from AI call log events; may be undefined if not matched */
  latencyMs?: number;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** Aggregated performance and outcome metrics for a single workflow step. */
export interface StepMetrics {
  stepId: string;
  durationMs: number;
  memoryMb?: number;
  aiCallCount: number;
  totalAiLatencyMs: number;
  retryCount: number;
  outcome: 'success' | 'warning' | 'error' | 'skipped';
  issueCount: number;
}

/** Aggregated metrics for a complete workflow run, derived from log events and metrics files. */
export interface RunMetrics {
  runId: string;
  startTime: Date;
  totalDurationMs?: number;
  stepCount: number;
  steps: StepMetrics[];
  totalAiCalls: number;
  avgAiLatencyMs: number;
  maxMemoryMb?: number;
  profile?: string;
  mode?: string;
  version?: string;
}

/** Container for parsed metrics: the current run and historical run data. */
export interface MetricsData {
  currentRun?: RunMetrics;
  history: RunMetrics[];
}

// ─── Issues ───────────────────────────────────────────────────────────────────

/** Classifier for the type of problem an {@link Issue} represents. */
export type IssueCategory = 'failure' | 'performance' | 'bug' | 'prompt_quality' | 'documentation';
/** Priority level of an {@link Issue}, used for sorting and filtering. */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Issue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  stepId?: string;
  title: string;
  detail: string;
  /** Raw log excerpt or prompt text that triggered this issue */
  evidence?: string;
  /**
   * Root cause of the issue — populated for documentation issues where the
   * automated scanner can determine why a reference or resource is missing
   * (e.g. renamed file, moved location, typo in reference, never existed).
   */
  rootCause?: string;
  /**
   * Specific recommended fix with before/after example where applicable.
   * Populated alongside {@link rootCause} for actionable documentation issues.
   */
  fixRecommendation?: string;
  /** LLM-generated analysis (populated by prompt_quality_analyzer or on-demand) */
  llmAnalysis?: string;
  timestamp?: Date;
}

// ─── Prompt Quality ───────────────────────────────────────────────────────────

/** Result of LLM-assisted quality analysis for a single prompt/response pair. */
export interface PromptQualityResult {
  promptRecord: PromptRecord;
  score: number;  // 0–100
  feedback: string;
  suggestions: string[];
  issue?: Issue;
}

// ─── Analysis Report ─────────────────────────────────────────────────────────

export interface AnalysisReport {
  runId: string;
  analyzedAt: Date;
  /** Absolute path to the project that produced the logs (from run_metadata.json; may be undefined for legacy runs) */
  projectRoot?: string;
  metrics: RunMetrics;
  issues: Issue[];
  promptQuality: PromptQualityResult[];
  summary?: string;
  /** Counts by category */
  counts: {
    total: number;
    failures: number;
    performance: number;
    bugs: number;
    documentation: number;
    promptQuality: number;
    critical: number;
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ThresholdConfig {
  /** Step duration threshold in ms; above this is flagged as slow (default: 30000) */
  stepDurationWarningMs: number;
  /** Step duration threshold in ms; above this is flagged as critical (default: 60000) */
  stepDurationCriticalMs: number;
  /** LLM call latency warning threshold in ms (default: 20000) */
  aiLatencyWarningMs: number;
  /** LLM call latency critical threshold in ms (default: 45000) */
  aiLatencyCriticalMs: number;
  /** Memory usage warning threshold in MB (default: 80) */
  memoryWarningMb: number;
  /** Memory usage critical threshold in MB (default: 150) */
  memoryCriticalMb: number;
  /** Prompt quality score below this is flagged (default: 70) */
  promptQualityMinScore: number;
}

/** Default threshold values applied when no user configuration is provided. */
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  stepDurationWarningMs: 30_000,
  stepDurationCriticalMs: 60_000,
  aiLatencyWarningMs: 20_000,
  aiLatencyCriticalMs: 45_000,
  memoryWarningMb: 80,
  memoryCriticalMb: 150,
  promptQualityMinScore: 70,
};

// ─── TUI / App state ─────────────────────────────────────────────────────────

/** Identifier for a focusable panel in the TUI layout. */
export type PanelId = 'runs' | 'issues' | 'metrics' | 'detail' | 'filetree' | 'fileviewer';
/** Active filter for the issues list; `'all'` disables category filtering. */
export type IssueFilter = 'all' | IssueCategory;

/** Metadata for a discovered workflow run directory, used by the run selector. */
export interface RunInfo {
  runId: string;
  path: string;
  startTime: Date | null;
  stepCount: number;
}
