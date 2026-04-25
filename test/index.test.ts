import * as api from '../src/index.js';

describe('ai_workflow_log_analyzer Public API (src/index.ts)', () => {
  it('exports the expected modules and functions', () => {
    expect(api).toHaveProperty('runAnalysisPipeline');
    expect(api).toHaveProperty('parseRunLogsToArray');
    expect(api).toHaveProperty('parseRunPrompts');
    expect(api).toHaveProperty('parseMetrics');
    expect(api).toHaveProperty('analyzeFailures');
    expect(api).toHaveProperty('analyzePerformance');
    expect(api).toHaveProperty('analyzeBugs');
    expect(api).toHaveProperty('analyzeAllPrompts');
    expect(api).toHaveProperty('toJson');
    expect(api).toHaveProperty('toMarkdown');
  });

  it('imports the public API and submodules without error', async () => {
    await expect(import('../src/index.js')).resolves.toBeDefined();
    await expect(import('../src/parsers/log_parser.js')).resolves.toBeDefined();
    await expect(import('../src/parsers/prompt_parser.js')).resolves.toBeDefined();
    await expect(import('../src/parsers/metrics_parser.js')).resolves.toBeDefined();
    await expect(import('../src/analyzers/failure_analyzer.js')).resolves.toBeDefined();
    await expect(import('../src/analyzers/performance_analyzer.js')).resolves.toBeDefined();
    await expect(import('../src/analyzers/bug_analyzer.js')).resolves.toBeDefined();
    await expect(import('../src/analyzers/prompt_quality_analyzer.js')).resolves.toBeDefined();
    await expect(import('../src/reporters/json_reporter.js')).resolves.toBeDefined();
    await expect(import('../src/reporters/markdown_reporter.js')).resolves.toBeDefined();
    await expect(import('../src/lib/pipeline.js')).resolves.toBeDefined();
  });

  it('exposes runAnalysisPipeline as a function', () => {
    expect(typeof api.runAnalysisPipeline).toBe('function');
  });

  it('rejects invalid runAnalysisPipeline calls', async () => {
    await expect(api.runAnalysisPipeline()).rejects.toBeDefined();
    await expect(api.runAnalysisPipeline({ invalid: true } as never)).rejects.toBeDefined();
  });

  it('does not export runtime-only type symbols', () => {
    // @ts-expect-error runtime assertion for erased type exports
    expect(api.PipelineOptions).toBeUndefined();
  });

  it('does not expose unexpected top-level exports', () => {
    const allowed = new Set([
      'DEFAULT_THRESHOLDS',
      'analyzeAllPrompts',
      'analyzeBugs',
      'analyzeFailures',
      'analyzePerformance',
      'analyzePromptRecord',
      'buildMetricsSummary',
      'parseLine',
      'parseMetrics',
      'parseMetricsJson',
      'parsePromptFile',
      'parsePromptFileContent',
      'parsePromptParts',
      'parseRunLogs',
      'parseRunLogsToArray',
      'parseRunMetadata',
      'parseRunPrompts',
      'runAnalysisPipeline',
      'streamLogFile',
      'toJson',
      'toMarkdown',
      'writeJsonReport',
      'writeMarkdownReport',
    ]);

    Object.keys(api).forEach((key) => {
      expect(allowed.has(key)).toBe(true);
    });
  });
});
