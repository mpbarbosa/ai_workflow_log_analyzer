import { describe, expect, it } from '@jest/globals';

const { App } = await import('../../src/tui/App.js');

describe('App', () => {
  it('exports the root TUI component', () => {
    expect(typeof App).toBe('function');
  });
});
