/** StatusBar component — bottom bar showing keyboard shortcuts. */
import React from 'react';
import { Box, Text } from 'ink';
import type { IssueFilter } from '../../types/index.js';

interface StatusBarProps {
  filter: IssueFilter;
  focusedPanel: string;
  canExport: boolean;
  mode?: 'analysis' | 'files';
  fileOpen?: boolean;
  promptSplitMode?: boolean;
  isPromptFile?: boolean;
  promptZoomed?: boolean;
}

const FILTER_LABELS: Record<IssueFilter, string> = {
  all: 'All',
  failure: 'Failures',
  performance: 'Perf',
  bug: 'Bugs',
  prompt_quality: 'Prompt Quality',
};

function K({ children }: { children: React.ReactNode }) {
  return <Text color="cyan">[{children}]</Text>;
}

export function StatusBar({ filter, focusedPanel, canExport, mode = 'analysis', fileOpen = false, promptSplitMode = false, isPromptFile = false, promptZoomed = false }: StatusBarProps) {
  const inSplitView = mode === 'files' && promptSplitMode && focusedPanel === 'fileviewer';
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
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
      <Text dimColor>
        <Text color={mode === 'files' ? 'blue' : 'cyan'}>{mode.toUpperCase()}</Text>
        {' › '}<Text color="white">{focusedPanel}</Text>
        {promptSplitMode && <Text color={promptZoomed ? 'yellow' : 'gray'}> {promptZoomed ? '[ZOOM]' : '[SPLIT]'}</Text>}
      </Text>
    </Box>
  );
}
