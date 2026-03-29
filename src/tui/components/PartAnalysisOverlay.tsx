/**
 * PartAnalysisOverlay — streams a Copilot analysis of the selected prompt section
 * vs the actual project codebase, and saves the result to disk on completion.
 *
 * Activated by [a] in Prompt Parts view.
 * Saved to: <projectRoot>/.ai_workflow/analysis/<runId>/part_<label>_<timestamp>.md
 * @module tui/components/PartAnalysisOverlay
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzePromptPartVsCodebase } from '../../lib/copilot_client.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import type { PromptPart } from '../../parsers/prompt_parser.js';

interface PartAnalysisOverlayProps {
  part: PromptPart;
  projectRoot: string;
  runId: string;
}

type AnalysisStatus = 'streaming' | 'done' | 'cancelled' | 'error';

export function PartAnalysisOverlay({ part, projectRoot, runId }: PartAnalysisOverlayProps) {
  const { stdout } = useStdout();
  const termRows = Math.max(5, (stdout?.rows ?? 40) - 10);
  const termCols = stdout?.columns ?? 120;

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
        for await (const chunk of analyzePromptPartVsCodebase(
          part.label, part.lines, projectRoot, ac.signal
        )) {
          if (ac.signal.aborted) break;
          if (chunk.done) break;
          fullText += chunk.delta;
          setLines(fullText.split('\n'));
        }

        if (!ac.signal.aborted) {
          setStatus('done');
          // Save to disk
          const sanitizedLabel = part.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `part_${sanitizedLabel}_${timestamp}.md`;
          const dir = join(projectRoot, '.ai_workflow', 'analysis', runId);
          const filePath = join(dir, filename);
          try {
            await mkdir(dir, { recursive: true });
            const header = `# Part Analysis: ${part.label}\n\n` +
              `**Run:** ${runId}  \n**Section:** ${part.label}  \n**Generated:** ${new Date().toISOString()}\n\n---\n\n`;
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
  }, [part, projectRoot, runId]);

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
          <Text bold color="magenta">🔬 ANALYSIS</Text>
          <Text dimColor>›</Text>
          <Text bold color="cyan">{part.label}</Text>
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
          <Text dimColor>Scanning codebase and calling Copilot SDK…</Text>
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
