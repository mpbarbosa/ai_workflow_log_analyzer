import React from 'react';
import { render, act } from 'ink-testing-library';
import { App } from '../../src/tui/App';

// Mock Ink hooks and components
jest.mock('ink', () => ({
  ...jest.requireActual('ink'),
  useApp: () => ({ exit: jest.fn() }),
  useInput: (handler: any) => { global.__inputHandler = handler; },
  useStdin: () => ({ setRawMode: jest.fn() }),
  useStdout: () => ({ stdout: { columns: 120, rows: 40 } }),
  Box: (props: any) => <div>{props.children}</div>,
  Text: (props: any) => <span>{props.children}</span>,
}));

// Mock node modules
jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('node:fs/promises', () => ({ readFile: jest.fn().mockResolvedValue('file content') }));
jest.mock('node:path', () => ({
  basename: jest.fn((p: string) => p.split('/').pop()),
  dirname: jest.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  join: (...args: string[]) => args.join('/'),
}));

// Mock subcomponents
jest.mock('../../src/tui/components/Header', () => ({
  Header: (props: any) => <div data-testid="header">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/StatusBar', () => ({
  StatusBar: (props: any) => <div data-testid="statusbar">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/RunSelector', () => ({
  RunSelector: (props: any) => <div data-testid="runselector">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/IssuesPanel', () => ({
  IssuesPanel: (props: any) => <div data-testid="issuespanel">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/MetricsPanel', () => ({
  MetricsPanel: (props: any) => <div data-testid="metricspanel">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/DetailOverlay', () => ({
  DetailOverlay: (props: any) => <div data-testid="detailoverlay">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/LLMStreamPanel', () => ({
  LLMStreamPanel: (props: any) => <div data-testid="llmstreampanel">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/FileTree', () => ({
  FileTree: (props: any) => <div data-testid="filetree">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/FileViewer', () => ({
  FileViewer: (props: any) => <div data-testid="fileviewer">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/PromptSplitViewer', () => ({
  PromptSplitViewer: (props: any) => <div data-testid="promptsplitviewer">{JSON.stringify(props)}</div>,
  isPromptFile: (p: string) => p.endsWith('.md'),
  isAnalysisFile: (p: string) => p.endsWith('.analysis'),
}));
jest.mock('../../src/tui/components/PromptPartsViewer', () => ({
  PromptPartsViewer: (props: any) => <div data-testid="promptpartsviewer">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/PartAnalysisOverlay', () => ({
  PartAnalysisOverlay: (props: any) => <div data-testid="partanalysisoverlay">{JSON.stringify(props)}</div>,
}));
jest.mock('../../src/tui/components/HelpOverlay', () => ({
  HelpOverlay: (props: any) => <div data-testid="helpoverlay">{JSON.stringify(props)}</div>,
}));

// Mock hooks
jest.mock('../../src/tui/hooks/useRunSelector', () => ({
  useRunSelector: () => ({
    runs: [{ runId: 'run1', path: '/p/run1', startTime: new Date(), stepCount: 2 }],
    selectedIndex: 0,
    selectedRun: { runId: 'run1', path: '/p/run1', startTime: new Date(), stepCount: 2 },
    loading: false,
    select: jest.fn(),
  }),
}));
jest.mock('../../src/tui/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    state: 'done',
    report: {
      runId: 'run1',
      counts: { total: 2, critical: 1 },
      metrics: { foo: 'bar' },
      issues: [{ id: 1, category: 'bug' }, { id: 2, category: 'failure' }],
    },
    error: null,
    progress: { phase: '', done: 0, total: 0 },
    filter: 'all',
    filteredIssues: [{ id: 1, category: 'bug' }, { id: 2, category: 'failure' }],
    run: jest.fn(),
    cycleFilter: jest.fn(),
  }),
}));
jest.mock('../../src/tui/hooks/useFileTree', () => ({
  useFileTree: () => ({
    entries: [{ filePath: '/file.md', isDir: false }],
    selectedIndex: 0,
    selectedEntry: { filePath: '/file.md', isDir: false },
    loading: false,
    moveUp: jest.fn(),
    moveDown: jest.fn(),
    toggleExpand: jest.fn(),
  }),
}));

