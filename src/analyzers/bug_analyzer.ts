/**
 * Bug Analyzer — detects retry patterns, unexpected outcomes, and malformed step output.
 * @module analyzers/bug_analyzer
 */

import type { AnyLogEvent } from '../parsers/log_parser.js';
import type { RetryEvent, Issue } from '../types/index.js';

let _issueCounter = 0;
function nextId(): string {
  return `bug-${++_issueCounter}`;
}

const MALFORMED_RE = /(malformed|invalid json|parse error|unexpected token|syntax error|failed to parse)/i;
const UNEXPECTED_OUTCOME_RE = /(unexpected (result|outcome|response)|mismatch|assertion failed)/i;

/**
 * Analyzes log events for bugs.
 */
export function analyzeBugs(events: AnyLogEvent[]): Issue[] {
  const issues: Issue[] = [];

  // Track retries per step — group consecutive retry events
  const retryCounts = new Map<string, { count: number; max: number; timestamp: Date; evidence: string }>();

  for (const event of events) {
    // Retry detection
    if ('kind' in event && event.kind === 'retry') {
      const e = event as RetryEvent;
      const key = e.stepId ?? 'unknown';
      const existing = retryCounts.get(key);
      if (!existing || e.attempt > existing.count) {
        retryCounts.set(key, {
          count: e.attempt,
          max: e.maxAttempts,
          timestamp: e.timestamp,
          evidence: e.raw,
        });
      }
      continue;
    }

    // Malformed output
    if (MALFORMED_RE.test(event.message)) {
      issues.push({
        id: nextId(),
        category: 'bug',
        severity: 'high',
        stepId: event.stepId,
        title: `Malformed output${event.stepId ? ` in ${event.stepId}` : ''}`,
        detail: event.message,
        evidence: event.raw,
        fixRecommendation: `Validate the step's output against its expected schema before downstream consumption. Add explicit JSON parsing with try/catch and log the raw response on failure to aid debugging.`,
        timestamp: event.timestamp,
      });
      continue;
    }

    // Unexpected outcomes
    if (UNEXPECTED_OUTCOME_RE.test(event.message)) {
      issues.push({
        id: nextId(),
        category: 'bug',
        severity: 'medium',
        stepId: event.stepId,
        title: `Unexpected outcome${event.stepId ? ` in ${event.stepId}` : ''}`,
        detail: event.message,
        evidence: event.raw,
        fixRecommendation: `Review the step's prompt and input data for format mismatches. Add assertion logging around the output value to trace where the unexpected result originates.`,
        timestamp: event.timestamp,
      });
    }
  }

  // Convert retry data into issues
  for (const [stepId, data] of retryCounts) {
    if (data.count >= 2) {
      const exhausted = data.count >= data.max;
      issues.push({
        id: nextId(),
        category: 'bug',
        severity: exhausted ? 'high' : 'medium',
        stepId,
        title: `Retries in ${stepId}: attempt ${data.count}/${data.max}`,
        detail: `Step ${stepId} required ${data.count} attempt(s) out of ${data.max} maximum. This may indicate flaky SDK responses or prompt instability.`,
        evidence: data.evidence,
        fixRecommendation: exhausted
          ? `All retry attempts were exhausted. Check for persistent SDK or network issues, review API rate limits, and consider whether the prompt reliably produces parseable output.`
          : `The step required multiple attempts before succeeding. Investigate intermittent SDK response failures and review the prompt for instructions that may produce inconsistent output.`,
        timestamp: data.timestamp,
      });
    }
  }

  return issues;
}
