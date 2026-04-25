import { describe, expect, it } from '@jest/globals';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseMetrics, parseMetricsJson } from '../../src/parsers/metrics_parser.js';

describe('metrics_parser', () => {
  it('parses normalized run metrics from JSON', () => {
    const json = JSON.stringify({
      workflow_run_id: 'run-123',
      start_time: '2024-01-01T12:00:00Z',
      steps: {
        stepA: {
          durationMs: 100,
          memoryMb: 50,
          aiCallCount: 2,
          totalAiLatencyMs: 40,
        },
        stepB: {
          duration_ms: 200,
          memory_mb: 60,
          ai_call_count: 3,
          total_ai_latency_ms: 90,
        },
      },
    });

    expect(parseMetricsJson(json)).toMatchObject({
      runId: 'run-123',
      stepCount: 2,
      totalAiCalls: 5,
      avgAiLatencyMs: 26,
      maxMemoryMb: 60,
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parseMetricsJson('not-json')).toBeNull();
  });

  it('parses current_run.json and history.jsonl from disk', async () => {
    const metricsDir = await mkdtemp(join(tmpdir(), 'metrics-parser-'));
    await writeFile(
      join(metricsDir, 'current_run.json'),
      JSON.stringify({
        runId: 'run-1',
        steps: [{ stepId: 's1', aiCallCount: 2, totalAiLatencyMs: 10 }],
      })
    );
    await writeFile(
      join(metricsDir, 'history.jsonl'),
      `${JSON.stringify({ runId: 'run-2', steps: [] })}\n${JSON.stringify({ runId: 'run-3', steps: [] })}\n`
    );

    const result = await parseMetrics(metricsDir);
    expect(result.currentRun?.runId).toBe('run-1');
    expect(result.history.map((run) => run.runId)).toEqual(['run-2', 'run-3']);

    await rm(metricsDir, { recursive: true, force: true });
  });

  it('returns an empty structure when metric files are missing', async () => {
    const metricsDir = await mkdtemp(join(tmpdir(), 'metrics-parser-empty-'));
    const result = await parseMetrics(metricsDir);
    expect(result).toEqual({ currentRun: undefined, history: [] });
    await rm(metricsDir, { recursive: true, force: true });
  });
});