describe('App', () => {
  const baseProps = { projectRoot: '/project' };

  it('renders header, statusbar, runselector, issuespanel, and metricspanel in analysis mode', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    expect(lastFrame()).toContain('data-testid="header"');
    expect(lastFrame()).toContain('data-testid="statusbar"');
    expect(lastFrame()).toContain('data-testid="runselector"');
    expect(lastFrame()).toContain('data-testid="issuespanel"');
    expect(lastFrame()).toContain('data-testid="metricspanel"');
  });

  it('shows HelpOverlay when showHelp is true', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('h', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="helpoverlay"');
  });

  it('toggles to files mode and renders filetree', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('v', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="filetree"');
  });

  it('opens file viewer when file is selected in files mode', () => {
    // Simulate files mode and file open
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('v', { ctrl: false }); // switch to files mode
    });
    act(() => {
      global.__inputHandler('\r', { ctrl: false, return: true }); // open file
    });
    expect(
      lastFrame().includes('data-testid="fileviewer"') ||
      lastFrame().includes('data-testid="filetree"')
    ).toBe(true);
  });

  it('shows error message if error is present', () => {
    jest.mock('../../src/tui/hooks/useAnalysis', () => ({
      useAnalysis: () => ({
        state: 'error',
        report: null,
        error: 'Something went wrong',
        progress: { phase: '', done: 0, total: 0 },
        filter: 'all',
        filteredIssues: [],
        run: jest.fn(),
        cycleFilter: jest.fn(),
      }),
    }));
    const { lastFrame } = render(<App {...baseProps} />);
    expect(lastFrame()).toContain('Error: Something went wrong');
  });

  it('shows DetailOverlay when showDetail is true and issue is selected', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('\r', { ctrl: false, return: true }); // select issue
    });
    expect(lastFrame()).toContain('data-testid="detailoverlay"');
  });

  it('shows LLMStreamPanel when showStream is true and issue is selected', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('r', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="llmstreampanel"');
  });

  it('cycles filter when f is pressed in issues panel', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('f', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="issuespanel"');
  });

  it('calls exit on q or ctrl+c', () => {
    const exit = jest.fn();
    jest.spyOn(require('ink'), 'useApp').mockReturnValue({ exit });
    render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('q', { ctrl: false });
    });
    expect(exit).toHaveBeenCalled();
    act(() => {
      global.__inputHandler('c', { ctrl: true });
    });
    expect(exit).toHaveBeenCalled();
  });

  it('handles keyboard navigation in runs and issues panels', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('', { upArrow: true });
      global.__inputHandler('', { downArrow: true });
    });
    expect(lastFrame()).toContain('data-testid="runselector"');
    act(() => {
      global.__inputHandler('', { upArrow: true });
      global.__inputHandler('', { downArrow: true });
    });
    expect(lastFrame()).toContain('data-testid="issuespanel"');
  });

  it('shows PromptSplitViewer, PromptPartsViewer, PartAnalysisOverlay, and zoomed panes in files mode', () => {
    const { lastFrame } = render(<App {...baseProps} />);
    act(() => {
      global.__inputHandler('v', { ctrl: false }); // switch to files mode
    });
    // Simulate opening a .md file (prompt file)
    act(() => {
      global.__inputHandler('p', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="promptsplitviewer"');
    // Simulate opening parts mode
    act(() => {
      global.__inputHandler('s', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="promptpartsviewer"');
    // Simulate part analysis overlay
    act(() => {
      global.__inputHandler('a', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="partanalysisoverlay"');
    // Simulate zoom
    act(() => {
      global.__inputHandler('z', { ctrl: false });
    });
    expect(lastFrame()).toContain('data-testid="promptsplitviewer"');
  });
});
