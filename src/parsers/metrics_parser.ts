/**
 * Metrics Parser — parses .ai_workflow/metrics/ JSON files into MetricsData.
 * @module parsers/metrics_parser
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { MetricsData, RunMetrics, StepMetrics } from '../types/index.js';

// ─── Raw JSON shapes (from ai_workflow.js metrics output) ─────────────────────

interface RawStepMetrics {
  stepId?: string;
  step_id?: string;
  durationMs?: number;
  duration_ms?: number;
  memoryMb?: number;
  memory_mb?: number;
  aiCallCount?: number;
  ai_call_count?: number;
  totalAiLatencyMs?: number;
  total_ai_latency_ms?: number;
  retryCount?: number;
  retry_count?: number;
  outcome?: string;
  issueCount?: number;
  issue_count?: number;
}

interface RawRunMetrics {
  workflow_run_id?: string;
  runId?: string;
  start_time?: string;
  startTime?: string;
  version?: string;
  mode?: string;
  profile?: string;
  steps?: Record<string, RawStepMetrics> | RawStepMetrics[];
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeStep(raw: RawStepMetrics, fallbackId?: string): StepMetrics {
  const stepId = raw.stepId ?? raw.step_id ?? fallbackId ?? 'unknown';
  const durationMs = raw.durationMs ?? raw.duration_ms ?? 0;
  const memoryMb = raw.memoryMb ?? raw.memory_mb;
  const aiCallCount = raw.aiCallCount ?? raw.ai_call_count ?? 0;
  const totalAiLatencyMs = raw.totalAiLatencyMs ?? raw.total_ai_latency_ms ?? 0;
  const retryCount = raw.retryCount ?? raw.retry_count ?? 0;
  const issueCount = raw.issueCount ?? raw.issue_count ?? 0;
  const outcome = (raw.outcome ?? 'success') as StepMetrics['outcome'];

  return { stepId, durationMs, memoryMb, aiCallCount, totalAiLatencyMs, retryCount, outcome, issueCount };
}

function normalizeRun(raw: RawRunMetrics): RunMetrics {
  const runId = raw.workflow_run_id ?? raw.runId ?? 'unknown';
  const startTime = new Date(raw.start_time ?? raw.startTime ?? 0);
  const version = raw.version;
  const mode = raw.mode;
  const profile = raw.profile;

  let steps: StepMetrics[] = [];
  if (raw.steps) {
    if (Array.isArray(raw.steps)) {
      steps = raw.steps.map((s) => normalizeStep(s));
    } else {
      steps = Object.entries(raw.steps).map(([id, s]) => normalizeStep(s, id));
    }
  }

  const totalAiCalls = steps.reduce((acc, s) => acc + s.aiCallCount, 0);
  const totalAiLatency = steps.reduce((acc, s) => acc + s.totalAiLatencyMs, 0);
  const avgAiLatencyMs = totalAiCalls > 0 ? Math.round(totalAiLatency / totalAiCalls) : 0;
  const maxMemoryMb = steps.reduce<number | undefined>((acc, s) => {
    if (s.memoryMb === undefined) return acc;
    return acc === undefined ? s.memoryMb : Math.max(acc, s.memoryMb);
  }, undefined);

  return {
    runId,
    startTime,
    stepCount: steps.length,
    steps,
    totalAiCalls,
    avgAiLatencyMs,
    maxMemoryMb,
    version,
    mode,
    profile,
  };
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parses a single metrics JSON file (current_run.json or a JSONL entry).
 */
export function parseMetricsJson(json: string): RunMetrics | null {
  try {
    const raw = JSON.parse(json) as RawRunMetrics;
    return normalizeRun(raw);
  } catch {
    return null;
  }
}

/**
 * Streams history.jsonl and returns all run metrics entries.
 */
async function parseHistoryJsonl(filePath: string): Promise<RunMetrics[]> {
  const runs: RunMetrics[] = [];
  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const run = parseMetricsJson(trimmed);
      if (run) runs.push(run);
    }
  } catch {
    // file not found or unreadable
  }
  return runs;
}

/**
 * Parses the .ai_workflow/metrics/ directory for a project.
 * @param metricsDir - Path to .ai_workflow/metrics/ directory
 */
export async function parseMetrics(metricsDir: string): Promise<MetricsData> {
  let currentRun: RunMetrics | undefined;

  // current_run.json
  try {
    const raw = await readFile(join(metricsDir, 'current_run.json'), 'utf8');
    currentRun = parseMetricsJson(raw) ?? undefined;
  } catch {
    // not present
  }

  // history.jsonl
  const history = await parseHistoryJsonl(join(metricsDir, 'history.jsonl'));

  return { currentRun, history };
}
