import { renderHook, act } from '@testing-library/react-hooks';
import { useRunSelector } from '../../../src/tui/hooks/useRunSelector';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

jest.mock('node:fs/promises');
jest.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}));

const mockReaddir = fs.readdir as jest.Mock;
const mockStat = fs.stat as jest.Mock;

const aiWorkflowDir = '/project/.ai_workflow';

const makeRunDir = (name: string, birthtime: Date, stepCount: number) => ({
  name,
  birthtime,
  stepCount,
  stepFiles: Array.from({ length: stepCount }, (_, i) => `step${i + 1}.log`),
});

describe('useRunSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads and sorts valid workflow run directories', async () => {
    const run1 = makeRunDir('workflow_20240101_120000', new Date('2024-01-01T12:00:00Z'), 3);
    const run2 = makeRunDir('workflow_20240301_080000', new Date('2024-03-01T08:00:00Z'), 2);
    mockReaddir.mockImplementationOnce(async (dir) => {
      if (dir === aiWorkflowDir + '/logs') return [run1.name, run2.name, 'not_a_run'];
      throw new Error('unexpected');
    });
    mockStat.mockImplementation(async (p) => {
      if (p.endsWith(run1.name)) return { birthtime: run1.birthtime };
      if (p.endsWith(run2.name)) return { birthtime: run2.birthtime };
      throw new Error('not found');
    });
    mockReaddir.mockImplementation(async (dir) => {
      if (dir.endsWith(run1.name + '/steps')) return run1.stepFiles;
      if (dir.endsWith(run2.name + '/steps')) return run2.stepFiles;
      if (dir === aiWorkflowDir + '/logs') return [run1.name, run2.name, 'not_a_run'];
      throw new Error('not found');
    });

    const { result, waitForNextUpdate } = renderHook(() => useRunSelector(aiWorkflowDir));
    // Initial loading state
    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.runs.length).toBe(2);
    // Sorted by birthtime descending
    expect(result.current.runs[0].runId).toBe(run2.name);
    expect(result.current.runs[1].runId).toBe(run1.name);
    expect(result.current.runs[0].stepCount).toBe(2);
    expect(result.current.runs[1].stepCount).toBe(3);
    expect(result.current.selectedIndex).toBe(0);
    expect(result.current.selectedRun.runId).toBe(run2.name);
  });

  it('handles missing logs directory gracefully', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('no dir'));
    const { result, waitForNextUpdate } = renderHook(() => useRunSelector(aiWorkflowDir));
    await waitForNextUpdate();
    expect(result.current.runs).toEqual([]);
    expect(result.current.selectedRun).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('skips invalid run directories', async () => {
    mockReaddir.mockImplementationOnce(async (dir) => {
      if (dir === aiWorkflowDir + '/logs') return ['foo', 'bar', 'workflow_20240101_120000'];
      throw new Error('unexpected');
    });
    mockStat.mockImplementation(async (p) => {
      if (p.endsWith('workflow_20240101_120000')) return { birthtime: new Date('2024-01-01T12:00:00Z') };
      throw new Error('not found');
    });
    mockReaddir.mockImplementation(async (dir) => {
      if (dir.endsWith('workflow_20240101_120000/steps')) return ['step1.log'];
      if (dir === aiWorkflowDir + '/logs') return ['foo', 'bar', 'workflow_20240101_120000'];
      throw new Error('not found');
    });

    const { result, waitForNextUpdate } = renderHook(() => useRunSelector(aiWorkflowDir));
    await waitForNextUpdate();
    expect(result.current.runs.length).toBe(1);
    expect(result.current.runs[0].runId).toBe('workflow_20240101_120000');
  });

  it('handles stat and steps errors gracefully', async () => {
    mockReaddir.mockImplementationOnce(async (dir) => {
      if (dir === aiWorkflowDir + '/logs') return ['workflow_20240101_120000'];
      throw new Error('unexpected');
    });
    mockStat.mockRejectedValueOnce(new Error('stat fail'));
    mockReaddir.mockRejectedValueOnce(new Error('no steps'));
    const { result, waitForNextUpdate } = renderHook(() => useRunSelector(aiWorkflowDir));
    await waitForNextUpdate();
    expect(result.current.runs.length).toBe(1);
    expect(result.current.runs[0].startTime).toBeNull();
    expect(result.current.runs[0].stepCount).toBe(0);
  });

  it('selects run by index and clamps out-of-bounds', async () => {
    const run1 = makeRunDir('workflow_20240101_120000', new Date('2024-01-01T12:00:00Z'), 1);
    const run2 = makeRunDir('workflow_20240301_080000', new Date('2024-03-01T08:00:00Z'), 1);
    mockReaddir.mockImplementationOnce(async (dir) => {
      if (dir === aiWorkflowDir + '/logs') return [run1.name, run2.name];
      throw new Error('unexpected');
    });
    mockStat.mockImplementation(async (p) => {
      if (p.endsWith(run1.name)) return { birthtime: run1.birthtime };
      if (p.endsWith(run2.name)) return { birthtime: run2.birthtime };
      throw new Error('not found');
    });
    mockReaddir.mockImplementation(async (dir) => {
      if (dir.endsWith(run1.name + '/steps')) return run1.stepFiles;
      if (dir.endsWith(run2.name + '/steps')) return run2.stepFiles;
      if (dir === aiWorkflowDir + '/logs') return [run1.name, run2.name];
      throw new Error('not found');
    });

    const { result, waitForNextUpdate } = renderHook(() => useRunSelector(aiWorkflowDir));
    await waitForNextUpdate();
    act(() => {
      result.current.select(1);
    });
    expect(result.current.selectedIndex).toBe(1);
    expect(result.current.selectedRun.runId).toBe(run1.name); // run1 is second after sorting
    act(() => {
      result.current.select(-1);
    });
    expect(result.current.selectedIndex).toBe(0);
    act(() => {
      result.current.select(99);
    });
    expect(result.current.selectedIndex).toBe(1);
  });

  it('selectedRun is null if runs is empty', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('no dir'));
    const { result, waitForNextUpdate } = renderHook(() => useRunSelector(aiWorkflowDir));
    await waitForNextUpdate();
    expect(result.current.selectedRun).toBeNull();
  });

  it('reloads runs when aiWorkflowDir changes', async () => {
    mockReaddir.mockRejectedValue(new Error('no dir'));
    const { result, rerender, waitForNextUpdate } = renderHook(
      ({ dir }) => useRunSelector(dir),
      { initialProps: { dir: aiWorkflowDir } }
    );
    await waitForNextUpdate();
    expect(result.current.runs).toEqual([]);
    mockReaddir.mockResolvedValueOnce(['workflow_20240101_120000']);
    mockStat.mockResolvedValueOnce({ birthtime: new Date('2024-01-01T12:00:00Z') });
    mockReaddir.mockResolvedValueOnce(['step1.log']);
    rerender({ dir: '/other/.ai_workflow' });
    await waitForNextUpdate();
    expect(result.current.runs.length).toBe(1);
    expect(result.current.runs[0].runId).toBe('workflow_20240101_120000');
  });
});
