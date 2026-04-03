import { analyzeFailures } from '../../src/analyzers/failure_analyzer.js';
import { analyzePerformance } from '../../src/analyzers/performance_analyzer.js';
import { analyzeBugs } from '../../src/analyzers/bug_analyzer.js';
import type { AnyLogEvent } from '../../src/parsers/log_parser.js';
import type { ThresholdConfig } from '../../src/types/index.js';

const TIGHT_THRESHOLDS: ThresholdConfig = {
  stepDurationWarningMs: 20_000,
  stepDurationCriticalMs: 40_000,
  aiLatencyWarningMs: 15_000,
  aiLatencyCriticalMs: 30_000,
  memoryWarningMb: 80,
  memoryCriticalMb: 90,
  promptQualityMinScore: 70,
};

function makePerformanceEvent(stepId: string, durationMs: number, memoryMb?: number, isCritical = true): AnyLogEvent {
  return {
    kind: 'performance',
    timestamp: new Date(),
    level: isCritical ? 'critical' : 'debug',
    stepId,
    durationMs,
    memoryMb,
    isCritical,
    message: `✗ [CRITICAL] Operation '${stepId}' took ${durationMs}ms`,
    raw: '',
  } as AnyLogEvent;
}

function makeRetryEvent(stepId: string, attempt: number, maxAttempts: number): AnyLogEvent {
  return {
    kind: 'retry',
    timestamp: new Date(),
    level: 'warn',
    stepId,
    attempt,
    maxAttempts,
    message: `[DEBUG] Executing AI request (attempt ${attempt}/${maxAttempts})`,
    raw: '',
  } as AnyLogEvent;
}

function makeAiCallComplete(stepId: string, latencyMs: number): AnyLogEvent {
  return {
    kind: 'ai_call_complete',
    timestamp: new Date(),
    level: 'info',
    stepId,
    persona: 'test_persona',
    model: 'gpt-4.1',
    latencyMs,
    responseChars: 100,
    message: `[AI] SDK call completed`,
    raw: '',
  } as AnyLogEvent;
}

describe('analyzeFailures', () => {
  it('detects critical performance events as failures', () => {
    const events = [makePerformanceEvent('step_05', 51821, 97.77, true)];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('failure');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].stepId).toBe('step_05');
  });

  it('detects SDK failures', () => {
    const events: AnyLogEvent[] = [{
      timestamp: new Date(), level: 'error', message: 'SDK error: connection refused', raw: '', stepId: 'step_09',
    }];
    const issues = analyzeFailures(events);
    expect(issues.some((i) => i.category === 'failure')).toBe(true);
  });

  it('returns empty array for clean logs', () => {
    const events: AnyLogEvent[] = [{
      timestamp: new Date(), level: 'info', message: '✓ Step step_00 completed in 33ms', raw: '',
    }];
    expect(analyzeFailures(events)).toHaveLength(0);
  });
});

describe('analyzePerformance', () => {
  it('flags slow steps above warning threshold', () => {
    const events = [
      { kind: 'step_complete', timestamp: new Date(), level: 'info', stepId: 'step_05', durationMs: 51821, message: '', raw: '' } as AnyLogEvent,
    ];
    const issues = analyzePerformance(events, TIGHT_THRESHOLDS);
    expect(issues.some((i) => i.stepId === 'step_05' && i.category === 'performance')).toBe(true);
  });

  it('flags slow AI calls above latency threshold', () => {
    const events = [makeAiCallComplete('step_05', 35504)];
    const issues = analyzePerformance(events, TIGHT_THRESHOLDS);
    expect(issues.some((i) => i.category === 'performance')).toBe(true);
  });

  it('does not flag fast steps', () => {
    const events = [
      { kind: 'step_complete', timestamp: new Date(), level: 'info', stepId: 'step_00', durationMs: 33, message: '', raw: '' } as AnyLogEvent,
    ];
    const issues = analyzePerformance(events, TIGHT_THRESHOLDS);
    expect(issues).toHaveLength(0);
  });
});

describe('analyzeBugs', () => {
  it('flags high retry counts', () => {
    const events = [
      makeRetryEvent('step_09', 1, 3),
      makeRetryEvent('step_09', 2, 3),
    ];
    const issues = analyzeBugs(events);
    expect(issues.some((i) => i.category === 'bug' && i.stepId === 'step_09')).toBe(true);
  });

  it('does not flag single attempt (no retry)', () => {
    const events = [makeRetryEvent('step_01', 1, 3)];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(0);
  });
});
