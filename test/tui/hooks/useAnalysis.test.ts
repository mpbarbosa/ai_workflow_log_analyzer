import { describe, expect, it } from '@jest/globals';

const { useAnalysis } = await import('../../../src/tui/hooks/useAnalysis.js');

describe('useAnalysis', () => {
  it('exports a hook function', () => {
    expect(typeof useAnalysis).toBe('function');
  });
});
