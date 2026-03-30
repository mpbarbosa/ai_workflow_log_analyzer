/**
 * Failure Analyzer — detects and classifies failures and critical errors from log events.
 * @module analyzers/failure_analyzer
 */

import type { AnyLogEvent } from '../parsers/log_parser.js';
import type { Issue, IssueSeverity, StepEvent, PerformanceEvent } from '../types/index.js';

let _issueCounter = 0;
function nextId(category: string): string {
  return `${category}-${++_issueCounter}`;
}

const SDK_FAIL_RE = /SDK (error|failed|timeout|unavailable)/i;
const UNCAUGHT_RE = /(UnhandledPromiseRejection|Error:|TypeError:|RangeError:|uncaught)/i;
const AUTH_FAIL_RE = /(auth|authentication|unauthorized|403|401)/i;

/**
 * Scans log events for failures and returns a list of Issues.
 */
export function analyzeFailures(events: AnyLogEvent[]): Issue[] {
  const issues: Issue[] = [];

  for (const event of events) {
    const msg = event.message;

    // Critical performance events that are also failures
    if ('kind' in event && event.kind === 'performance') {
      const perf = event as PerformanceEvent;
      if (perf.isCritical) {
        issues.push({
          id: nextId('failure'),
          category: 'failure',
          severity: 'critical',
          stepId: perf.stepId,
          title: `Critical timeout: ${perf.stepId}`,
          detail: `Step ${perf.stepId} exceeded critical duration threshold (${(perf.durationMs / 1000).toFixed(1)}s${perf.memoryMb ? `, memory: ${perf.memoryMb.toFixed(1)}MB` : ''})`,
          evidence: perf.raw,
          fixRecommendation: `Profile the step to find the bottleneck. Optimize slow operations or parallelize independent sub-tasks. If the duration is expected, raise the critical threshold in ThresholdConfig.`,
          timestamp: perf.timestamp,
        });
      }
      continue;
    }

    // Step errors from StepEvent
    if ('kind' in event && event.kind === 'step_error') {
      const step = event as StepEvent;
      issues.push({
        id: nextId('failure'),
        category: 'failure',
        severity: 'critical',
        stepId: step.stepId,
        title: `Step failed: ${step.stepId}`,
        detail: msg,
        evidence: event.raw,
        fixRecommendation: `Review the full error log for this step to identify the root cause. Verify that all step inputs and dependencies are valid and that the step's required resources are available.`,
        timestamp: event.timestamp,
      });
      continue;
    }

    // SDK failures
    if (SDK_FAIL_RE.test(msg)) {
      issues.push({
        id: nextId('failure'),
        category: 'failure',
        severity: 'high',
        stepId: event.stepId,
        title: `SDK failure${event.stepId ? ` in ${event.stepId}` : ''}`,
        detail: msg,
        evidence: event.raw,
        fixRecommendation: `Check network connectivity and SDK configuration. Verify API rate limits and quota usage. Review retry policies and consider adding exponential backoff for transient failures.`,
        timestamp: event.timestamp,
      });
      continue;
    }

    // Auth failures
    if (AUTH_FAIL_RE.test(msg)) {
      issues.push({
        id: nextId('failure'),
        category: 'failure',
        severity: 'critical',
        stepId: event.stepId,
        title: 'Authentication / authorization failure',
        detail: msg,
        evidence: event.raw,
        fixRecommendation: `Verify that authentication credentials and authorization scopes are correctly configured. Check for token expiry and ensure the token refresh logic is working. Confirm the account has the required permissions.`,
        timestamp: event.timestamp,
      });
      continue;
    }

    // Uncaught exceptions / unhandled rejections
    if (event.level === 'error' || event.level === 'critical') {
      if (UNCAUGHT_RE.test(msg)) {
        const severity: IssueSeverity = event.level === 'critical' ? 'critical' : 'high';
        issues.push({
          id: nextId('failure'),
          category: 'failure',
          severity,
          stepId: event.stepId,
          title: `Runtime error${event.stepId ? ` in ${event.stepId}` : ''}`,
          detail: msg,
          evidence: event.raw,
          fixRecommendation: `Review the stack trace in the log to locate the error source. Fix the underlying code defect or add appropriate error handling to prevent unhandled promise rejections and uncaught exceptions.`,
          timestamp: event.timestamp,
        });
      }
    }
  }

  return issues;
}
