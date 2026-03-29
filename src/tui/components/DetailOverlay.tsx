/** DetailOverlay — full-screen drill-down for a selected issue or prompt. */
import React from 'react';
import { Box, Text } from 'ink';
import type { Issue } from '../../types/index.js';

interface DetailOverlayProps {
  issue: Issue;
  onClose: () => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'yellow',
  medium: 'yellow',
  low: 'green',
};

export function DetailOverlay({ issue }: DetailOverlayProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      flexGrow={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">ISSUE DETAIL</Text>
        <Text dimColor>[Esc / Enter] Close</Text>
      </Box>

      <Text bold>{issue.title}</Text>
      <Box marginTop={1}>
        <Text dimColor>Severity: </Text>
        <Text color={SEVERITY_COLOR[issue.severity] ?? 'white'}>{issue.severity}</Text>
        <Text dimColor>  Category: </Text>
        <Text>{issue.category}</Text>
        {issue.stepId && <><Text dimColor>  Step: </Text><Text>{issue.stepId}</Text></>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor underline>Detail</Text>
        <Text wrap="wrap">{issue.detail}</Text>
      </Box>

      {issue.evidence && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor underline>Evidence</Text>
          <Text color="gray" wrap="wrap">{issue.evidence.slice(0, 400)}</Text>
        </Box>
      )}

      {issue.llmAnalysis && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor underline>AI Analysis</Text>
          <Text color="green" wrap="wrap">{issue.llmAnalysis}</Text>
        </Box>
      )}
    </Box>
  );
}
