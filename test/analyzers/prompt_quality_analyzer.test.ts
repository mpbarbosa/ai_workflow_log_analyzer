import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockAnalyzePromptQuality = jest.fn();

jest.unstable_mockModule('../../src/lib/copilot_client', () => ({
  analyzePromptQuality: mockAnalyzePromptQuality,
}));

const { analyzePromptRecord, analyzeAllPrompts } = (await import(
  '../../src/analyzers/prompt_quality_analyzer'
)) as typeof import('../../src/analyzers/prompt_quality_analyzer');

const DEFAULT_THRESHOLDS = {
  promptQualityMinScore: 60,
};

const basePromptRecord = {
  stepId: 'step-1',
  persona: 'dev',
  model: 'gpt-4',
  prompt: 'Write a function to add two numbers.',
  response: 'function add(a, b) { return a + b; }',
  timestamp: new Date('2024-01-01T00:00:00Z'),
};

describe('analyzePromptRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-ignore
    if (globalThis.__pqAnalyzerReset) {
      globalThis.__pqAnalyzerReset();
    }
  });

  it('returns result with no issue if score >= threshold', async () => {
    mockAnalyzePromptQuality.mockResolvedValue({
      score: 80,
      feedback: 'Good prompt.',
      suggestions: [],
    });
    const result = await analyzePromptRecord(basePromptRecord, DEFAULT_THRESHOLDS);
    expect(result.score).toBe(80);
    expect(result.issue).toBeUndefined();
    expect(result.feedback).toBe('Good prompt.');
    expect(result.suggestions).toEqual([]);
  });

  it('returns result with medium severity issue if score below threshold but >= 40', async () => {
    mockAnalyzePromptQuality.mockResolvedValue({
      score: 50,
      feedback: 'Prompt could be more specific.',
      suggestions: ['Add input constraints.'],
    });
    const result = await analyzePromptRecord(basePromptRecord, DEFAULT_THRESHOLDS);
    expect(result.score).toBe(50);
    expect(result.issue).toBeDefined();
    expect(result.issue?.severity).toBe('medium');
    expect(result.issue?.title).toContain('Low prompt quality');
    expect(result.issue?.detail).toBe('Prompt could be more specific.');
    expect(result.issue?.llmAnalysis).toContain('Prompt could be more specific.');
    expect(result.issue?.llmAnalysis).toContain('• Add input constraints.');
  });

  it('returns result with high severity issue if score < 40', async () => {
    mockAnalyzePromptQuality.mockResolvedValue({
      score: 30,
      feedback: 'Prompt is too vague.',
      suggestions: ['Specify the types.', 'Provide examples.'],
    });
    const result = await analyzePromptRecord(basePromptRecord, DEFAULT_THRESHOLDS);
    expect(result.score).toBe(30);
    expect(result.issue).toBeDefined();
    expect(result.issue?.severity).toBe('high');
    expect(result.issue?.llmAnalysis).toContain('• Specify the types.');
    expect(result.issue?.llmAnalysis).toContain('• Provide examples.');
  });

  it('handles prompt truncation in evidence field', async () => {
    mockAnalyzePromptQuality.mockResolvedValue({
      score: 30,
      feedback: 'Bad prompt.',
      suggestions: [],
    });
    const longPrompt = 'a'.repeat(600);
    const record = { ...basePromptRecord, prompt: longPrompt };
    const result = await analyzePromptRecord(record, DEFAULT_THRESHOLDS);
    expect(result.issue?.evidence.length).toBeLessThanOrEqual(500);
    expect(result.issue?.evidence).toBe(longPrompt.slice(0, 500));
  });

  it('uses default thresholds if not provided', async () => {
    mockAnalyzePromptQuality.mockResolvedValue({
      score: 50,
      feedback: 'Prompt could be better.',
      suggestions: [],
    });
    const result = await analyzePromptRecord(basePromptRecord);
    expect(result.score).toBe(50);
    expect(result.issue).toBeDefined();
  });
});

describe('analyzeAllPrompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-ignore
    if (globalThis.__pqAnalyzerReset) {
      globalThis.__pqAnalyzerReset();
    }
  });

  it('analyzes all prompt records sequentially and returns results', async () => {
    mockAnalyzePromptQuality
      .mockResolvedValueOnce({
        score: 80,
        feedback: 'Good prompt.',
        suggestions: [],
      })
      .mockResolvedValueOnce({
        score: 30,
        feedback: 'Bad prompt.',
        suggestions: ['Be more specific.'],
      });

    const records = [
      { ...basePromptRecord, stepId: 'step-1' },
      { ...basePromptRecord, stepId: 'step-2' },
    ];
    const results = await analyzeAllPrompts(records, DEFAULT_THRESHOLDS);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(80);
    expect(results[0].issue).toBeUndefined();
    expect(results[1].score).toBe(30);
    expect(results[1].issue).toBeDefined();
    expect(results[1].issue?.severity).toBe('high');
  });

  it('calls onProgress callback with correct values', async () => {
    mockAnalyzePromptQuality
      .mockResolvedValue({ score: 80, feedback: 'Ok.', suggestions: [] });
    const records = [
      { ...basePromptRecord, stepId: 'step-1' },
      { ...basePromptRecord, stepId: 'step-2' },
      { ...basePromptRecord, stepId: 'step-3' },
    ];
    const progressCalls: Array<[number, number]> = [];
    const onProgress = (done: number, total: number) => progressCalls.push([done, total]);
    await analyzeAllPrompts(records, DEFAULT_THRESHOLDS, onProgress);
    expect(progressCalls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('returns empty array if no records', async () => {
    const results = await analyzeAllPrompts([], DEFAULT_THRESHOLDS);
    expect(results).toEqual([]);
  });

  it('handles errors thrown by analyzePromptQuality', async () => {
    mockAnalyzePromptQuality.mockRejectedValue(new Error('SDK error'));
    const record = { ...basePromptRecord, stepId: 'step-err' };
    await expect(analyzeAllPrompts([record], DEFAULT_THRESHOLDS)).rejects.toThrow('SDK error');
  });
});
