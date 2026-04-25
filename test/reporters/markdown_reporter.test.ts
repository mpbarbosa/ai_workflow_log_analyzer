import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockWriteFile = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  writeFile: mockWriteFile,
}));

const { toMarkdown, writeMarkdownReport } = await import('../../src/reporters/markdown_reporter.js');

const baseDate = new Date('2024-01-01T12:00:00.000Z');
const makeIssue = (overrides = {}) => ({
  title: 'Test Issue',
  category: 'bug',
  severity: 'high',
  detail: 'This is a test issue.',
  stepId: 'step-1',
  timestamp: baseDate,
  rootCause: 'Root cause details.',
  fixRecommendation: 'Fix it!',
  evidence: 'Evidence details',
  llmAnalysis: 'AI says: fix this.',
  ...overrides,
});

const makePromptQuality = (overrides = {}) => ({
  promptRecord: { stepId: 'step-2', persona: 'dev' },
  score: 70,
  feedback: 'Needs improvement.',
  suggestions: ['Use clearer instructions.'],
  issue: true,
  ...overrides,
});

const makeReport = (overrides = {}) => ({
  runId: 'run-123',
  analyzedAt: baseDate,
  counts: {
    critical: 1,
    failures: 2,
    performance: 3,
    bugs: 4,
    promptQuality: 5,
    total: 15,
  },
  metrics: {
    startTime: baseDate,
    stepCount: 10,
    totalAiCalls: 20,
    avgAiLatencyMs: 2500,
  },
  issues: [],
  promptQuality: [],
  summary: 'All systems nominal.',
  ...overrides,
});

describe('markdown_reporter', () => {
  afterEach(() => {
    mockWriteFile.mockReset();
  });

  describe('toMarkdown', () => {
    it('renders a minimal report', () => {
      const report = makeReport();
      const md = toMarkdown(report as never);
      expect(md).toContain('# AI Workflow Log Analysis Report');
      expect(md).toContain('**Run ID**: `run-123`');
      expect(md).toContain('**Analyzed At**: 2024-01-01T12:00:00.000Z');
      expect(md).toContain('## Executive Summary');
      expect(md).toContain('All systems nominal.');
      expect(md).toContain('| 🔴 Critical | 1 |');
      expect(md).toContain('| **Total** | **15** |');
    });

    it('renders issues by category with all fields', () => {
      const issue = makeIssue();
      const report = makeReport({ issues: [issue] });
      const md = toMarkdown(report as never);
      expect(md).toContain('## Bug Issues (1)');
      expect(md).toContain('### 🟠 Test Issue');
      expect(md).toContain('- **Category**: Bug');
      expect(md).toContain('- **Severity**: high');
      expect(md).toContain('- **Step**: `step-1`');
      expect(md).toContain('- **Time**: 2024-01-01T12:00:00.000Z');
      expect(md).toContain('This is a test issue.');
      expect(md).toContain('**Root Cause**: Root cause details.');
      expect(md).toContain('**Recommended Fix**: Fix it!');
      expect(md).toContain('<details><summary>Evidence</summary>');
      expect(md).toContain('Evidence details');
      expect(md).toContain('**AI Analysis**:');
      expect(md).toContain('AI says: fix this.');
    });

    it('renders issues with missing optional fields', () => {
      const issue = makeIssue({
        stepId: undefined,
        timestamp: undefined,
        rootCause: undefined,
        fixRecommendation: undefined,
        evidence: undefined,
        llmAnalysis: undefined,
      });
      const report = makeReport({ issues: [issue] });
      const md = toMarkdown(report as never);
      expect(md).not.toContain('**Step**:');
      expect(md).not.toContain('**Time**:');
      expect(md).not.toContain('**Root Cause**:');
      expect(md).not.toContain('**Recommended Fix**:');
      expect(md).not.toContain('<details><summary>Evidence</summary>');
      expect(md).not.toContain('**AI Analysis**:');
    });

    it('ignores unknown issue categories in grouped output', () => {
      const issue = makeIssue({ severity: 'unknown', category: 'mystery' });
      const report = makeReport({ issues: [issue] });
      const md = toMarkdown(report as never);
      expect(md).not.toContain('## Unknown Issues');
      expect(md).not.toContain('### ⚪ Test Issue');
    });

    it('renders multiple categories and skips empty ones', () => {
      const issues = [
        makeIssue({ category: 'failure', title: 'Failure 1' }),
        makeIssue({ category: 'performance', title: 'Perf 1' }),
        makeIssue({ category: 'bug', title: 'Bug 1' }),
        makeIssue({ category: 'documentation', title: 'Doc 1' }),
        makeIssue({ category: 'prompt_quality', title: 'Prompt 1' }),
      ];
      const report = makeReport({ issues });
      const md = toMarkdown(report as never);
      expect(md).toContain('## Failure Issues (1)');
      expect(md).toContain('## Performance Issues (1)');
      expect(md).toContain('## Bug Issues (1)');
      expect(md).toContain('## Documentation Issues (1)');
      expect(md).toContain('## Prompt Quality Issues (1)');
      expect(md).not.toContain('## Unknown Issues');
    });

    it('renders prompt quality details when present', () => {
      const pq = makePromptQuality();
      const report = makeReport({ promptQuality: [pq] });
      const md = toMarkdown(report as never);
      expect(md).toContain('## Prompt Quality Details');
      expect(md).toContain('### Step `step-2` — Persona: `dev`');
      expect(md).toContain('**Quality Score**: `70%`');
      expect(md).toContain('Needs improvement.');
      expect(md).toContain('**Suggestions**:');
      expect(md).toContain('- Use clearer instructions.');
    });

    it('does not render prompt quality details if no issues', () => {
      const pq = makePromptQuality({ issue: false });
      const report = makeReport({ promptQuality: [pq] });
      const md = toMarkdown(report as never);
      expect(md).not.toContain('## Prompt Quality Details');
    });

    it('renders empty suggestions gracefully', () => {
      const pq = makePromptQuality({ suggestions: [] });
      const report = makeReport({ promptQuality: [pq] });
      const md = toMarkdown(report as never);
      expect(md).not.toContain('**Suggestions**:');
    });

    it('handles missing summary', () => {
      const report = makeReport({ summary: undefined });
      const md = toMarkdown(report as never);
      expect(md).not.toContain('## Executive Summary');
    });

    it('handles empty issues and promptQuality arrays', () => {
      const report = makeReport({ issues: [], promptQuality: [] });
      const md = toMarkdown(report as never);
      expect(md).toContain('## Issue Summary');
      expect(md).not.toContain('## Failure Issues');
      expect(md).not.toContain('## Prompt Quality Details');
    });
  });

  describe('writeMarkdownReport', () => {
    it('writes the markdown to the given file', async () => {
      const report = makeReport();
      await writeMarkdownReport(report as never, '/tmp/test.md');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/test.md',
        expect.stringContaining('# AI Workflow Log Analysis Report'),
        'utf8'
      );
    });

    it('propagates write errors', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('disk full'));
      await expect(writeMarkdownReport(makeReport() as never, '/tmp/fail.md')).rejects.toThrow('disk full');
    });
  });
});
