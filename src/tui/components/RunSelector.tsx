/** RunSelector panel — left panel for browsing workflow run history. */
import React from 'react';
import { Box, Text } from 'ink';
import type { RunInfo } from '../../types/index.js';

interface RunSelectorProps {
  runs: RunInfo[];
  selectedIndex: number;
  focused: boolean;
  loading: boolean;
}

function formatDate(d: Date | null): string {
  if (!d) return 'unknown';
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

export function RunSelector({ runs, selectedIndex, focused, loading }: RunSelectorProps) {
  const border = focused ? 'double' : 'single';

  return (
    <Box
      flexDirection="column"
      borderStyle={border}
      borderColor={focused ? 'cyan' : 'gray'}
      width={26}
      paddingX={1}
    >
      <Text bold underline>RUNS</Text>
      {loading && <Text dimColor>Loading…</Text>}
      {!loading && runs.length === 0 && <Text dimColor>No runs found</Text>}
      {runs.map((run, i) => {
        const selected = i === selectedIndex;
        return (
          <Box key={run.runId}>
            <Text color={selected ? 'cyan' : undefined} bold={selected}>
              {selected ? '▶ ' : '  '}
              {formatDate(run.startTime)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
