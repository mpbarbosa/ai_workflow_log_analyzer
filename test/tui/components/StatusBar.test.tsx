import React from 'react';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../../src/tui/components/StatusBar';

describe('StatusBar', () => {
  it('shows the consolidation hint for any open file in the file viewer', () => {
    const { lastFrame } = render(
      <StatusBar
        filter="all"
        focusedPanel="fileviewer"
        canExport={false}
        mode="files"
        fileOpen
      />,
    );

    expect(lastFrame()).toContain('[c]');
    expect(lastFrame()).toContain('Consolidate');
  });

  it('shows the prompt-response fix hint in split view for prompt logs', () => {
    const { lastFrame } = render(
      <StatusBar
        filter="all"
        focusedPanel="fileviewer"
        canExport={false}
        mode="files"
        fileOpen
        promptSplitMode
        isPromptFile
      />,
    );

    expect(lastFrame()).toContain('[c]');
    expect(lastFrame()).toContain('[d]');
    expect(lastFrame()).toContain('[f]');
    expect(lastFrame()).toContain('Analyze');
    expect(lastFrame()).toContain('folder');
    expect(lastFrame()).toContain('Fix issues');
  });

  it('shows the prompt-response fix hint in non-split prompt viewer states', () => {
    const { lastFrame } = render(
      <StatusBar
        filter="all"
        focusedPanel="fileviewer"
        canExport={false}
        mode="files"
        fileOpen
        promptPartsMode
        isPromptFile
      />,
    );

    expect(lastFrame()).toContain('[c]');
    expect(lastFrame()).toContain('[a]');
    expect(lastFrame()).toContain('[b]');
    expect(lastFrame()).toContain('[e]');
    expect(lastFrame()).toContain('[d]');
    expect(lastFrame()).toContain('[f]');
    expect(lastFrame()).toContain('Whole prompt');
    expect(lastFrame()).toContain('Analyze folder');
    expect(lastFrame()).toContain('issues');
  });

  it('shows the workflow execution analysis hint when workflow.log is highlighted in the file tree', () => {
    const { lastFrame } = render(
      <StatusBar
        filter="all"
        focusedPanel="filetree"
        canExport={false}
        mode="files"
        isWorkflowLogFile
      />,
    );

    expect(lastFrame()).toContain('[w]');
    expect(lastFrame()).toContain('execution analysis');
  });

  it('shows the workflow execution analysis hint when workflow.log is open in the file viewer', () => {
    const { lastFrame } = render(
      <StatusBar
        filter="all"
        focusedPanel="fileviewer"
        canExport={false}
        mode="files"
        fileOpen
        isWorkflowLogFile
      />,
    );

    expect(lastFrame()).toContain('[w]');
    expect(lastFrame()).toContain('execution analysis');
  });
});
