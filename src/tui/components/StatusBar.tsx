/** StatusBar component — bottom bar showing keyboard shortcuts. */
import React from 'react';
import { Box, Text } from 'ink';
import type { IssueFilter } from '../../types/index.js';

interface StatusBarProps {
  filter: IssueFilter;
  focusedPanel: string;
  canExport: boolean;
  mode?: 'analysis' | 'files';
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

export function StatusBar({ filter, focusedPanel, canExport, mode = 'analysis' }: StatusBarProps) {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        <K>Tab</K> Panel{'  '}
        <K>↑↓</K> Navigate{'  '}
        {mode === 'files' ? (
          <>
            <K>Enter</K> Open/Expand{'  '}
            {focusedPanel === 'fileviewer' && <><K>PgUp/Dn</K> Scroll{'  '}<K>g/G</K> Top/Bottom{'  '}</>}
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
      </Text>
    </Box>
  );
}
