import { renderHook, act } from '@testing-library/react-hooks';
import { useAnalysis } from '../../../src/tui/hooks/useAnalysis';
import * as pipeline from '../../../src/lib/pipeline';

jest.mock('node:path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

const mockRunAnalysisPipeline = jest.fn();
(pipeline as any).runAnalysisPipeline = mockRunAnalysisPipeline;

const baseReport = {
  issues: [
    { category: 'bug', id: 1 },
    { category: 'failure', id: 2 },
    { category: 'performance', id: 3 },
    { category: 'documentation', id: 4 },
    { category: 'prompt_quality', id: 5 },
  ],
};

const runInfo = { path: '/project/logs' };
const projectRoot = '/project';

describe('useAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with idle state and default values', () => {
    const { result } = renderHook(() => useAnalysis());
    expect(result.current.state).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toEqual({ phase: '', done: 0, total: 0 });
    expect(result.current.filter).toBe('all');
    expect(result.current.filteredIssues).toEqual([]);
  });

  it('runs analysis pipeline and sets state to done on success', async () => {
    mockRunAnalysisPipeline.mockResolvedValueOnce(baseReport);
    const { result, waitForNextUpdate } = renderHook(() => useAnalysis());
    await act(async () => {
      result.current.run(runInfo, projectRoot);
    });
    expect(result.current.state).toBe('done');
    expect(result.current.report).toEqual(baseReport);
    expect(result.current.error).toBeNull();
    expect(result.current.filteredIssues.length).toBe(5);
  });

  it('sets state to error and captures error message on pipeline failure', async () => {
    mockRunAnalysisPipeline.mockRejectedValueOnce(new Error('fail!'));
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.run(runInfo, projectRoot);
    });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('fail!');
    expect(result.current.report).toBeNull();
  });

  it('handles non-Error thrown values in pipeline failure', async () => {
    mockRunAnalysisPipeline.mockRejectedValueOnce('string error');
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.run(runInfo, projectRoot);
    });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('string error');
  });

  it('resets error and report on rerun', async () => {
    mockRunAnalysisPipeline.mockRejectedValueOnce(new Error('fail!'));
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.run(runInfo, projectRoot);
    });
    mockRunAnalysisPipeline.mockResolvedValueOnce(baseReport);
    await act(async () => {
      await result.current.run(runInfo, projectRoot);
    });
    expect(result.current.state).toBe('done');
    expect(result.current.error).toBeNull();
    expect(result.current.report).toEqual(baseReport);
  });

  it('calls runAnalysisPipeline with correct arguments', async () => {
    mockRunAnalysisPipeline.mockResolvedValueOnce(baseReport);
    const { result } = renderHook(() => useAnalysis({ bug: 1 }));
    await act(async () => {
      await result.current.run(runInfo, projectRoot, true);
    });
    expect(mockRunAnalysisPipeline).toHaveBeenCalledWith(
      runInfo.path,
      '/project/.ai_workflow/metrics',
      expect.objectContaining({
        thresholds: { bug: 1 },
        skipPromptQuality: true,
        skipSummary: true,
        onProgress: expect.any(Function),
      })
    );
  });

  it('updates progress via onProgress callback', async () => {
    let onProgress;
    mockRunAnalysisPipeline.mockImplementationOnce((_a, _b, opts) => {
      onProgress = opts.onProgress;
      return Promise.resolve(baseReport);
    });
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      result.current.run(runInfo, projectRoot);
    });
    act(() => {
      onProgress('phase1', 2, 5);
    });
    expect(result.current.progress).toEqual({ phase: 'phase1', done: 2, total: 5 });
  });

  it('filters issues by selected category', async () => {
    mockRunAnalysisPipeline.mockResolvedValueOnce(baseReport);
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.run(runInfo, projectRoot);
    });
    act(() => {
      result.current.cycleFilter();
    });
    expect(result.current.filter).toBe('failure');
    expect(result.current.filteredIssues).toEqual([{ category: 'failure', id: 2 }]);
    act(() => {
      result.current.cycleFilter();
    });
    expect(result.current.filter).toBe('performance');
    expect(result.current.filteredIssues).toEqual([{ category: 'performance', id: 3 }]);
    act(() => {
      result.current.cycleFilter();
      result.current.cycleFilter();
      result.current.cycleFilter();
    });
    expect(result.current.filter).toBe('all');
    expect(result.current.filteredIssues.length).toBe(5);
  });

  it('filteredIssues is empty if report is null', () => {
    const { result } = renderHook(() => useAnalysis());
    expect(result.current.filteredIssues).toEqual([]);
  });

  it('cycleFilter wraps around to all', async () => {
    mockRunAnalysisPipeline.mockResolvedValueOnce(baseReport);
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.run(runInfo, projectRoot);
    });
    for (let i = 0; i < 6; i++) {
      act(() => {
        result.current.cycleFilter();
      });
    }
    expect(result.current.filter).toBe('all');
  });
});
