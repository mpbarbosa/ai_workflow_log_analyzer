/** StatusBar component — bottom bar showing keyboard shortcuts and app status. */
import React from 'react';
import { Box, Text } from 'ink';
import type { IssueFilter } from '../../types/index.js';

export type AnalysisState = 'idle' | 'running' | 'done' | 'error';

interface StatusBarProps {
  filter: IssueFilter;
  focusedPanel: string;
  canExport: boolean;
  mode?: 'analysis' | 'files';
  fileOpen?: boolean;
  promptSplitMode?: boolean;
  isPromptFile?: boolean;
  promptZoomed?: boolean;
  // Status
  analysisState?: AnalysisState;
  progressPhase?: string;
  issueCount?: number;
  criticalCount?: number;
  runId?: string;
}

const FILTER_LABELS: Record<IssueFilter, string> = {
  all: 'All',
  failure: 'Failures',
  performance: 'Perf',
  bug: 'Bugs',
  prompt_quality: 'Prompt Quality',
};

const STATE_LABEL: Record<AnalysisState, { label: string; color: string }> = {
  idle:    { label: '○ IDLE',      color: 'gray'   },
  running: { label: '⟳ RUNNING',   color: 'yellow' },
  done:    { label: '✓ DONE',      color: 'green'  },
  error:   { label: '✗ ERROR',     color: 'red'    },
};

function K({ children }: { children: React.ReactNode }) {
  return <Text color="cyan">[{children}]</Text>;
}

export function StatusBar({
  filter, focusedPanel, canExport,
  mode = 'analysis', fileOpen = false,
  promptSplitMode = false, isPromptFile = false, promptZoomed = false,
  analysisState = 'idle', progressPhase, issueCount, criticalCount, runId,
}: StatusBarProps) {
  const inSplitView = mode === 'files' && promptSplitMode && focusedPanel === 'fileviewer';
  const st = STATE_LABEL[analysisState];

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">

      {/* ── Left: keyboard hints ── */}
      <Text dimColor>
        {!inSplitView && <><K>Tab</K> Panel{'  '}</>}
        {!inSplitView && <><K>↑↓</K> Navigate{'  '}</>}
        {mode === 'files' ? (
          <>
            {focusedPanel === 'fileviewer' ? (
              <>
                {promptSplitMode ? (
                  <>
                    <K>Tab</K> {promptZoomed ? 'Switch pane' : 'Prompt↔Response'}{'  '}
                    <K>z</K> {promptZoomed ? 'Zoom out' : 'Zoom pane'}{'  '}
                    <K>PgUp/Dn</K> Scroll{'  '}
                  </>
                ) : (
                  <><K>PgUp/Dn</K> Scroll{'  '}<K>g/G</K> Top/Bot{'  '}</>
                )}
                {isPromptFile && <><K>p</K> {promptSplitMode ? 'Raw view' : 'Split Prompt/Response'}{'  '}</>}
                <K>Esc</K> Close{'  '}
              </>
            ) : (
              <><K>Enter</K> Open/Expand{'  '}</>
            )}
          </>
        ) : (
          <>
            <K>Enter</K> Open{'  '}
            <K>f</K> Filter: <Text color="yellow">{FILTER_LABELS[filter]}</Text>{'  '}
            {canExport && <><K>e</K> Export{'  '}</>}
          </>
        )}
        <K>v</K> {mode === 'files' ? 'Analysis' : 'Files'}{'  '}
        <K>h</K> Help{'  '}
        <K>q</K> Quit
      </Text>

      {/* ── Right: mode / status ── */}
      <Box gap={1}>
        {/* Run ID */}
        {runId && (
          <Text dimColor>{runId.replace('workflow_', '')}</Text>
        )}

        {/* Mode badge */}
        <Text bold color={mode === 'files' ? 'blue' : 'cyan'}>
          {mode === 'files' ? '📂 FILES' : '🔍 ANALYSIS'}
        </Text>

        {/* Files sub-state */}
        {mode === 'files' && (
          <>
            <Text dimColor>›</Text>
            <Text color="white">{focusedPanel}</Text>
            {promptSplitMode && (
              <Text color={promptZoomed ? 'yellow' : 'gray'}>
                {promptZoomed ? `[ZOOM: ${focusedPanel === 'fileviewer' ? 'PANE' : focusedPanel.toUpperCase()}]` : '[SPLIT]'}
              </Text>
            )}
          </>
        )}

        {/* Analysis sub-state */}
        {mode === 'analysis' && (
          <>
            <Text dimColor>›</Text>
            <Text color={st.color}>
              {analysisState === 'running' && progressPhase ? `⟳ ${progressPhase}` : st.label}
            </Text>
            {analysisState === 'done' && issueCount !== undefined && (
              <>
                <Text dimColor>·</Text>
                <Text color={criticalCount ? 'red' : 'green'}>
                  {issueCount} issue{issueCount !== 1 ? 's' : ''}
                  {criticalCount ? ` (${criticalCount} critical)` : ''}
                </Text>
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
