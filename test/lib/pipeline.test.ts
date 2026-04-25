import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockJoin = jest.fn((...args: string[]) => args.join('/'));
const mockParseRunLogsToArray = jest.fn();
const mockParseRunMetadata = jest.fn();
const mockParseRunPrompts = jest.fn();
const mockParseMetrics = jest.fn();
const mockAnalyzeFailures = jest.fn();
const mockAnalyzePerformance = jest.fn();
const mockAnalyzeBugs = jest.fn();
const mockAnalyzeDocumentation = jest.fn();
const mockAnalyzeAllPrompts = jest.fn();
const mockSummarizeReport = jest.fn();

jest.unstable_mockModule('node:path', () => ({
  join: mockJoin,
}));

jest.unstable_mockModule('../../src/parsers/log_parser.js', () => ({
  parseRunLogsToArray: mockParseRunLogsToArray,
  parseRunMetadata: mockParseRunMetadata,
}));

jest.unstable_mockModule('../../src/parsers/prompt_parser.js', () => ({
  parseRunPrompts: mockParseRunPrompts,
}));

jest.unstable_mockModule('../../src/parsers/metrics_parser.js', () => ({
  parseMetrics: mockParseMetrics,
}));

jest.unstable_mockModule('../../src/analyzers/failure_analyzer.js', () => ({
  analyzeFailures: mockAnalyzeFailures,
}));

jest.unstable_mockModule('../../src/analyzers/performance_analyzer.js', () => ({
  analyzePerformance: mockAnalyzePerformance,
}));

jest.unstable_mockModule('../../src/analyzers/bug_analyzer.js', () => ({
  analyzeBugs: mockAnalyzeBugs,
}));

jest.unstable_mockModule('../../src/analyzers/doc_analyzer.js', () => ({
  analyzeDocumentation: mockAnalyzeDocumentation,
}));

jest.unstable_mockModule('../../src/analyzers/prompt_quality_analyzer.js', () => ({
  analyzeAllPrompts: mockAnalyzeAllPrompts,
}));

jest.unstable_mockModule('../../src/lib/ai_client.js', () => ({
  summarizeReport: mockSummarizeReport,
}));

const { DEFAULT_THRESHOLDS } = await import('../../src/types/index.js');
const { runAnalysisPipeline } = await import('../../src/lib/pipeline.js');

const mockEvents = [
  { timestamp: new Date('2024-01-01T00:00:00Z'), type: 'step', message: 'Step 1' },
  { timestamp: new Date('2024-01-01T00:01:00Z'), type: 'step', message: 'Step 2' },
];
const mockPrompts = [
  { id: 1, prompt: 'Prompt 1' },
  { id: 2, prompt: 'Prompt 2' },
];
const mockMetricsData = {
  currentRun: {
    runId: 'run123',
    startTime: new Date('2024-01-01T00:00:00Z'),
    stepCount: 2,
    steps: ['step1', 'step2'],
    totalAiCalls: 5,
    avgAiLatencyMs: 123,
  },
};
const mockRunMeta = { projectRoot: '/project/root' };
const mockFailures = [{ id: 'fail1', category: 'failure', severity: 'critical' }];
const mockPerfIssues = [{ id: 'perf1', category: 'performance', severity: 'warning' }];
const mockBugs = [{ id: 'bug1', category: 'bug', severity: 'critical' }];
const mockDocIssues = [{ id: 'doc1', category: 'documentation', severity: 'info' }];
const mockPromptQuality = [
  { id: 1, issue: { id: 'pq1', category: 'prompt_quality', severity: 'critical' } },
  { id: 2 },
];
const mockSummary = 'Executive summary here.';

