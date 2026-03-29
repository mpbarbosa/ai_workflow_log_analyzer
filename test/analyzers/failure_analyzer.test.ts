import { analyzeFailures } from '../../src/analyzers/failure_analyzer';

describe('analyzeFailures', () => {
  beforeEach(() => {
    // Reset the internal issue counter for deterministic IDs
    // @ts-ignore
    if (globalThis.__failureAnalyzerReset) {
      globalThis.__failureAnalyzerReset();
    }
  });

  it('returns empty array for no events', () => {
    expect(analyzeFailures([])).toEqual([]);
  });

  it('detects critical performance event as failure', () => {
    const events = [
      {
        kind: 'performance',
        stepId: 'step-1',
        isCritical: true,
        durationMs: 12000,
        memoryMb: 256.5,
        raw: 'Performance: step-1 exceeded threshold',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        message: 'Performance: step-1 exceeded threshold',
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'failure',
      severity: 'critical',
      stepId: 'step-1',
      title: 'Critical timeout: step-1',
      detail: expect.stringContaining('12.0s'),
      evidence: 'Performance: step-1 exceeded threshold',
    });
    expect(issues[0].detail).toContain('memory: 256.5MB');
  });

  it('ignores non-critical performance events', () => {
    const events = [
      {
        kind: 'performance',
        stepId: 'step-2',
        isCritical: false,
        durationMs: 5000,
        memoryMb: 128,
        raw: 'Performance: step-2 ok',
        timestamp: new Date('2024-01-01T01:00:00Z'),
        message: 'Performance: step-2 ok',
      },
    ];
    expect(analyzeFailures(events)).toEqual([]);
  });

  it('detects step_error events as critical failures', () => {
    const events = [
      {
        kind: 'step_error',
        stepId: 'step-3',
        message: 'Step failed due to timeout',
        raw: 'Step failed due to timeout',
        timestamp: new Date('2024-01-01T02:00:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'failure',
      severity: 'critical',
      stepId: 'step-3',
      title: 'Step failed: step-3',
      detail: 'Step failed due to timeout',
      evidence: 'Step failed due to timeout',
    });
  });

  it('detects SDK failures with high severity', () => {
    const events = [
      {
        message: 'SDK error: unavailable',
        stepId: 'step-4',
        raw: 'SDK error: unavailable',
        timestamp: new Date('2024-01-01T03:00:00Z'),
      },
      {
        message: 'SDK timeout occurred',
        stepId: 'step-5',
        raw: 'SDK timeout occurred',
        timestamp: new Date('2024-01-01T03:01:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      category: 'failure',
      severity: 'high',
      stepId: 'step-4',
      title: 'SDK failure in step-4',
      detail: 'SDK error: unavailable',
    });
    expect(issues[1].title).toBe('SDK failure in step-5');
  });

  it('detects SDK failures without stepId', () => {
    const events = [
      {
        message: 'SDK failed: unknown error',
        raw: 'SDK failed: unknown error',
        timestamp: new Date('2024-01-01T04:00:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('SDK failure');
    expect(issues[0].stepId).toBeUndefined();
  });

  it('detects authentication/authorization failures as critical', () => {
    const events = [
      {
        message: 'Authentication failed: 401 Unauthorized',
        stepId: 'step-6',
        raw: 'Authentication failed: 401 Unauthorized',
        timestamp: new Date('2024-01-01T05:00:00Z'),
      },
      {
        message: 'auth error: 403',
        stepId: 'step-7',
        raw: 'auth error: 403',
        timestamp: new Date('2024-01-01T05:01:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      category: 'failure',
      severity: 'critical',
      title: 'Authentication / authorization failure',
      detail: 'Authentication failed: 401 Unauthorized',
    });
    expect(issues[1].title).toBe('Authentication / authorization failure');
  });

  it('detects uncaught exceptions and unhandled rejections (error level)', () => {
    const events = [
      {
        message: 'UnhandledPromiseRejection: something bad happened',
        level: 'error',
        stepId: 'step-8',
        raw: 'UnhandledPromiseRejection: something bad happened',
        timestamp: new Date('2024-01-01T06:00:00Z'),
      },
      {
        message: 'Error: Something went wrong',
        level: 'error',
        raw: 'Error: Something went wrong',
        timestamp: new Date('2024-01-01T06:01:00Z'),
      },
      {
        message: 'TypeError: undefined is not a function',
        level: 'error',
        stepId: 'step-9',
        raw: 'TypeError: undefined is not a function',
        timestamp: new Date('2024-01-01T06:02:00Z'),
      },
      {
        message: 'RangeError: out of range',
        level: 'error',
        stepId: 'step-10',
        raw: 'RangeError: out of range',
        timestamp: new Date('2024-01-01T06:03:00Z'),
      },
      {
        message: 'uncaught exception: crash',
        level: 'error',
        stepId: 'step-11',
        raw: 'uncaught exception: crash',
        timestamp: new Date('2024-01-01T06:04:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(5);
    expect(issues[0].title).toBe('Runtime error in step-8');
    expect(issues[1].title).toBe('Runtime error');
    expect(issues[2].title).toBe('Runtime error in step-9');
    expect(issues[3].title).toBe('Runtime error in step-10');
    expect(issues[4].title).toBe('Runtime error in step-11');
    expect(issues[0].severity).toBe('high');
  });

  it('detects uncaught exceptions as critical if level is critical', () => {
    const events = [
      {
        message: 'Error: critical failure',
        level: 'critical',
        stepId: 'step-12',
        raw: 'Error: critical failure',
        timestamp: new Date('2024-01-01T07:00:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toBe('Runtime error in step-12');
  });

  it('does not create issues for unrelated messages or non-error levels', () => {
    const events = [
      {
        message: 'Step completed successfully',
        level: 'info',
        stepId: 'step-13',
        raw: 'Step completed successfully',
        timestamp: new Date('2024-01-01T08:00:00Z'),
      },
      {
        message: 'Performance: step-14 ok',
        kind: 'performance',
        isCritical: false,
        stepId: 'step-14',
        raw: 'Performance: step-14 ok',
        timestamp: new Date('2024-01-01T09:00:00Z'),
      },
    ];
    expect(analyzeFailures(events)).toEqual([]);
  });

  it('handles events missing optional fields gracefully', () => {
    const events = [
      {
        message: 'SDK error: unavailable',
        raw: 'SDK error: unavailable',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
      {
        kind: 'step_error',
        message: 'Step failed',
        raw: 'Step failed',
        timestamp: new Date('2024-01-01T11:00:00Z'),
      },
      {
        kind: 'performance',
        isCritical: true,
        durationMs: 15000,
        raw: 'Performance: critical',
        timestamp: new Date('2024-01-01T12:00:00Z'),
        stepId: undefined,
        message: 'Performance: critical',
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(3);
    expect(issues[0].title).toBe('SDK failure');
    expect(issues[1].title).toBe('Step failed: undefined');
    expect(issues[2].title).toBe('Critical timeout: undefined');
  });

  it('matches all variants of SDK, auth, and uncaught patterns (case-insensitive)', () => {
    const events = [
      {
        message: 'sdk ERROR: unavailable',
        raw: 'sdk ERROR: unavailable',
        timestamp: new Date('2024-01-01T13:00:00Z'),
      },
      {
        message: 'AUTH: 403 forbidden',
        raw: 'AUTH: 403 forbidden',
        timestamp: new Date('2024-01-01T14:00:00Z'),
      },
      {
        message: 'unhandledpromiserejection: crash',
        level: 'error',
        raw: 'unhandledpromiserejection: crash',
        timestamp: new Date('2024-01-01T15:00:00Z'),
      },
    ];
    const issues = analyzeFailures(events);
    expect(issues).toHaveLength(3);
    expect(issues[0].title).toBe('SDK failure');
    expect(issues[1].title).toBe('Authentication / authorization failure');
    expect(issues[2].title).toBe('Runtime error');
  });
});
