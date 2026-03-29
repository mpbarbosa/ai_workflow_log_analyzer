/** MetricsPanel — ASCII bar charts for step durations and LLM latency. */
import React from 'react';
import { Box, Text } from 'ink';
import type { RunMetrics } from '../../types/index.js';

interface MetricsPanelProps {
  metrics: RunMetrics | null;
  focused: boolean;
}

function barChart(value: number, max: number, width = 12): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function MetricsPanel({ metrics, focused }: MetricsPanelProps) {
  const border = focused ? 'double' : 'single';

  if (!metrics) {
    return (
      <Box
        flexDirection="column"
        borderStyle={border}
        borderColor={focused ? 'cyan' : 'gray'}
        width={30}
        paddingX={1}
      >
        <Text bold underline>METRICS</Text>
        <Text dimColor>No data yet</Text>
      </Box>
    );
  }

  const slowestSteps = [...metrics.steps]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 7);

  const maxDuration = slowestSteps[0]?.durationMs ?? 1;

  return (
    <Box
      flexDirection="column"
      borderStyle={border}
      borderColor={focused ? 'cyan' : 'gray'}
      width={30}
      paddingX={1}
    >
      <Text bold underline>METRICS</Text>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Step Durations</Text>
        {slowestSteps.map((s) => (
          <Box key={s.stepId} flexDirection="column">
            <Text wrap="truncate" dimColor>{s.stepId.replace('step_', '')}</Text>
            <Text color="cyan">{barChart(s.durationMs, maxDuration)} <Text color="white">{fmtMs(s.durationMs)}</Text></Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Avg AI Latency</Text>
        <Text color={metrics.avgAiLatencyMs > 30000 ? 'red' : metrics.avgAiLatencyMs > 15000 ? 'yellow' : 'green'}>
          {fmtMs(metrics.avgAiLatencyMs)}
        </Text>
      </Box>

      {metrics.maxMemoryMb !== undefined && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Peak Memory</Text>
          <Text color={metrics.maxMemoryMb > 150 ? 'red' : metrics.maxMemoryMb > 80 ? 'yellow' : 'green'}>
            {metrics.maxMemoryMb.toFixed(1)} MB
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>AI Calls: <Text color="white">{metrics.totalAiCalls}</Text></Text>
      </Box>
    </Box>
  );
}
