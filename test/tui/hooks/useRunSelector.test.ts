import { describe, expect, it } from '@jest/globals';

const { useRunSelector } = await import('../../../src/tui/hooks/useRunSelector.js');

describe('useRunSelector', () => {
  it('exports a hook function', () => {
    expect(typeof useRunSelector).toBe('function');
  });
});
