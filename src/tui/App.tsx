/**
 * App — root Ink component for the log analyzer TUI.
 * Composes all panels into a full-terminal dashboard with keyboard navigation.
 * @module tui/App
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { RunSelector } from './components/RunSelector.js';
import { IssuesPanel } from './components/IssuesPanel.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { DetailOverlay } from './components/DetailOverlay.js';
import { LLMStreamPanel } from './components/LLMStreamPanel.js';
import { useRunSelector } from './hooks/useRunSelector.js';
import { useAnalysis } from './hooks/useAnalysis.js';
import type { PanelId, Issue, ThresholdConfig } from '../types/index.js';

export interface AppProps {
  projectRoot: string;
  thresholds?: ThresholdConfig;
  skipPromptQuality?: boolean;
}

const PANELS: PanelId[] = ['runs', 'issues', 'metrics', 'detail'];

export function App({ projectRoot, thresholds, skipPromptQuality = false }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;

  const aiWorkflowDir = `${projectRoot}/.ai_workflow`;

  const { runs, selectedIndex: runIndex, selectedRun, loading: runsLoading, select: selectRun } =
    useRunSelector(aiWorkflowDir);

  const { state, report, error, progress, filter, filteredIssues, run, cycleFilter } =
    useAnalysis(thresholds);

  const [focusedPanel, setFocusedPanel] = useState<PanelId>('runs');
  const [issueIndex, setIssueIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showStream, setShowStream] = useState(false);

  const selectedIssue: Issue | null = filteredIssues[issueIndex] ?? null;

  const cycleFocus = useCallback((forward: boolean) => {
    setFocusedPanel((prev) => {
      const idx = PANELS.indexOf(prev);
      const next = forward ? (idx + 1) % PANELS.length : (idx - 1 + PANELS.length) % PANELS.length;
      return PANELS[next];
    });
  }, []);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Tab to cycle panels
    if (key.tab) {
      cycleFocus(!key.shift);
      return;
    }

    if (key.escape) {
      setShowDetail(false);
      setShowStream(false);
      return;
    }

    // Navigation within focused panel
    if (key.upArrow) {
      if (focusedPanel === 'runs') selectRun(runIndex - 1);
      else if (focusedPanel === 'issues') setIssueIndex((i) => Math.max(0, i - 1));
    }

    if (key.downArrow) {
      if (focusedPanel === 'runs') selectRun(runIndex + 1);
      else if (focusedPanel === 'issues') setIssueIndex((i) => Math.min(filteredIssues.length - 1, i + 1));
    }

    // Enter: load run or open detail
    if (key.return) {
      if (focusedPanel === 'runs' && selectedRun && state !== 'running') {
        setIssueIndex(0);
        setShowDetail(false);
        setShowStream(false);
        run(selectedRun, projectRoot, skipPromptQuality);
        setFocusedPanel('issues');
      } else if (focusedPanel === 'issues' && selectedIssue) {
        setShowDetail(true);
        setShowStream(false);
        setFocusedPanel('detail');
      }
    }

    // f: cycle issue filter
    if (input === 'f' && focusedPanel === 'issues') {
      cycleFilter();
      setIssueIndex(0);
    }

    // r: re-analyze selected issue with LLM streaming
    if (input === 'r' && selectedIssue) {
      setShowStream(true);
      setShowDetail(false);
      setFocusedPanel('detail');
    }

    // e: export report
    if (input === 'e' && report) {
      // export handled in CLI layer; signal is enough
    }
  });

  const runId = selectedRun?.runId ?? report?.runId;
  const isRunning = state === 'running';

  return (
    <Box flexDirection="column" width={cols}>
      <Header
        runId={runId}
        status={state === 'running' ? 'running' : state === 'done' ? 'done' : state === 'error' ? 'error' : 'idle'}
      />

      {/* Main panels row */}
      <Box flexGrow={1}>
        {/* Left: run selector */}
        <RunSelector
          runs={runs}
          selectedIndex={runIndex}
          focused={focusedPanel === 'runs'}
          loading={runsLoading}
        />

        {/* Center: issues */}
        <IssuesPanel
          issues={filteredIssues}
          selectedIndex={issueIndex}
          focused={focusedPanel === 'issues'}
          filter={filter}
          loading={isRunning}
          loadingPhase={progress.phase}
        />

        {/* Right: metrics or detail/stream */}
        {(showDetail && selectedIssue) ? (
          <DetailOverlay issue={selectedIssue} onClose={() => setShowDetail(false)} />
        ) : (showStream && selectedIssue) ? (
          <LLMStreamPanel issue={selectedIssue} focused={focusedPanel === 'detail'} />
        ) : (
          <MetricsPanel metrics={report?.metrics ?? null} focused={focusedPanel === 'metrics'} />
        )}
      </Box>

      {error && (
        <Box paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <StatusBar
        filter={filter}
        focusedPanel={focusedPanel}
        canExport={!!report}
      />
    </Box>
  );
}
