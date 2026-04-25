import React from 'react';
import { render } from 'ink-testing-library';
import { HelpOverlay } from '../../../src/tui/components/HelpOverlay.js';

describe('HelpOverlay', () => {
  it('documents the consolidation shortcut in the file viewer section', () => {
    const { lastFrame } = render(<HelpOverlay onClose={() => undefined} />);

    expect(lastFrame()).toContain("selected run's prompts/ log folder");
    expect(lastFrame()).toContain('interactive Copilot session');
  });

  it('documents the prompt-folder analysis shortcut in the file viewer section', () => {
    const { lastFrame } = render(<HelpOverlay onClose={() => undefined} />);

    expect(lastFrame()).toContain("open prompt log file's parent folder");
    expect(lastFrame()).toContain('prompt .md files only');
  });

  it('documents the reverse-prompt shortcut in the file viewer section', () => {
    const { lastFrame } = render(<HelpOverlay onClose={() => undefined} />);

    expect(lastFrame()).toContain('Reverse-prompt the selected part');
    expect(lastFrame()).toContain('master-prompt synthesis');
  });

  it('documents the whole-prompt reverse shortcut in the file viewer section', () => {
    const { lastFrame } = render(<HelpOverlay onClose={() => undefined} />);

    expect(lastFrame()).toContain('Reverse-prompt the whole prompt');
    expect(lastFrame()).toContain('current prompt log');
  });
});
