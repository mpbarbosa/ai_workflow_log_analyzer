/** IssuesPanel — filterable, navigable list of detected issues. */
import React from 'react';
import { Box, Text, useStdout } from 'ink';
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
  const { stdout } = useStdout();
  const border = focused ? 'double' : 'single';

  // header(3) + statusbar(3) = 6 rows of chrome; border(2) + title(1) = 3 panel overhead
  const viewportRows = Math.max(3, (stdout?.rows ?? 40) - 9);

  // Keep the selected item centred in the viewport (same pattern as FileTree)
  const scrollOffset = issues.length <= viewportRows
    ? 0
    : Math.max(0, Math.min(selectedIndex - Math.floor(viewportRows / 2), issues.length - viewportRows));

  const visibleIssues = issues.slice(scrollOffset, scrollOffset + viewportRows);

  return (
    <Box
      flexDirection="column"
      borderStyle={border}
      borderColor={focused ? 'cyan' : 'gray'}
      flexGrow={1}
      overflow="hidden"
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

      {visibleIssues.map((issue, i) => {
        const globalIndex = i + scrollOffset;
        const selected = globalIndex === selectedIndex;
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
