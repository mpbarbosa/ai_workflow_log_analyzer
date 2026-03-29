import { analyzePerformance, buildMetricsSummary } from '../../src/analyzers/performance_analyzer';

const DEFAULT_THRESHOLDS = {
  stepDurationWarningMs: 5000,
  stepDurationCriticalMs: 10000,
  aiLatencyWarningMs: 2000,
  aiLatencyCriticalMs: 5000,
  memoryWarningMb: 512,
  memoryCriticalMb: 1024,
};

describe('analyzePerformance', () => {
  beforeEach(() => {
    // Reset the internal issue counter for deterministic IDs
    // @ts-ignore
    if (globalThis.__perfAnalyzerReset) {
      globalThis.__perfAnalyzerReset();
    }
  });

  it('returns empty array for no events', () => {
    expect(analyzePerformance([], DEFAULT_THRESHOLDS)).toEqual([]);
  });

  it('detects slow step durations (warning and critical)', () => {
    const events = [
      {
        kind: 'step_complete',
        stepId: 'step-1',
        durationMs: 6000,
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
      {
        kind: 'step_complete',
        stepId: 'step-2',
        durationMs: 12000,
        timestamp: new Date('2024-01-01T00:01:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      category: 'performance',
      severity: 'high',
      stepId: 'step-1',
      title: expect.stringContaining('Slow step: step-1'),
    });
    expect(issues[1]).toMatchObject({
      severity: 'critical',
      stepId: 'step-2',
      title: expect.stringContaining('Slow step: step-2'),
    });
  });

  it('keeps the max duration for repeated step_complete events', () => {
    const events = [
      {
        kind: 'step_complete',
        stepId: 'step-3',
        durationMs: 4000,
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
      {
        kind: 'step_complete',
        stepId: 'step-3',
        durationMs: 9000,
        timestamp: new Date('2024-01-01T00:01:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      stepId: 'step-3',
      severity: 'high',
      title: expect.stringContaining('Slow step: step-3'),
    });
  });

  it('detects high and critical memory usage in performance events', () => {
    const events = [
      {
        kind: 'performance',
        stepId: 'step-4',
        durationMs: 1000,
        memoryMb: 600,
        raw: 'Memory usage: 600MB',
        timestamp: new Date('2024-01-01T01:00:00Z'),
      },
      {
        kind: 'performance',
        stepId: 'step-5',
        durationMs: 1000,
        memoryMb: 1500,
        raw: 'Memory usage: 1500MB',
        timestamp: new Date('2024-01-01T01:01:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      stepId: 'step-4',
      severity: 'high',
      title: expect.stringContaining('High memory usage in step-4'),
      detail: expect.stringContaining('warning threshold'),
    });
    expect(issues[1]).toMatchObject({
      stepId: 'step-5',
      severity: 'critical',
      title: expect.stringContaining('High memory usage in step-5'),
      detail: expect.stringContaining('critical threshold'),
    });
  });

  it('detects slow LLM calls (warning and critical)', () => {
    const events = [
      {
        kind: 'ai_call_complete',
        stepId: 'step-6',
        latencyMs: 3000,
        persona: 'qa',
        model: 'gpt-4',
        timestamp: new Date('2024-01-01T02:00:00Z'),
      },
      {
        kind: 'ai_call_complete',
        stepId: 'step-7',
        latencyMs: 6000,
        persona: 'dev',
        model: 'gpt-4',
        timestamp: new Date('2024-01-01T02:01:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      stepId: 'step-6',
      severity: 'high',
      title: expect.stringContaining('Slow LLM call in step-6'),
      detail: expect.stringContaining('qa'),
    });
    expect(issues[1]).toMatchObject({
      stepId: 'step-7',
      severity: 'critical',
      title: expect.stringContaining('Slow LLM call in step-7'),
      detail: expect.stringContaining('dev'),
    });
  });

  it('handles ai_call_complete events with missing stepId', () => {
    const events = [
      {
        kind: 'ai_call_complete',
        latencyMs: 7000,
        persona: 'ops',
        model: 'gpt-4',
        timestamp: new Date('2024-01-01T03:00:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(1);
    expect(issues[0].stepId).toBeUndefined();
    expect(issues[0].title).toContain('Slow LLM call in unknown');
  });

  it('handles events with no kind or irrelevant kind', () => {
    const events = [
      {
        message: 'Just a log message',
        timestamp: new Date('2024-01-01T04:00:00Z'),
      },
      {
        kind: 'other',
        message: 'Other kind',
        timestamp: new Date('2024-01-01T04:01:00Z'),
      },
    ];
    expect(analyzePerformance(events, DEFAULT_THRESHOLDS)).toEqual([]);
  });

  it('handles missing optional fields gracefully', () => {
    const events = [
      {
        kind: 'performance',
        stepId: 'step-8',
        durationMs: 11000,
        raw: 'Duration: 11000ms',
        timestamp: new Date('2024-01-01T05:00:00Z'),
      },
      {
        kind: 'ai_call_complete',
        latencyMs: 6000,
        persona: 'test',
        model: 'gpt-4',
        timestamp: new Date('2024-01-01T05:01:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(2);
    expect(issues[0].title).toContain('Slow step: step-8');
    expect(issues[1].title).toContain('Slow LLM call in unknown');
  });

  it('does not create issues if values are below thresholds', () => {
    const events = [
      {
        kind: 'step_complete',
        stepId: 'step-9',
        durationMs: 1000,
        timestamp: new Date('2024-01-01T06:00:00Z'),
      },
      {
        kind: 'performance',
        stepId: 'step-10',
        durationMs: 1000,
        memoryMb: 100,
        raw: 'Memory usage: 100MB',
        timestamp: new Date('2024-01-01T06:01:00Z'),
      },
      {
        kind: 'ai_call_complete',
        stepId: 'step-11',
        latencyMs: 1000,
        persona: 'qa',
        model: 'gpt-4',
        timestamp: new Date('2024-01-01T06:02:00Z'),
      },
    ];
    expect(analyzePerformance(events, DEFAULT_THRESHOLDS)).toEqual([]);
  });

  it('handles a mix of all event types and produces correct issues', () => {
    const events = [
      {
        kind: 'step_complete',
        stepId: 'step-12',
        durationMs: 13000,
        timestamp: new Date('2024-01-01T07:00:00Z'),
      },
      {
        kind: 'performance',
        stepId: 'step-13',
        durationMs: 8000,
        memoryMb: 2000,
        raw: 'Memory usage: 2000MB',
        timestamp: new Date('2024-01-01T07:01:00Z'),
      },
      {
        kind: 'ai_call_complete',
        stepId: 'step-14',
        latencyMs: 8000,
        persona: 'dev',
        model: 'gpt-4',
        timestamp: new Date('2024-01-01T07:02:00Z'),
      },
    ];
    const issues = analyzePerformance(events, DEFAULT_THRESHOLDS);
    expect(issues).toHaveLength(3);
    expect(issues[0].title).toContain('Slow step: step-12');
    expect(issues[1].title).toContain('High memory usage in step-13');
    expect(issues[2].title).toContain('Slow LLM call in step-14');
    expect(issues[1].severity).toBe('critical');
    expect(issues[2].severity).toBe('critical');
  });
});

describe('buildMetricsSummary', () => {
  it('returns correct summary for given metrics', () => {
    const metrics = {
      steps: [
        { stepId: 'a', durationMs: 1000 },
        { stepId: 'b', durationMs: 5000 },
        { stepId: 'c', durationMs: 3000 },
        { stepId: 'd', durationMs: 8000 },
        { stepId: 'e', durationMs: 2000 },
        { stepId: 'f', durationMs: 7000 },
        { stepId: 'g', durationMs: 6000 },
        { stepId: 'h', durationMs: 4000 },
        { stepId: 'i', durationMs: 9000 },
      ],
      avgAiLatencyMs: 2500,
      maxMemoryMb: 1024,
      totalAiCalls: 12,
    };
    const summary = buildMetricsSummary(metrics);
    expect(summary.slowestSteps).toHaveLength(8);
    expect(summary.slowestSteps[0]).toEqual({ stepId: 'i', durationMs: 9000 });
    expect(summary.slowestSteps[1]).toEqual({ stepId: 'd', durationMs: 8000 });
    expect(summary.slowestSteps[7]).toEqual({ stepId: 'a', durationMs: 1000 });
    expect(summary.avgAiLatencyMs).toBe(2500);
    expect(summary.maxMemoryMb).toBe(1024);
    expect(summary.totalAiCalls).toBe(12);
  });

  it('handles empty steps array', () => {
    const metrics = {
      steps: [],
      avgAiLatencyMs: 0,
      maxMemoryMb: undefined,
      totalAiCalls: 0,
    };
    const summary = buildMetricsSummary(metrics);
    expect(summary.slowestSteps).toEqual([]);
    expect(summary.avgAiLatencyMs).toBe(0);
    expect(summary.maxMemoryMb).toBeUndefined();
    expect(summary.totalAiCalls).toBe(0);
  });
});
