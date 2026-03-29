/** IssuesPanel — filterable, navigable list of detected issues. */
import React from 'react';
import { Box, Text } from 'ink';
import type { Issue, IssueFilter } from '../../types/index.js';

interface IssuesPanelProps {
  issues: Issue[];
  selectedIndex: number;
  focused: boolean;
  filter: IssueFilter;
  loading?: boolean;
  loadingPhase?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'yellow',
  medium: 'yellow',
  low: 'green',
};

const SEVERITY_ICON: Record<string, string> = {
  critical: '✗',
  high: '⚠',
  medium: '⚠',
  low: '·',
};

const CATEGORY_ICON: Record<string, string> = {
  failure: '✗',
  performance: '⏱',
  bug: '🐛',
  prompt_quality: '✍',
};

export function IssuesPanel({ issues, selectedIndex, focused, filter, loading, loadingPhase }: IssuesPanelProps) {
  const border = focused ? 'double' : 'single';

  return (
    <Box
      flexDirection="column"
      borderStyle={border}
      borderColor={focused ? 'cyan' : 'gray'}
      flexGrow={1}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold underline>ISSUES</Text>
        <Text dimColor>({issues.length}{filter !== 'all' ? ` · ${filter}` : ''})</Text>
      </Box>

      {loading && (
        <Text color="yellow">⟳ {loadingPhase ?? 'Analyzing'}…</Text>
      )}

      {!loading && issues.length === 0 && (
        <Text color="green">✓ No issues found</Text>
      )}

      {issues.map((issue, i) => {
        const selected = i === selectedIndex;
        const color = SEVERITY_COLOR[issue.severity] ?? 'white';
        const icon = SEVERITY_ICON[issue.severity] ?? '·';
        const catIcon = CATEGORY_ICON[issue.category] ?? '?';

        return (
          <Box key={issue.id}>
            <Text
              color={selected ? 'cyan' : color}
              bold={selected}
              wrap="truncate"
            >
              {selected ? '▶ ' : '  '}
              <Text color={color}>{icon}</Text> {catIcon} {issue.title}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
