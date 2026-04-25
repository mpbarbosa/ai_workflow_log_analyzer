/**
 * Performance Analyzer — threshold-based analysis of step durations, LLM latency, and memory.
 * @module analyzers/performance_analyzer
 */

import type { AnyLogEvent } from '../parsers/log_parser.js';
import type {
  AiCallEvent,
  StepEvent,
  PerformanceEvent,
  Issue,
  IssueSeverity,
  ThresholdConfig,
  RunMetrics,
} from '../types/index.js';
import { DEFAULT_THRESHOLDS as defaults } from '../types/index.js';

let _issueCounter = 0;
function nextId(): string {
  return `perf-${++_issueCounter}`;
}

function severity(value: number, warn: number, critical: number): IssueSeverity | null {
  if (value >= critical) return 'critical';
  if (value >= warn) return 'high';
  return null;
}

/**
 * Analyzes log events for performance issues.
 */
export function analyzePerformance(
  events: AnyLogEvent[],
  thresholds: ThresholdConfig = defaults
): Issue[] {
  const issues: Issue[] = [];

  // Collect step durations from step_complete and performance events
  const stepDurations = new Map<string, number>();
  const aiLatencies: Array<{ stepId?: string; latencyMs: number; persona: string; model: string; timestamp: Date }> = [];

  for (const event of events) {
    if (!('kind' in event)) continue;

    if (event.kind === 'step_complete') {
      const e = event as StepEvent;
      if (e.durationMs !== undefined) {
        // Keep the max duration if seen multiple times
        const prev = stepDurations.get(e.stepId) ?? 0;
        stepDurations.set(e.stepId, Math.max(prev, e.durationMs));
      }
    }

    if (event.kind === 'performance') {
      const e = event as PerformanceEvent;
      const prev = stepDurations.get(e.stepId) ?? 0;
      stepDurations.set(e.stepId, Math.max(prev, e.durationMs));

      // Memory check
      if (e.memoryMb !== undefined) {
        const sev = severity(e.memoryMb, thresholds.memoryWarningMb, thresholds.memoryCriticalMb);
        if (sev) {
          issues.push({
            id: nextId(),
            category: 'performance',
            severity: sev,
            stepId: e.stepId,
            title: `High memory usage in ${e.stepId}: ${e.memoryMb.toFixed(1)}MB`,
            detail: `Memory usage exceeded ${sev === 'critical' ? 'critical' : 'warning'} threshold of ${sev === 'critical' ? thresholds.memoryCriticalMb : thresholds.memoryWarningMb}MB`,
            evidence: e.raw,
            fixRecommendation: `Profile the step for memory leaks and large in-memory data structures. Consider processing data in smaller chunks or streaming output rather than buffering it entirely.`,
            timestamp: e.timestamp,
          });
        }
      }
    }

    if (event.kind === 'ai_call_complete') {
      const e = event as AiCallEvent;
      if (e.latencyMs !== undefined) {
        aiLatencies.push({
          stepId: e.stepId,
          latencyMs: e.latencyMs,
          persona: e.persona,
          model: e.model,
          timestamp: e.timestamp,
        });
      }
    }
  }

  // Step duration issues
  for (const [stepId, durationMs] of stepDurations) {
    const sev = severity(durationMs, thresholds.stepDurationWarningMs, thresholds.stepDurationCriticalMs);
    if (sev) {
      issues.push({
        id: nextId(),
        category: 'performance',
        severity: sev,
        stepId,
        title: `Slow step: ${stepId} (${(durationMs / 1000).toFixed(1)}s)`,
        detail: `Step ${stepId} took ${(durationMs / 1000).toFixed(1)}s, exceeding the ${sev === 'critical' ? 'critical' : 'warning'} threshold of ${((sev === 'critical' ? thresholds.stepDurationCriticalMs : thresholds.stepDurationWarningMs) / 1000).toFixed(0)}s`,
        fixRecommendation: `Profile the step to identify bottlenecks. Consider parallelizing independent sub-tasks or reducing the number of sequential AI calls. If the duration is expected, raise the relevant threshold in ThresholdConfig.`,
        timestamp: undefined,
      });
    }
  }

  // LLM latency issues
  for (const call of aiLatencies) {
    const sev = severity(call.latencyMs, thresholds.aiLatencyWarningMs, thresholds.aiLatencyCriticalMs);
    if (sev) {
      issues.push({
        id: nextId(),
        category: 'performance',
        severity: sev,
        stepId: call.stepId,
        title: `Slow LLM call in ${call.stepId ?? 'unknown'}: ${(call.latencyMs / 1000).toFixed(1)}s (${call.persona})`,
        detail: `LLM call to ${call.model} with persona ${call.persona} took ${(call.latencyMs / 1000).toFixed(1)}s`,
        fixRecommendation: `Reduce prompt size to lower response time, or switch to a faster model for this persona. Consider caching responses for prompts that are repeated with identical input.`,
        timestamp: call.timestamp,
      });
    }
  }

  return issues;
}

/**
 * Builds a simple performance summary from RunMetrics for the TUI metrics panel.
 */
export function buildMetricsSummary(metrics: RunMetrics): {
  slowestSteps: Array<{ stepId: string; durationMs: number }>;
  avgAiLatencyMs: number;
  maxMemoryMb: number | undefined;
  totalAiCalls: number;
} {
  const slowestSteps = [...metrics.steps]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 8)
    .map((s) => ({ stepId: s.stepId, durationMs: s.durationMs }));

  return {
    slowestSteps,
    avgAiLatencyMs: metrics.avgAiLatencyMs,
    maxMemoryMb: metrics.maxMemoryMb,
    totalAiCalls: metrics.totalAiCalls,
  };
}
