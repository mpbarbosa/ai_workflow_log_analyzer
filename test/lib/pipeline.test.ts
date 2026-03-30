import { runAnalysisPipeline } from './pipeline';
import { DEFAULT_THRESHOLDS } from '../types/index';

// Mocks for all imported modules
jest.mock('node:path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

jest.mock('../parsers/log_parser.js', () => ({
  parseRunLogsToArray: jest.fn(),
  parseRunMetadata: jest.fn(),
}));

jest.mock('../parsers/prompt_parser.js', () => ({
  parseRunPrompts: jest.fn(),
}));

jest.mock('../parsers/metrics_parser.js', () => ({
  parseMetrics: jest.fn(),
}));

jest.mock('../analyzers/failure_analyzer.js', () => ({
  analyzeFailures: jest.fn(),
}));

jest.mock('../analyzers/performance_analyzer.js', () => ({
  analyzePerformance: jest.fn(),
}));

jest.mock('../analyzers/bug_analyzer.js', () => ({
  analyzeBugs: jest.fn(),
}));

jest.mock('../analyzers/doc_analyzer.js', () => ({
  analyzeDocumentation: jest.fn(),
}));

jest.mock('../analyzers/prompt_quality_analyzer.js', () => ({
  analyzeAllPrompts: jest.fn(),
}));

jest.mock('./copilot_client.js', () => ({
  summarizeReport: jest.fn(),
}));

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
const mockFailures = [{ id: 'fail1', severity: 'critical' }];
const mockPerfIssues = [{ id: 'perf1', severity: 'warning' }];
const mockBugs = [{ id: 'bug1', severity: 'critical' }];
const mockDocIssues = [{ id: 'doc1', severity: 'info' }];
const mockPromptQuality = [
  { id: 1, issue: { id: 'pq1', severity: 'critical' } },
  { id: 2 },
];
const mockSummary = 'Executive summary here.';

describe('runAnalysisPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('../parsers/log_parser.js').parseRunLogsToArray.mockResolvedValue(mockEvents);
    require('../parsers/prompt_parser.js').parseRunPrompts.mockResolvedValue(mockPrompts);
    require('../parsers/metrics_parser.js').parseMetrics.mockResolvedValue(mockMetricsData);
    require('../parsers/log_parser.js').parseRunMetadata.mockResolvedValue(mockRunMeta);
    require('../analyzers/failure_analyzer.js').analyzeFailures.mockReturnValue(mockFailures);
    require('../analyzers/performance_analyzer.js').analyzePerformance.mockReturnValue(mockPerfIssues);
    require('../analyzers/bug_analyzer.js').analyzeBugs.mockReturnValue(mockBugs);
    require('../analyzers/doc_analyzer.js').analyzeDocumentation.mockReturnValue(mockDocIssues);
    require('../analyzers/prompt_quality_analyzer.js').analyzeAllPrompts.mockResolvedValue(mockPromptQuality);
    require('./copilot_client.js').summarizeReport.mockResolvedValue(mockSummary);
  });

  it('runs the full pipeline and returns a complete AnalysisReport (happy path)', async () => {
    const onProgress = jest.fn();
    const report = await runAnalysisPipeline(
      '/runs/workflow_20240101_000000',
      '/.ai_workflow/metrics',
      { onProgress }
    );

    expect(report.runId).toBe('workflow_20240101_000000');
    expect(report.projectRoot).toBe('/project/root');
    expect(report.metrics).toEqual(mockMetricsData.currentRun);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
      { id: 'pq1', severity: 'critical' },
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

    // onProgress called for each phase
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 0, 3);
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 3, 3);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 0, 4);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 4, 4);
    expect(onProgress).toHaveBeenCalledWith('Prompt quality', 1, 2);
    expect(onProgress).toHaveBeenCalledWith('Prompt quality', 2, 2);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 1, 1);
  });

  it('uses opts.projectRoot if provided', async () => {
    const report = await runAnalysisPipeline(
      '/runs/workflow_20240101_000000',
      '/.ai_workflow/metrics',
      { projectRoot: '/override/root' }
    );
    expect(report.projectRoot).toBe('/override/root');
  });

  it('uses DEFAULT_THRESHOLDS if thresholds not provided', async () => {
    await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(require('../analyzers/performance_analyzer.js').analyzePerformance)
      .toHaveBeenCalledWith(expect.anything(), DEFAULT_THRESHOLDS);
    expect(require('../analyzers/prompt_quality_analyzer.js').analyzeAllPrompts)
      .toHaveBeenCalledWith(expect.anything(), DEFAULT_THRESHOLDS, expect.any(Function));
  });

  it('uses provided thresholds if given', async () => {
    const thresholds = { perf: 42 };
    await runAnalysisPipeline('/runs/dir', '/metrics', { thresholds });
    expect(require('../analyzers/performance_analyzer.js').analyzePerformance)
      .toHaveBeenCalledWith(expect.anything(), thresholds);
    expect(require('../analyzers/prompt_quality_analyzer.js').analyzeAllPrompts)
      .toHaveBeenCalledWith(expect.anything(), thresholds, expect.any(Function));
  });

  it('skips prompt quality analysis if skipPromptQuality is true', async () => {
    const report = await runAnalysisPipeline('/runs/dir', '/metrics', { skipPromptQuality: true });
    expect(report.promptQuality).toEqual([]);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
    ]);
    expect(require('../analyzers/prompt_quality_analyzer.js').analyzeAllPrompts).not.toHaveBeenCalled();
  });

  it('skips prompt quality if no prompts are present', async () => {
    require('../parsers/prompt_parser.js').parseRunPrompts.mockResolvedValueOnce([]);
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.promptQuality).toEqual([]);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
    ]);
  });

  it('skips summary if skipSummary is true', async () => {
    const report = await runAnalysisPipeline('/runs/dir', '/metrics', { skipSummary: true });
    expect(report.summary).toBeUndefined();
    expect(require('./copilot_client.js').summarizeReport).not.toHaveBeenCalled();
  });

  it('handles summarizeReport throwing (summary is optional)', async () => {
    require('./copilot_client.js').summarizeReport.mockRejectedValueOnce(new Error('fail'));
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.summary).toBeUndefined();
  });

  it('builds metrics from events if metricsData.currentRun is missing', async () => {
    require('../parsers/metrics_parser.js').parseMetrics.mockResolvedValueOnce({});
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.metrics.runId).toBe('dir');
    expect(report.metrics.startTime).toEqual(mockEvents[0].timestamp);
    expect(report.metrics.stepCount).toBe(0);
    expect(report.metrics.steps).toEqual([]);
    expect(report.metrics.totalAiCalls).toBe(0);
    expect(report.metrics.avgAiLatencyMs).toBe(0);
  });

  it('handles missing events (empty array) gracefully', async () => {
    require('../parsers/log_parser.js').parseRunLogsToArray.mockResolvedValueOnce([]);
    require('../parsers/metrics_parser.js').parseMetrics.mockResolvedValueOnce({});
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.metrics.startTime).toBeInstanceOf(Date);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
      { id: 'pq1', severity: 'critical' },
    ]);
  });

  it('handles missing runId in runDir', async () => {
    const report = await runAnalysisPipeline('/runs/', '/metrics');
    expect(report.runId).toBe('runs');
  });

  it('counts critical issues correctly', async () => {
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.counts.critical).toBe(
      [mockFailures, mockPerfIssues, mockBugs, mockDocIssues, [{ id: 'pq1', severity: 'critical' }]]
        .flat()
        .filter((i) => i.severity === 'critical').length
    );
  });

  it('calls onProgress at all expected phases', async () => {
    const onProgress = jest.fn();
    await runAnalysisPipeline('/runs/dir', '/metrics', { onProgress });
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 0, 3);
    expect(onProgress).toHaveBeenCalledWith('Parsing logs', 3, 3);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 0, 4);
    expect(onProgress).toHaveBeenCalledWith('Analyzing', 4, 4);
    expect(onProgress).toHaveBeenCalledWith('Prompt quality', 1, 2);
    expect(onProgress).toHaveBeenCalledWith('Prompt quality', 2, 2);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Summarizing', 1, 1);
  });

  it('handles promptQuality with no issues', async () => {
    require('../analyzers/prompt_quality_analyzer.js').analyzeAllPrompts.mockResolvedValueOnce([
      { id: 1 }, { id: 2 }
    ]);
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.promptQuality).toEqual([{ id: 1 }, { id: 2 }]);
    expect(report.issues).toEqual([
      ...mockFailures,
      ...mockPerfIssues,
      ...mockBugs,
      ...mockDocIssues,
    ]);
    expect(report.counts.promptQuality).toBe(0);
  });

  it('handles empty issues from all analyzers', async () => {
    require('../analyzers/failure_analyzer.js').analyzeFailures.mockReturnValueOnce([]);
    require('../analyzers/performance_analyzer.js').analyzePerformance.mockReturnValueOnce([]);
    require('../analyzers/bug_analyzer.js').analyzeBugs.mockReturnValueOnce([]);
    require('../analyzers/doc_analyzer.js').analyzeDocumentation.mockReturnValueOnce([]);
    require('../analyzers/prompt_quality_analyzer.js').analyzeAllPrompts.mockResolvedValueOnce([]);
    const report = await runAnalysisPipeline('/runs/dir', '/metrics');
    expect(report.issues).toEqual([]);
    expect(report.counts.total).toBe(0);
  });
});
