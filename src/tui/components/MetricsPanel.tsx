/** MetricsPanel — ASCII bar charts for step durations and LLM latency. */
import React from 'react';
import { Box, Text, useStdout } from 'ink';
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
  const { stdout } = useStdout();
  const border = focused ? 'double' : 'single';

  // Fixed rows: border(2) + title(1) + "Step Durations" section(2) +
  // "Avg AI Latency"(3) + "Peak Memory"(3) + "AI Calls"(2) = 13
  const FIXED_ROWS = 13;
  const contentRows = (stdout?.rows ?? 40) - 6; // subtract header + statusbar chrome
  const maxSteps = Math.max(1, Math.floor((contentRows - FIXED_ROWS) / 2));

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
    .slice(0, maxSteps);

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
