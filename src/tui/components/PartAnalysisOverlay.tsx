/**
 * PartAnalysisOverlay — streams a Copilot analysis of a selected prompt section
 * or a synthetic whole-prompt target
 * and saves the result to disk on completion.
 *
 * Activated by [a], [b], or [e] in Prompt Parts view.
 * Saved to: <projectRoot>/.ai_workflow/analysis/<runId>/{part|reverse_prompt|reverse_prompt_full}_<label>_<timestamp>.md
 * @module tui/components/PartAnalysisOverlay
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  analyzePromptPartVsCodebase,
  analyzePromptPartWithReversePrompting,
  analyzeWholePromptWithReversePrompting,
} from '../../lib/ai_client.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';

export type PartAnalysisKind = 'codebase' | 'reverse_prompt' | 'reverse_prompt_full';

interface AnalysisTarget {
  label: string;
  lines: string[];
}

interface PartAnalysisOverlayProps {
  target: AnalysisTarget;
  projectRoot: string;
  runId: string;
  analysisKind?: PartAnalysisKind;
}

type AnalysisStatus = 'streaming' | 'done' | 'cancelled' | 'error';

const ANALYSIS_META: Record<PartAnalysisKind, {
  title: string;
  pendingMessage: string;
  filenamePrefix: string;
  headingPrefix: string;
}> = {
  codebase: {
    title: '🔬 ANALYSIS',
    pendingMessage: 'Scanning codebase and calling Copilot SDK…',
    filenamePrefix: 'part',
    headingPrefix: 'Part Analysis',
  },
  reverse_prompt: {
    title: '🧠 REVERSE PROMPT',
    pendingMessage: 'Reverse-engineering the selected prompt part with Copilot SDK…',
    filenamePrefix: 'reverse_prompt',
    headingPrefix: 'Reverse Prompt Analysis',
  },
  reverse_prompt_full: {
    title: '🧠 WHOLE PROMPT',
    pendingMessage: 'Reverse-engineering the entire prompt with Copilot SDK…',
    filenamePrefix: 'reverse_prompt_full',
    headingPrefix: 'Whole Prompt Reverse Prompt Analysis',
  },
};

export function PartAnalysisOverlay({
  target,
  projectRoot,
  runId,
  analysisKind = 'codebase',
}: PartAnalysisOverlayProps) {
  const { stdout } = useStdout();
  const termRows = Math.max(5, (stdout?.rows ?? 40) - 10);
  const termCols = stdout?.columns ?? 120;
  const analysisMeta = ANALYSIS_META[analysisKind];

  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>('streaming');
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const abortRef = useRef(new AbortController());

  useEffect(() => {
    const ac = abortRef.current;

    (async () => {
      try {
        let fullText = '';
        const analysisStream = analysisKind === 'reverse_prompt'
          ? analyzePromptPartWithReversePrompting(target.label, target.lines, ac.signal)
          : analysisKind === 'reverse_prompt_full'
            ? analyzeWholePromptWithReversePrompting(target.lines, ac.signal)
            : analyzePromptPartVsCodebase(target.label, target.lines, projectRoot, ac.signal);

        for await (const chunk of analysisStream) {
          if (ac.signal.aborted) break;
          if (chunk.done) break;
          fullText += chunk.delta;
          setLines(fullText.split('\n'));
        }

        if (!ac.signal.aborted) {
          setStatus('done');
          const sanitizedLabel = target.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${analysisMeta.filenamePrefix}_${sanitizedLabel}_${timestamp}.md`;
          const dir = join(projectRoot, '.ai_workflow', 'analysis', runId);
          const filePath = join(dir, filename);
          try {
            await mkdir(dir, { recursive: true });
            const header = `# ${analysisMeta.headingPrefix}: ${target.label}\n\n` +
              `**Run:** ${runId}  \n**Target:** ${target.label}  \n**Generated:** ${new Date().toISOString()}\n\n---\n\n`;
            await writeFile(filePath, header + fullText, 'utf8');
            setSavedPath(filePath.replace(projectRoot + '/', ''));
          } catch (e) {
            setSaveError(String(e));
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          setLines((prev) => [...prev, '', `Error: ${String(e)}`]);
          setStatus('error');
        }
      }
    })();

    return () => { ac.abort(); };
  }, [analysisKind, analysisMeta.filenamePrefix, analysisMeta.headingPrefix, projectRoot, runId, target]);

  // Expose scroll control to App.tsx
  useEffect(() => {
    (globalThis as Record<string, unknown>).__partAnalysisScroll = {
      up:        () => setScrollOffset((s) => Math.max(0, s - 1)),
      down:      () => setScrollOffset((s) => s + 1),
      pageUp:    () => setScrollOffset((s) => Math.max(0, s - termRows)),
      pageDown:  () => setScrollOffset((s) => s + termRows),
      jumpStart: () => setScrollOffset(0),
      jumpEnd:   () => setScrollOffset(9999),
      cancel:    () => { abortRef.current.abort(); setStatus('cancelled'); },
    };
    return () => { delete (globalThis as Record<string, unknown>).__partAnalysisScroll; };
  }, [termRows]);

  const visibleLines = lines.slice(scrollOffset, scrollOffset + termRows);
  const total = lines.length;
  const pct = total > 0 ? Math.min(100, Math.round(((scrollOffset + termRows) / total) * 100)) : 100;

  const statusColor: Record<AnalysisStatus, string> = {
    streaming: 'yellow',
    done:      'green',
    cancelled: 'gray',
    error:     'red',
  };
  const statusLabel: Record<AnalysisStatus, string> = {
    streaming: '⟳ Analyzing…',
    done:      '✓ Done',
    cancelled: '✗ Cancelled',
    error:     '✗ Error',
  };

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="double"
      borderColor={statusColor[status]}
      width={termCols - 2}
    >
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text bold color="magenta">{analysisMeta.title}</Text>
          <Text dimColor>›</Text>
          <Text bold color="cyan">{target.label}</Text>
        </Box>
        <Box gap={1}>
          {total > 0 && status !== 'streaming' && (
            <Text dimColor>L{scrollOffset + 1}–{Math.min(scrollOffset + termRows, total)}/{total} {pct}%</Text>
          )}
          <Text bold color={statusColor[status]}>{statusLabel[status]}</Text>
        </Box>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1} overflow="hidden">
        {status === 'streaming' && lines.length === 0 ? (
          <Text dimColor>{analysisMeta.pendingMessage}</Text>
        ) : (
          <MarkdownRenderer lines={visibleLines} />
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>
          {status === 'streaming'
            ? '[Esc] Cancel'
            : '[↑↓] Scroll  [PgUp/Dn] Page  [g/G] Top/Bot  [Esc] Close'}
        </Text>
        {savedPath && (
          <Text color="green" dimColor>💾 {savedPath}</Text>
        )}
        {saveError && (
          <Text color="red" dimColor>Save failed: {saveError}</Text>
        )}
      </Box>
    </Box>
  );
}
