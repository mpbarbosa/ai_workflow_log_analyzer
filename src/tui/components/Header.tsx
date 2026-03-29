/** Header component — title bar with run ID and status. */
import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  runId?: string;
  status?: string;
  version?: string;
  mode?: 'analysis' | 'files';
}

export function Header({ runId, status = 'idle', version = '0.2.0', mode = 'analysis' }: HeaderProps) {
  const statusColor = status === 'running' ? 'yellow' : status === 'done' ? 'green' : status === 'error' ? 'red' : 'gray';
  const statusIcon = status === 'running' ? '⟳' : status === 'done' ? '✓' : status === 'error' ? '✗' : '●';
  const modeLabel = mode === 'files' ? '📂 FILES' : '🔍 ANALYSIS';
  const modeColor = mode === 'files' ? 'blue' : 'cyan';

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold color="cyan">ai_workflow Log Analyzer</Text>
      <Text color={modeColor} bold>{modeLabel}</Text>
      <Text dimColor>v{version}</Text>
      {runId && <Text dimColor>Run: <Text color="white">{runId}</Text></Text>}
      <Text color={statusColor}>{statusIcon} {status.toUpperCase()}</Text>
    </Box>
  );
}
