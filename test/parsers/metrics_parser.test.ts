import { parseMetricsJson, parseMetrics } from '../../src/parsers/metrics_parser';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));
jest.mock('node:fs', () => {
  const original = jest.requireActual('node:fs');
  return {
    ...original,
    createReadStream: jest.fn(),
  };
});
jest.mock('node:readline', () => {
  return {
    createInterface: jest.fn(),
  };
});

const { readFile } = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createInterface } = require('node:readline');

describe('metrics_parser', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseMetricsJson', () => {
    it('parses a valid metrics JSON with all fields (object steps)', () => {
      const json = JSON.stringify({
        workflow_run_id: 'run-123',
        start_time: '2024-01-01T12:00:00Z',
        version: '1.2.3',
        mode: 'auto',
        profile: 'default',
        steps: {
          stepA: {
            durationMs: 100,
            memoryMb: 50,
            aiCallCount: 2,
            totalAiLatencyMs: 40,
            retryCount: 1,
            outcome: 'success',
            issueCount: 0,
          },
          stepB: {
            duration_ms: 200,
            memory_mb: 60,
            ai_call_count: 3,
            total_ai_latency_ms: 90,
            retry_count: 0,
            outcome: 'failure',
            issue_count: 2,
          },
        },
      });
      const result = parseMetricsJson(json);
      expect(result).toMatchObject({
        runId: 'run-123',
        startTime: new Date('2024-01-01T12:00:00Z'),
        version: '1.2.3',
        mode: 'auto',
        profile: 'default',
        stepCount: 2,
        steps: [
          expect.objectContaining({
            stepId: 'stepA',
            durationMs: 100,
            memoryMb: 50,
            aiCallCount: 2,
            totalAiLatencyMs: 40,
            retryCount: 1,
            outcome: 'success',
            issueCount: 0,
          }),
          expect.objectContaining({
            stepId: 'stepB',
            durationMs: 200,
            memoryMb: 60,
            aiCallCount: 3,
            totalAiLatencyMs: 90,
            retryCount: 0,
            outcome: 'failure',
            issueCount: 2,
          }),
        ],
        totalAiCalls: 5,
        avgAiLatencyMs: 26,
        maxMemoryMb: 60,
      });
    });

    it('parses a valid metrics JSON with steps as array', () => {
      const json = JSON.stringify({
        runId: 'run-456',
        startTime: '2024-02-02T10:00:00Z',
        steps: [
          {
            stepId: 'foo',
            durationMs: 10,
            memoryMb: 1,
            aiCallCount: 1,
            totalAiLatencyMs: 5,
            retryCount: 0,
            outcome: 'success',
            issueCount: 0,
          },
        ],
      });
      const result = parseMetricsJson(json);
      expect(result).toMatchObject({
        runId: 'run-456',
        startTime: new Date('2024-02-02T10:00:00Z'),
        stepCount: 1,
        steps: [
          expect.objectContaining({
            stepId: 'foo',
            durationMs: 10,
            memoryMb: 1,
            aiCallCount: 1,
            totalAiLatencyMs: 5,
            retryCount: 0,
            outcome: 'success',
            issueCount: 0,
          }),
        ],
        totalAiCalls: 1,
        avgAiLatencyMs: 5,
        maxMemoryMb: 1,
      });
    });

    it('handles missing optional fields and uses defaults', () => {
      const json = JSON.stringify({
        steps: {
          s1: {},
        },
      });
      const result = parseMetricsJson(json);
      expect(result).toMatchObject({
        runId: 'unknown',
        stepCount: 1,
        steps: [
          expect.objectContaining({
            stepId: 's1',
            durationMs: 0,
            aiCallCount: 0,
            totalAiLatencyMs: 0,
            retryCount: 0,
            outcome: 'success',
            issueCount: 0,
          }),
        ],
        totalAiCalls: 0,
        avgAiLatencyMs: 0,
        maxMemoryMb: undefined,
      });
    });

    it('handles missing steps field', () => {
      const json = JSON.stringify({
        runId: 'run-789',
        startTime: '2024-03-03T09:00:00Z',
      });
      const result = parseMetricsJson(json);
      expect(result).toMatchObject({
        runId: 'run-789',
        startTime: new Date('2024-03-03T09:00:00Z'),
        stepCount: 0,
        steps: [],
        totalAiCalls: 0,
        avgAiLatencyMs: 0,
        maxMemoryMb: undefined,
      });
    });

    it('returns null for invalid JSON', () => {
      expect(parseMetricsJson('not a json')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseMetricsJson('')).toBeNull();
    });

    it('handles stepId fallback and unknown', () => {
      const json = JSON.stringify({
        steps: {
          fallback: {
            durationMs: 1,
          },
          // step with no id, array form
        },
      });
      const result = parseMetricsJson(json);
      expect(result?.steps[0].stepId).toBe('fallback');
    });

    it('handles both camelCase and snake_case fields', () => {
      const json = JSON.stringify({
        steps: {
          s1: {
            durationMs: 10,
            memoryMb: 2,
            aiCallCount: 1,
            totalAiLatencyMs: 5,
            retryCount: 0,
            outcome: 'success',
            issueCount: 0,
          },
          s2: {
            duration_ms: 20,
            memory_mb: 3,
            ai_call_count: 2,
            total_ai_latency_ms: 10,
            retry_count: 1,
            outcome: 'failure',
            issue_count: 1,
          },
        },
      });
      const result = parseMetricsJson(json);
      expect(result?.steps[0].durationMs).toBe(10);
      expect(result?.steps[1].durationMs).toBe(20);
      expect(result?.steps[0].memoryMb).toBe(2);
      expect(result?.steps[1].memoryMb).toBe(3);
      expect(result?.steps[0].aiCallCount).toBe(1);
      expect(result?.steps[1].aiCallCount).toBe(2);
      expect(result?.steps[0].totalAiLatencyMs).toBe(5);
      expect(result?.steps[1].totalAiLatencyMs).toBe(10);
      expect(result?.steps[0].retryCount).toBe(0);
      expect(result?.steps[1].retryCount).toBe(1);
      expect(result?.steps[0].issueCount).toBe(0);
      expect(result?.steps[1].issueCount).toBe(1);
    });
  });

  describe('parseMetrics', () => {
    const metricsDir = '/fake/metrics';
    const currentRunPath = join(metricsDir, 'current_run.json');
    const historyPath = join(metricsDir, 'history.jsonl');

    function mockReadFileImpl(files: Record<string, string | Error>) {
      (readFile as jest.Mock).mockImplementation((file: string) => {
        if (files[file] instanceof Error) {
          return Promise.reject(files[file]);
        }
        if (files[file] !== undefined) {
          return Promise.resolve(files[file]);
        }
        return Promise.reject(new Error('File not found'));
      });
    }

    function mockReadlineImpl(lines: string[]) {
      (createReadStream as jest.Mock).mockReturnValue({});
      (createInterface as jest.Mock).mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: function* () {
            for (const line of lines) yield line;
          },
        };
      });
    }

    it('parses both current_run.json and history.jsonl (happy path)', async () => {
      const currentRunJson = JSON.stringify({
        runId: 'run-1',
        startTime: '2024-01-01T00:00:00Z',
        steps: [{ stepId: 's1', aiCallCount: 2, totalAiLatencyMs: 10 }],
      });
      const historyLines = [
        JSON.stringify({
          runId: 'run-2',
          startTime: '2024-01-02T00:00:00Z',
          steps: [{ stepId: 's2', aiCallCount: 1, totalAiLatencyMs: 5 }],
        }),
        JSON.stringify({
          runId: 'run-3',
          startTime: '2024-01-03T00:00:00Z',
          steps: [{ stepId: 's3', aiCallCount: 3, totalAiLatencyMs: 15 }],
        }),
      ];
      mockReadFileImpl({ [currentRunPath]: currentRunJson });
      mockReadlineImpl(historyLines);

      const result = await parseMetrics(metricsDir);
      expect(result.currentRun).toMatchObject({
        runId: 'run-1',
        steps: [expect.objectContaining({ stepId: 's1', aiCallCount: 2, totalAiLatencyMs: 10 })],
      });
      expect(result.history).toHaveLength(2);
      expect(result.history[0]).toMatchObject({
        runId: 'run-2',
        steps: [expect.objectContaining({ stepId: 's2', aiCallCount: 1, totalAiLatencyMs: 5 })],
      });
      expect(result.history[1]).toMatchObject({
        runId: 'run-3',
        steps: [expect.objectContaining({ stepId: 's3', aiCallCount: 3, totalAiLatencyMs: 15 })],
      });
    });

    it('handles missing current_run.json gracefully', async () => {
      mockReadFileImpl({ [currentRunPath]: new Error('File not found') });
      mockReadlineImpl([]);
      const result = await parseMetrics(metricsDir);
      expect(result.currentRun).toBeUndefined();
      expect(result.history).toEqual([]);
    });

    it('handles missing history.jsonl gracefully', async () => {
      mockReadFileImpl({ [currentRunPath]: JSON.stringify({ runId: 'run-1', steps: [] }) });
      (createReadStream as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });
      (createInterface as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });
      const result = await parseMetrics(metricsDir);
      expect(result.currentRun).toBeDefined();
      expect(result.history).toEqual([]);
    });

    it('skips empty and invalid lines in history.jsonl', async () => {
      mockReadFileImpl({ [currentRunPath]: JSON.stringify({ runId: 'run-1', steps: [] }) });
      mockReadlineImpl([
        '',
        '   ',
        'not a json',
        JSON.stringify({ runId: 'run-2', steps: [] }),
      ]);
      const result = await parseMetrics(metricsDir);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].runId).toBe('run-2');
    });

    it('returns empty history if history.jsonl is unreadable', async () => {
      mockReadFileImpl({ [currentRunPath]: JSON.stringify({ runId: 'run-1', steps: [] }) });
      (createReadStream as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      (createInterface as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const result = await parseMetrics(metricsDir);
      expect(result.history).toEqual([]);
    });

    it('returns both currentRun and history as undefined/empty if both files missing', async () => {
      mockReadFileImpl({ [currentRunPath]: new Error('File not found') });
      (createReadStream as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });
      (createInterface as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });
      const result = await parseMetrics(metricsDir);
      expect(result.currentRun).toBeUndefined();
      expect(result.history).toEqual([]);
    });
  });
});