describe('runAnalysisPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJoin.mockImplementation((...args: string[]) => args.join('/'));
    mockParseRunLogsToArray.mockResolvedValue(mockEvents);
    mockParseRunPrompts.mockResolvedValue(mockPrompts);
    mockParseMetrics.mockResolvedValue(mockMetricsData);
    mockParseRunMetadata.mockResolvedValue(mockRunMeta);
    mockAnalyzeFailures.mockReturnValue(mockFailures);
    mockAnalyzePerformance.mockReturnValue(mockPerfIssues);
    mockAnalyzeBugs.mockReturnValue(mockBugs);
    mockAnalyzeDocumentation.mockReturnValue(mockDocIssues);
    mockAnalyzeAllPrompts.mockResolvedValue(mockPromptQuality);
    mockSummarizeReport.mockResolvedValue(mockSummary);
  });

  it('runs the full pipeline and returns a complete AnalysisReport (happy path)', async () => {
    const onProgress = jest.fn();
    const report = await runAnalysisPipeline('/runs/workflow_20240101_000000', '/.ai_workflow/metrics', {
      onProgress,
    });

    expect(report.runId).toBe('workflow_20240101_000000');
    expect(report.projectRoot).toBe('/project/root');
    expect(report.metrics).toEqual(mockMetricsData.currentRun);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
      { id: 'pq1', category: 'prompt_quality', severity: 'critical' },
    ]);
    expect(report.promptQuality).toEqual(mockPromptQuality);
    expect(report.counts).toEqual({
      total: 5,
      failures: 1,
      performance: 1,
      bugs: 1,
      documentation: 1,
      promptQuality: 1,
      critical: 3,
    });
    expect(report.summary).toBe(mockSummary);

    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 0, 3);
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 3, 3);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 0, 4);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 4, 4);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 1, 1);
  });

  it('uses opts.projectRoot if provided', async () => {
    const report = await runAnalysisPipeline('/runs/workflow_20240101_000000', '/.ai_workflow/metrics', {
      projectRoot: '/override/root',
    });
    expect(report.projectRoot).toBe('/override/root');
  });

  it('uses DEFAULT_THRESHOLDS if thresholds not provided', async () => {
    await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(mockAnalyzePerformance).toHaveBeenCalledWith(expect.anything(), DEFAULT_THRESHOLDS);
    expect(mockAnalyzeAllPrompts).toHaveBeenCalledWith(expect.anything(), DEFAULT_THRESHOLDS, expect.any(Function));
  });

  it('uses provided thresholds if given', async () => {
    const thresholds = { perf: 42 };
    await runAnalysisPipeline('/runs/dir', '/metrics', { thresholds });
    expect(mockAnalyzePerformance).toHaveBeenCalledWith(expect.anything(), thresholds);
    expect(mockAnalyzeAllPrompts).toHaveBeenCalledWith(expect.anything(), thresholds, expect.any(Function));
  });

  it('skips prompt quality analysis if skipPromptQuality is true', async () => {
    const report = await runAnalysisPipeline('/runs/dir', '/metrics', { skipPromptQuality: true });
    expect(report.promptQuality).toEqual([]);
    expect(report.issues).toEqual([...mockFailures, ...mockPerfIssues, ...mockBugs, ...mockDocIssues]);
    expect(mockAnalyzeAllPrompts).not.toHaveBeenCalled();
  });

  it('skips prompt quality if no prompts are present', async () => {
    mockParseRunPrompts.mockResolvedValueOnce([]);
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.promptQuality).toEqual([]);
    expect(report.issues).toEqual([...mockFailures, ...mockPerfIssues, ...mockBugs, ...mockDocIssues]);
  });

  it('skips summary if skipSummary is true', async () => {
    const report = await runAnalysisPipeline('/runs/dir', '/metrics', { skipSummary: true });
    expect(report.summary).toBeUndefined();
    expect(mockSummarizeReport).not.toHaveBeenCalled();
  });

  it('handles summarizeReport throwing (summary is optional)', async () => {
    mockSummarizeReport.mockRejectedValueOnce(new Error('fail'));
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.summary).toBeUndefined();
  });

  it('builds metrics from events if metricsData.currentRun is missing', async () => {
    mockParseMetrics.mockResolvedValueOnce({});
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.metrics.runId).toBe('dir');
    expect(report.metrics.startTime).toEqual(mockEvents[0].timestamp);
    expect(report.metrics.stepCount).toBe(0);
    expect(report.metrics.steps).toEqual([]);
    expect(report.metrics.totalAiCalls).toBe(0);
    expect(report.metrics.avgAiLatencyMs).toBe(0);
  });

  it('handles missing events (empty array) gracefully', async () => {
    mockParseRunLogsToArray.mockResolvedValueOnce([]);
    mockParseMetrics.mockResolvedValueOnce({});
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.metrics.startTime).toBeInstanceOf(Date);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
      { id: 'pq1', category: 'prompt_quality', severity: 'critical' },
    ]);
  });

  it('handles missing runId in runDir', async () => {
    const report = await runAnalysisPipeline('/runs/', '/metrics');
    expect(report.runId).toBe('');
  });

  it('counts critical issues correctly', async () => {
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.counts.critical).toBe(
      [mockFailures, mockPerfIssues, mockBugs, mockDocIssues, [{ id: 'pq1', severity: 'critical' }]]
        .flat()
        .filter((issue) => issue.severity === 'critical').length
    );
  });

  it('calls onProgress at all expected phases', async () => {
    const onProgress = jest.fn();
    await runAnalysisPipeline('/runs/dir', '/metrics', { onProgress });
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 0, 3);
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 3, 3);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 0, 4);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 4, 4);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 1, 1);
  });

  it('handles promptQuality with no issues', async () => {
    mockAnalyzeAllPrompts.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.promptQuality).toEqual([{ id: 1 }, { id: 2 }]);
    expect(report.issues).toEqual([...mockFailures, ...mockPerfIssues, ...mockBugs, ...mockDocIssues]);
    expect(report.counts.promptQuality).toBe(0);
  });

  it('handles empty issues from all analyzers', async () => {
    mockAnalyzeFailures.mockReturnValueOnce([]);
    mockAnalyzePerformance.mockReturnValueOnce([]);
    mockAnalyzeBugs.mockReturnValueOnce([]);
    mockAnalyzeDocumentation.mockReturnValueOnce([]);
    mockAnalyzeAllPrompts.mockResolvedValueOnce([]);
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.issues).toEqual([]);
    expect(report.counts.total).toBe(0);
  });
});
