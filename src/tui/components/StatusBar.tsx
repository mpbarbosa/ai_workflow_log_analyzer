/** StatusBar component — bottom bar showing keyboard shortcuts. */
import React from 'react';
import { Box, Text } from 'ink';
import type { IssueFilter } from '../../types/index.js';

interface StatusBarProps {
  filter: IssueFilter;
  focusedPanel: string;
  canExport: boolean;
}

const FILTER_LABELS: Record<IssueFilter, string> = {
  all: 'All',
  failure: 'Failures',
  performance: 'Perf',
  bug: 'Bugs',
  prompt_quality: 'Prompt Quality',
};

export function StatusBar({ filter, focusedPanel, canExport }: StatusBarProps) {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        <Text color="cyan">[Tab]</Text> Panel {'  '}
        <Text color="cyan">[↑↓]</Text> Navigate {'  '}
        <Text color="cyan">[Enter]</Text> Detail {'  '}
        <Text color="cyan">[f]</Text> Filter: <Text color="yellow">{FILTER_LABELS[filter]}</Text>
        {canExport && <> {'  '}<Text color="cyan">[e]</Text> Export</>}
        {'  '}<Text color="cyan">[q]</Text> Quit
      </Text>
      <Text dimColor>Focus: <Text color="white">{focusedPanel}</Text></Text>
    </Box>
  );
}
