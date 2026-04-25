/** LLMStreamPanel — live streaming of Copilot SDK re-analysis responses. */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { streamLLM } from '../../lib/ai_client.js';
import type { Issue } from '../../types/index.js';

interface LLMStreamPanelProps {
  issue: Issue;
  focused: boolean;
}

const SYSTEM_ISSUE_ANALYSIS = `You are a senior software engineer providing actionable remediation advice for workflow automation issues.

**Scope**: You have been given ONLY the issue fields listed below: title, category, severity, detail, and optional evidence (capped at 500 chars). Do NOT fabricate additional log output, stack traces, file paths, or code snippets not present in the provided fields. Base all recommendations strictly on the evidence supplied. When evidence is insufficient to give a specific recommendation, say so explicitly rather than speculating.`;

export function LLMStreamPanel({ issue, focused }: LLMStreamPanelProps) {
  const [content, setContent] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setContent('');
    setDone(false);
    setError(null);

    const prompt = `Analyze this ai_workflow.js issue and provide concise actionable recommendations:

**Issue**: ${issue.title}
**Category**: ${issue.category}
**Severity**: ${issue.severity}
**Detail**: ${issue.detail}
${issue.evidence ? `**Evidence**: ${issue.evidence.slice(0, 500)}` : ''}`;

    (async () => {
      try {
        for await (const chunk of streamLLM({ prompt, systemMessage: SYSTEM_ISSUE_ANALYSIS, model: 'gpt-4.1' }, ctrl.signal)) {
          if (ctrl.signal.aborted) break;
          setContent((prev) => prev + chunk.delta);
          if (chunk.done) setDone(true);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => ctrl.abort();
  }, [issue.id]);

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
        <Text bold underline>AI ANALYSIS</Text>
        <Text dimColor>{done ? '✓ done' : error ? '✗ error' : '⟳ streaming…'}</Text>
      </Box>
      {error && <Text color="red">{error}</Text>}
      <Text wrap="wrap" color="green">{content}{!done && !error ? <Text color="yellow">▌</Text> : ''}</Text>
    </Box>
  );
}
