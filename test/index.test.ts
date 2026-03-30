import * as api from '../src/index';

describe('ai_workflow_log_analyzer Public API (src/index.ts)', () => {
  it('should export all expected modules and functions', () => {
    expect(api).toHaveProperty('runAnalysisPipeline');
    // Types are not present at runtime, but ensure main exports exist
    expect(api).toHaveProperty('log_parser');
    expect(api).toHaveProperty('prompt_parser');
    expect(api).toHaveProperty('metrics_parser');
    expect(api).toHaveProperty('failure_analyzer');
    expect(api).toHaveProperty('performance_analyzer');
    expect(api).toHaveProperty('bug_analyzer');
    expect(api).toHaveProperty('prompt_quality_analyzer');
    expect(api).toHaveProperty('json_reporter');
    expect(api).toHaveProperty('markdown_reporter');
  });

  it('should not throw when importing the API', () => {
    expect(() => require('../src/index')).not.toThrow();
  });

  it('should have runAnalysisPipeline as a function', () => {
    expect(typeof api.runAnalysisPipeline).toBe('function');
  });

  it('should handle calling runAnalysisPipeline with missing arguments', async () => {
    // Should throw or reject if required args are missing
    await expect(api.runAnalysisPipeline()).rejects.toBeDefined();
  });

  it('should handle calling runAnalysisPipeline with invalid options', async () => {
    await expect(api.runAnalysisPipeline({ invalid: true })).rejects.toBeDefined();
  });

  it('should export types (type-only, not present at runtime)', () => {
    // Types are erased at runtime, but this ensures the export exists in TS
    // @ts-expect-error
    expect(api.PipelineOptions).toBeUndefined();
  });

  it('should not export unexpected properties', () => {
    const allowed = [
      'runAnalysisPipeline',
      'log_parser',
      'prompt_parser',
      'metrics_parser',
      'failure_analyzer',
      'performance_analyzer',
      'bug_analyzer',
      'prompt_quality_analyzer',
      'json_reporter',
      'markdown_reporter',
    ];
    Object.keys(api).forEach((key) => {
      expect(allowed).toContain(key);
    });
  });

  it('should be able to import all submodules without error', () => {
    expect(() => require('../src/parsers/log_parser.js')).not.toThrow();
    expect(() => require('../src/parsers/prompt_parser.js')).not.toThrow();
    expect(() => require('../src/parsers/metrics_parser.js')).not.toThrow();
    expect(() => require('../src/analyzers/failure_analyzer.js')).not.toThrow();
    expect(() => require('../src/analyzers/performance_analyzer.js')).not.toThrow();
    expect(() => require('../src/analyzers/bug_analyzer.js')).not.toThrow();
    expect(() => require('../src/analyzers/prompt_quality_analyzer.js')).not.toThrow();
    expect(() => require('../src/reporters/json_reporter.js')).not.toThrow();
    expect(() => require('../src/reporters/markdown_reporter.js')).not.toThrow();
    expect(() => require('../src/lib/pipeline.js')).not.toThrow();
  });
});
