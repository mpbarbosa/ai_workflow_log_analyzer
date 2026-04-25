import React from 'react';
import { render } from 'ink-testing-library';
import { DetailOverlay } from '../../../src/tui/components/DetailOverlay';

const baseIssue = {
  title: 'Test Issue',
  severity: 'high',
  category: 'bug',
  detail: 'This is a detailed description of the issue.',
  stepId: 'step-1',
  evidence: 'Evidence goes here.',
  llmAnalysis: 'AI analysis goes here.',
};

describe('DetailOverlay', () => {
  it('renders all fields for a full issue', () => {
    const { lastFrame } = render(<DetailOverlay issue={baseIssue} onClose={jest.fn()} />);
    const frame = lastFrame();
    expect(frame).toContain('ISSUE DETAIL');
    expect(frame).toContain('Test Issue');
    expect(frame).toContain('Severity:');
    expect(frame).toContain('high');
    expect(frame).toContain('Category:');
    expect(frame).toContain('bug');
    expect(frame).toContain('Step:');
    expect(frame).toContain('step-1');
    expect(frame).toContain('Detail');
    expect(frame).toContain('This is a detailed description of the issue.');
    expect(frame).toContain('Evidence');
    expect(frame).toContain('Evidence goes here.');
    expect(frame).toContain('AI Analysis');
    expect(frame).toContain('AI analysis goes here.');
    expect(frame).toContain('[Esc / Enter] Close');
  });

  it('renders without evidence and llmAnalysis', () => {
    const issue = { ...baseIssue, evidence: undefined, llmAnalysis: undefined };
    const { lastFrame } = render(<DetailOverlay issue={issue} onClose={jest.fn()} />);
    const frame = lastFrame();
    expect(frame).toContain('Test Issue');
    expect(frame).not.toContain('Evidence');
    expect(frame).not.toContain('AI Analysis');
  });

  it('renders without stepId', () => {
    const issue = { ...baseIssue, stepId: undefined };
    const { lastFrame } = render(<DetailOverlay issue={issue} onClose={jest.fn()} />);
    const frame = lastFrame();
    expect(frame).not.toContain('Step:');
  });

  it('renders unknown severity with white color', () => {
    const issue = { ...baseIssue, severity: 'unknown' };
    const { lastFrame } = render(<DetailOverlay issue={issue} onClose={jest.fn()} />);
    const frame = lastFrame();
    expect(frame).toContain('unknown');
  });

  it('truncates evidence to 400 chars', () => {
    const longEvidence = 'x'.repeat(500);
    const issue = { ...baseIssue, evidence: longEvidence };
    const { lastFrame } = render(<DetailOverlay issue={issue} onClose={jest.fn()} />);
    const frame = lastFrame();
    expect(frame).toContain('Evidence');
    expect((frame.match(/x/g) ?? []).length).toBe(400);
  });

  it('renders minimal issue', () => {
    const issue = {
      title: 'Minimal',
      severity: 'low',
      category: 'documentation',
      detail: 'Minimal detail.',
    };
    const { lastFrame } = render(<DetailOverlay issue={issue} onClose={jest.fn()} />);
    const frame = lastFrame();
    expect(frame).toContain('Minimal');
    expect(frame).toContain('low');
    expect(frame).toContain('documentation');
    expect(frame).toContain('Minimal detail.');
  });
});
