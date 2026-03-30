import { analyzeDocumentation } from '../../src/analyzers/doc_analyzer';

function makeEvent(message: string, stepId?: string) {
  return {
    kind: 'info',
    message,
    stepId,
    raw: message,
    timestamp: new Date('2026-03-29T23:45:00Z'),
  };
}

describe('analyzeDocumentation', () => {
  it('returns empty array for no events', () => {
    expect(analyzeDocumentation([])).toEqual([]);
  });

  it('returns empty array for unrelated events', () => {
    const events = [
      makeEvent('Step completed successfully', 'step_01'),
      makeEvent('All tests passed', 'step_06'),
    ];
    expect(analyzeDocumentation(events)).toEqual([]);
  });

  it('detects zero-output generation after a gap was found', () => {
    const events = [
      makeEvent('Found 4 missing documentation files (0 critical)', 'step_0b'),
      makeEvent('Generated 0 documentation files', 'step_0b'),
    ];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'documentation',
      severity: 'high',
      stepId: 'step_0b',
      title: 'Documentation generation produced no output in step_0b',
      detail: expect.stringContaining('4 missing documentation file(s) but generated 0'),
    });
  });

  it('does not flag zero-output when no gap was detected first', () => {
    const events = [makeEvent('Generated 0 documentation files', 'step_0b')];
    expect(analyzeDocumentation(events)).toHaveLength(0);
  });

  it('does not flag generation when output count is > 0', () => {
    const events = [
      makeEvent('Found 3 missing documentation files (0 critical)', 'step_0b'),
      makeEvent('Generated 3 documentation files', 'step_0b'),
    ];
    expect(analyzeDocumentation(events)).toHaveLength(0);
  });

  it('detects AI response parse failure', () => {
    const events = [makeEvent('AI response not parsed (0 docs)', 'step_0b')];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'documentation',
      severity: 'high',
      stepId: 'step_0b',
      title: 'AI response parse failure in step_0b',
      detail: expect.stringContaining('prose instead of the expected format'),
    });
  });

  it('detects missing documentation directory', () => {
    const events = [makeEvent('Documentation directory not found: docs', 'step_02_5')];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'documentation',
      severity: 'medium',
      stepId: 'step_02_5',
      title: 'Documentation directory not found in step_02_5',
    });
  });

  it('detects version consistency issues when count > 0', () => {
    const events = [makeEvent('Version check: 2 issue(s) found', 'step_02')];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'documentation',
      severity: 'medium',
      stepId: 'step_02',
      title: 'Documentation version inconsistency in step_02',
      detail: expect.stringContaining('2 inconsistency issue(s)'),
    });
  });

  it('escalates version issue severity to high when count >= 3', () => {
    const events = [makeEvent('Version check: 3 issue(s) found', 'step_02')];
    const issues = analyzeDocumentation(events);
    expect(issues[0].severity).toBe('high');
  });

  it('does not flag version check when count is 0', () => {
    const events = [makeEvent('Version check: 0 issue(s) found', 'step_02')];
    expect(analyzeDocumentation(events)).toHaveLength(0);
  });

  it('detects broken links when count > 0', () => {
    const events = [makeEvent('Link check: 3 broken link(s)', 'step_02')];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'documentation',
      severity: 'medium',
      stepId: 'step_02',
      title: 'Broken documentation links in step_02',
      detail: expect.stringContaining('3 broken link(s)'),
    });
  });

  it('does not flag broken links when count is 0', () => {
    const events = [makeEvent('Link check: 0 broken link(s)', 'step_02')];
    expect(analyzeDocumentation(events)).toHaveLength(0);
  });

  it('flags unresolved gap when gap is detected but no generation event follows', () => {
    const events = [makeEvent('Found 2 missing documentation files (0 critical)', 'step_0b')];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      category: 'documentation',
      severity: 'medium',
      stepId: 'step_0b',
      title: 'Unresolved documentation gap in step_0b',
      detail: expect.stringContaining('2 missing documentation file(s)'),
    });
  });

  it('does not create unresolved gap issue when gap count is 0', () => {
    const events = [makeEvent('Found 0 missing documentation files (0 critical)', 'step_0b')];
    expect(analyzeDocumentation(events)).toHaveLength(0);
  });

  it('detects multiple issues in a realistic event stream', () => {
    const events = [
      makeEvent('Found 4 missing documentation files (0 critical)', 'step_0b'),
      makeEvent('AI response not parsed (0 docs)', 'step_0b'),
      makeEvent('Generated 0 documentation files', 'step_0b'),
      makeEvent('Version check: 2 issue(s) found', 'step_02'),
      makeEvent('Link check: 0 broken link(s)', 'step_02'),
    ];
    const issues = analyzeDocumentation(events);
    // zero-output + AI parse failure + version issue
    expect(issues).toHaveLength(3);
    const categories = issues.map((i) => i.category);
    expect(categories.every((c) => c === 'documentation')).toBe(true);
    const severities = issues.map((i) => i.severity);
    expect(severities).toContain('high');
    expect(severities).toContain('medium');
  });

  it('handles events without stepId gracefully', () => {
    const events = [
      makeEvent('AI response not parsed (0 docs)'),
      makeEvent('Documentation directory not found: docs'),
    ];
    const issues = analyzeDocumentation(events);
    expect(issues).toHaveLength(2);
    expect(issues[0].stepId).toBeUndefined();
    expect(issues[0].title).toBe('AI response parse failure');
    expect(issues[1].title).toBe('Documentation directory not found');
  });
});
