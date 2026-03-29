/**
 * Shared TypeScript types for ai_workflow_log_analyzer.
 * @module types
 */

// ─── Log Events ──────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEvent {
  timestamp: Date;
  level: LogLevel;
  stepId?: string;
  message: string;
  raw: string;
}

export interface AiCallEvent extends LogEvent {
  kind: 'ai_call_start' | 'ai_call_complete';
  persona: string;
  model: string;
  promptChars?: number;
  responseChars?: number;
  latencyMs?: number;
}

export interface StepEvent extends LogEvent {
  kind: 'step_start' | 'step_complete' | 'step_warning' | 'step_error';
  stepId: string;
  durationMs?: number;
  issueCount?: number;
}

export interface PerformanceEvent extends LogEvent {
  kind: 'performance';
  stepId: string;
  durationMs: number;
  memoryMb?: number;
  isCritical: boolean;
}

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

export interface MetricsData {
  currentRun?: RunMetrics;
  history: RunMetrics[];
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export type IssueCategory = 'failure' | 'performance' | 'bug' | 'prompt_quality';
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
  /** LLM-generated analysis (populated by prompt_quality_analyzer or on-demand) */
  llmAnalysis?: string;
  timestamp?: Date;
}

// ─── Prompt Quality ───────────────────────────────────────────────────────────

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

export type PanelId = 'runs' | 'issues' | 'metrics' | 'detail' | 'filetree' | 'fileviewer';
export type IssueFilter = 'all' | IssueCategory;

export interface RunInfo {
  runId: string;
  path: string;
  startTime: Date | null;
  stepCount: number;
}
