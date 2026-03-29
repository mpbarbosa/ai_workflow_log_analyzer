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
import { FileTree } from './components/FileTree.js';
import { FileViewer } from './components/FileViewer.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { useRunSelector } from './hooks/useRunSelector.js';
import { useAnalysis } from './hooks/useAnalysis.js';
import { useFileTree } from './hooks/useFileTree.js';
import type { PanelId, Issue, ThresholdConfig } from '../types/index.js';

export interface AppProps {
  projectRoot: string;
  thresholds?: ThresholdConfig;
  skipPromptQuality?: boolean;
}

type AppMode = 'analysis' | 'files';

const ANALYSIS_PANELS: PanelId[] = ['runs', 'issues', 'metrics', 'detail'];
const FILES_PANELS: PanelId[] = ['runs', 'filetree', 'fileviewer'];

export function App({ projectRoot, thresholds, skipPromptQuality = false }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;

  const aiWorkflowDir = `${projectRoot}/.ai_workflow`;

  const { runs, selectedIndex: runIndex, selectedRun, loading: runsLoading, select: selectRun } =
    useRunSelector(aiWorkflowDir);

  const { state, report, error, progress, filter, filteredIssues, run, cycleFilter } =
    useAnalysis(thresholds);

  const fileTree = useFileTree(selectedRun?.path ?? null);

  const [mode, setMode] = useState<AppMode>('analysis');
  const [focusedPanel, setFocusedPanel] = useState<PanelId>('runs');
  const [issueIndex, setIssueIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [openedFilePath, setOpenedFilePath] = useState<string | null>(null);

  const selectedIssue: Issue | null = filteredIssues[issueIndex] ?? null;

  const cycleFocus = useCallback((forward: boolean) => {
    setFocusedPanel((prev) => {
      const panels = mode === 'files' ? FILES_PANELS : ANALYSIS_PANELS;
      const idx = panels.indexOf(prev as PanelId);
      const base = idx === -1 ? 0 : idx;
      const next = forward ? (base + 1) % panels.length : (base - 1 + panels.length) % panels.length;
      return panels[next];
    });
  }, [mode]);

  const scrollViewer = (action: string) => {
    const ctrl = (globalThis as Record<string, unknown>).__fileViewerScroll as Record<string, () => void> | undefined;
    ctrl?.[action]?.();
  };

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }

    // h: toggle help
    if (input === 'h') { setShowHelp((s) => !s); return; }

    // v: toggle files / analysis mode
    if (input === 'v') {
      setMode((m) => {
        const next = m === 'files' ? 'analysis' : 'files';
        setFocusedPanel(next === 'files' ? 'filetree' : 'issues');
        return next;
      });
      return;
    }

    if (key.tab) { cycleFocus(!key.shift); return; }
    if (key.escape) { setShowDetail(false); setShowStream(false); setShowHelp(false); return; }

    // ── FILES MODE ────────────────────────────────────────────────────────────
    if (mode === 'files') {
      if (focusedPanel === 'runs') {
        if (key.upArrow) selectRun(runIndex - 1);
        if (key.downArrow) selectRun(runIndex + 1);
        if (key.return && selectedRun) {
          setFocusedPanel('filetree');
        }
        return;
      }

      if (focusedPanel === 'filetree') {
        if (key.upArrow) fileTree.moveUp();
        if (key.downArrow) fileTree.moveDown();
        if (key.return) {
          const entry = fileTree.selectedEntry;
          if (entry?.isDir) {
            fileTree.toggleExpand();
          } else if (entry?.filePath) {
            setOpenedFilePath(entry.filePath);
            setFocusedPanel('fileviewer');
          }
        }
        return;
      }

      if (focusedPanel === 'fileviewer') {
        if (key.upArrow) scrollViewer('up');
        if (key.downArrow) scrollViewer('down');
        if (key.pageUp || (key.ctrl && input === 'u')) scrollViewer('pageUp');
        if (key.pageDown || (key.ctrl && input === 'd')) scrollViewer('pageDown');
        if (input === 'g') scrollViewer('jumpStart');
        if (input === 'G') scrollViewer('jumpEnd');
        return;
      }
      return;
    }

    // ── ANALYSIS MODE ─────────────────────────────────────────────────────────
    if (key.upArrow) {
      if (focusedPanel === 'runs') selectRun(runIndex - 1);
      else if (focusedPanel === 'issues') setIssueIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      if (focusedPanel === 'runs') selectRun(runIndex + 1);
      else if (focusedPanel === 'issues') setIssueIndex((i) => Math.min(filteredIssues.length - 1, i + 1));
    }
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
    if (input === 'f' && focusedPanel === 'issues') { cycleFilter(); setIssueIndex(0); }
    if (input === 'r' && selectedIssue) {
      setShowStream(true);
      setShowDetail(false);
      setFocusedPanel('detail');
    }
  });

  const runId = selectedRun?.runId ?? report?.runId;
  const isRunning = state === 'running';

  return (
    <Box flexDirection="column" width={cols}>
      <Header
        runId={runId}
        status={state === 'running' ? 'running' : state === 'done' ? 'done' : state === 'error' ? 'error' : 'idle'}
        mode={mode}
      />

      <Box flexGrow={1}>
        {showHelp ? (
          <HelpOverlay onClose={() => setShowHelp(false)} />
        ) : (
          <>
            {/* Left: run selector (always visible) */}
            <RunSelector
              runs={runs}
              selectedIndex={runIndex}
              focused={focusedPanel === 'runs'}
              loading={runsLoading}
            />

            {mode === 'files' ? (
              /* ── Files mode ─────────────────────────────────── */
              <>
                <FileTree
                  entries={fileTree.entries}
                  selectedIndex={fileTree.selectedIndex}
                  focused={focusedPanel === 'filetree'}
                  loading={fileTree.loading}
                  openedPath={openedFilePath}
                />
                <FileViewer
                  filePath={openedFilePath}
                  focused={focusedPanel === 'fileviewer'}
                />
              </>
            ) : (
              /* ── Analysis mode ───────────────────────────────── */
              <>
                <IssuesPanel
                  issues={filteredIssues}
                  selectedIndex={issueIndex}
                  focused={focusedPanel === 'issues'}
                  filter={filter}
                  loading={isRunning}
                  loadingPhase={progress.phase}
                />
                {(showDetail && selectedIssue) ? (
                  <DetailOverlay issue={selectedIssue} onClose={() => setShowDetail(false)} />
                ) : (showStream && selectedIssue) ? (
                  <LLMStreamPanel issue={selectedIssue} focused={focusedPanel === 'detail'} />
                ) : (
                  <MetricsPanel metrics={report?.metrics ?? null} focused={focusedPanel === 'metrics'} />
                )}
              </>
            )}
          </>
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
        mode={mode}
      />
    </Box>
  );
}
