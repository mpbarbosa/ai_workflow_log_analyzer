import { analyzeBugs } from '../../src/analyzers/bug_analyzer';

describe('analyzeBugs', () => {
  beforeEach(() => {
    // Reset the internal issue counter for deterministic IDs
    // @ts-ignore
    if (globalThis.__bugAnalyzerReset) {
      globalThis.__bugAnalyzerReset();
    }
  });

  it('returns empty array for no events', () => {
    expect(analyzeBugs([])).toEqual([]);
  });

  it('detects a single malformed output event', () => {
    const events = [
      {
        kind: 'info',
        message: 'Malformed: invalid JSON structure',
        stepId: 'step-1',
        raw: 'Malformed: invalid JSON structure',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'bug',
      severity: 'high',
      stepId: 'step-1',
      title: 'Malformed output in step-1',
      detail: 'Malformed: invalid JSON structure',
      evidence: 'Malformed: invalid JSON structure',
    });
  });

  it('detects a single unexpected outcome event', () => {
    const events = [
      {
        kind: 'info',
        message: 'Unexpected result: assertion failed',
        stepId: 'step-2',
        raw: 'Unexpected result: assertion failed',
        timestamp: new Date('2024-01-01T01:00:00Z'),
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'bug',
      severity: 'medium',
      stepId: 'step-2',
      title: 'Unexpected outcome in step-2',
      detail: 'Unexpected result: assertion failed',
      evidence: 'Unexpected result: assertion failed',
    });
  });

  it('detects retry events with count >= 2 as issues', () => {
    const events = [
      {
        kind: 'retry',
        stepId: 'step-3',
        attempt: 1,
        maxAttempts: 3,
        timestamp: new Date('2024-01-01T02:00:00Z'),
        raw: 'Retry 1/3',
      },
      {
        kind: 'retry',
        stepId: 'step-3',
        attempt: 2,
        maxAttempts: 3,
        timestamp: new Date('2024-01-01T02:01:00Z'),
        raw: 'Retry 2/3',
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'bug',
      stepId: 'step-3',
      title: 'Retries in step-3: attempt 2/3',
      detail: expect.stringContaining('required 2 attempt(s) out of 3'),
      evidence: 'Retry 2/3',
      severity: 'medium',
    });
  });

  it('escalates severity to high if retry count equals max', () => {
    const events = [
      {
        kind: 'retry',
        stepId: 'step-4',
        attempt: 1,
        maxAttempts: 2,
        timestamp: new Date('2024-01-01T03:00:00Z'),
        raw: 'Retry 1/2',
      },
      {
        kind: 'retry',
        stepId: 'step-4',
        attempt: 2,
        maxAttempts: 2,
        timestamp: new Date('2024-01-01T03:01:00Z'),
        raw: 'Retry 2/2',
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'high',
      stepId: 'step-4',
      title: 'Retries in step-4: attempt 2/2',
    });
  });

  it('handles retry events with missing stepId as "unknown"', () => {
    const events = [
      {
        kind: 'retry',
        attempt: 2,
        maxAttempts: 3,
        timestamp: new Date('2024-01-01T04:00:00Z'),
        raw: 'Retry 2/3',
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      stepId: 'unknown',
      title: 'Retries in unknown: attempt 2/3',
    });
  });

  it('does not create retry issue for single attempt', () => {
    const events = [
      {
        kind: 'retry',
        stepId: 'step-5',
        attempt: 1,
        maxAttempts: 3,
        timestamp: new Date('2024-01-01T05:00:00Z'),
        raw: 'Retry 1/3',
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(0);
  });

  it('detects multiple issues in a mixed event stream', () => {
    const events = [
      {
        kind: 'retry',
        stepId: 'step-6',
        attempt: 2,
        maxAttempts: 2,
        timestamp: new Date('2024-01-01T06:00:00Z'),
        raw: 'Retry 2/2',
      },
      {
        kind: 'info',
        message: 'Malformed: parse error at line 1',
        stepId: 'step-7',
        raw: 'Malformed: parse error at line 1',
        timestamp: new Date('2024-01-01T07:00:00Z'),
      },
      {
        kind: 'info',
        message: 'Unexpected outcome: mismatch detected',
        stepId: 'step-8',
        raw: 'Unexpected outcome: mismatch detected',
        timestamp: new Date('2024-01-01T08:00:00Z'),
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(3);
    expect(issues.map(i => i.stepId)).toEqual(['step-7', 'step-8', 'step-6']);
    expect(issues.find(i => i.stepId === 'step-6')?.severity).toBe('high');
  });

  it('does not create issues for unrelated messages', () => {
    const events = [
      {
        kind: 'info',
        message: 'Step completed successfully',
        stepId: 'step-9',
        raw: 'Step completed successfully',
        timestamp: new Date('2024-01-01T09:00:00Z'),
      },
    ];
    expect(analyzeBugs(events)).toEqual([]);
  });

  it('handles events missing optional fields gracefully', () => {
    const events = [
      {
        kind: 'info',
        message: 'Malformed: syntax error',
        raw: 'Malformed: syntax error',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
      {
        kind: 'info',
        message: 'Unexpected result: assertion failed',
        raw: 'Unexpected result: assertion failed',
        timestamp: new Date('2024-01-01T11:00:00Z'),
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(2);
    expect(issues[0].stepId).toBeUndefined();
    expect(issues[1].stepId).toBeUndefined();
  });

  it('matches all variants of malformed and unexpected outcome patterns (case-insensitive)', () => {
    const events = [
      {
        kind: 'info',
        message: 'Parse Error: something went wrong',
        stepId: 'step-10',
        raw: 'Parse Error: something went wrong',
        timestamp: new Date('2024-01-01T12:00:00Z'),
      },
      {
        kind: 'info',
        message: 'unexpected Token found',
        stepId: 'step-11',
        raw: 'unexpected Token found',
        timestamp: new Date('2024-01-01T13:00:00Z'),
      },
      {
        kind: 'info',
        message: 'MISMATCH detected in output',
        stepId: 'step-12',
        raw: 'MISMATCH detected in output',
        timestamp: new Date('2024-01-01T14:00:00Z'),
      },
    ];
    const issues = analyzeBugs(events);
    expect(issues).toHaveLength(3);
    expect(issues[0].title).toMatch(/Malformed output/);
    expect(issues[1].title).toMatch(/Malformed output/);
    expect(issues[2].title).toMatch(/Unexpected outcome/);
  });
});
