/**
 * PromptPartsViewer — shows the structural parts of a prompt side-by-side:
 *   Left pane:  navigable list of section names + line counts
 *   Right pane: content of the selected section rendered as Markdown
 *
 * Activated by pressing [s] while in PromptSplitViewer.
 * @module tui/components/PromptPartsViewer
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parsePromptFileContent, parsePromptParts } from '../../parsers/prompt_parser.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import type { PromptPart } from '../../parsers/prompt_parser.js';

interface PromptPartsViewerProps {
  filePath: string;
}

// Label width for the left list panel
const LIST_WIDTH = 28;

// Colour per well-known section label
function labelColor(label: string): string {
  const l = label.toLowerCase();
  if (l === 'role')                          return 'magenta';
  if (l === 'task')                          return 'yellow';
  if (l.includes('output') || l.includes('format')) return 'cyan';
  if (l.includes('approach') || l.includes('instruction')) return 'green';
  if (l.includes('context') || l.includes('project')) return 'blue';
  if (l.includes('reference') || l.includes('standard')) return 'gray';
  return 'white';
}

export function PromptPartsViewer({ filePath }: PromptPartsViewerProps) {
  const { stdout } = useStdout();
  const termRows = Math.max(5, (stdout?.rows ?? 40) - 8);

  const [parts, setParts] = useState<PromptPart[]>([]);
  const [wholePromptLines, setWholePromptLines] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [contentOffset, setContentOffset] = useState(0);
  const [meta, setMeta] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Always-current refs so getSelectedPart() can read synchronously
  const partsRef = useRef<PromptPart[]>([]);
  const wholePromptLinesRef = useRef<string[]>([]);
  const selectedIndexRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { partsRef.current = parts; }, [parts]);
  useEffect(() => { wholePromptLinesRef.current = wholePromptLines; }, [wholePromptLines]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);

  useEffect(() => {
    setParts([]);
    setWholePromptLines([]);
    setError(null);
    setSelectedIndex(0);
    setContentOffset(0);

    readFile(filePath, 'utf8')
      .then((text) => {
        const parsed = parsePromptFileContent(text);
        if (parsed) {
          setMeta(`${parsed.persona}  ·  ${parsed.model}`);
          setWholePromptLines(parsed.prompt.split('\n'));
          setParts(parsePromptParts(parsed.prompt));
        } else {
          // Not a prompt log file — parse section markers from raw content
          setMeta(basename(filePath));
          setWholePromptLines(text.split('\n'));
          setParts(parsePromptParts(text));
        }
      })
      .catch((e) => setError(String(e)));
  }, [filePath]);

  // Expose scroll + navigation via globalThis so App.tsx key handler can drive it
  useEffect(() => {
    (globalThis as Record<string, unknown>).__promptPartsScroll = {
      up:        () => {
        setContentOffset((s) => Math.max(0, s - 1));
      },
      down:      () => {
        setContentOffset((s) => s + 1);
      },
      pageUp:    () => setContentOffset((s) => Math.max(0, s - termRows)),
      pageDown:  () => setContentOffset((s) => s + termRows),
      jumpStart: () => setContentOffset(0),
      jumpEnd:   () => setContentOffset(9999),
      prevPart:  () => {
        setSelectedIndex((i) => Math.max(0, i - 1));
        setContentOffset(0);
      },
      nextPart:  () => {
        setParts((prev) => {
          setSelectedIndex((i) => Math.min(prev.length - 1, i + 1));
          return prev;
        });
        setContentOffset(0);
      },
      // Returns the currently selected PromptPart so App.tsx can pass it to PartAnalysisOverlay
      getSelectedPart: () => partsRef.current[selectedIndexRef.current] ?? null,
      getWholePrompt: () => {
        if (wholePromptLinesRef.current.length === 0) return null;
        return { label: 'Whole Prompt', lines: wholePromptLinesRef.current };
      },
    };
  }, [termRows]);

  const filename = basename(filePath);

  if (error) {
    return (
      <Box flexGrow={1} borderStyle="single" borderColor="red" padding={1}>
        <Text color="red">Parse error: {error}</Text>
      </Box>
    );
  }

  if (parts.length === 0) {
    return (
      <Box flexGrow={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>Parsing…</Text>
      </Box>
    );
  }

  const selected = parts[selectedIndex];
  const visibleContent = selected
    ? selected.lines.slice(contentOffset, contentOffset + termRows)
    : [];
  const totalContentLines = selected?.lines.length ?? 0;
  const contentPct = totalContentLines > 0
    ? Math.min(100, Math.round(((contentOffset + termRows) / totalContentLines) * 100))
    : 100;

  return (
    <Box flexGrow={1} flexDirection="column">
      {/* Title bar */}
      <Box paddingX={1} justifyContent="space-between">
        <Text color="magenta" bold>⬡ PARTS  </Text>
        <Text bold color="cyan">📄 {filename}</Text>
        <Text dimColor>  {meta}</Text>
      </Box>

      <Box flexGrow={1}>
        {/* ── Left: section list ── */}
        <Box
          flexDirection="column"
          width={LIST_WIDTH}
          borderStyle="single"
          borderColor="magenta"
          overflow="hidden"
        >
          <Box paddingX={1}>
            <Text bold color="magenta">Sections ({parts.length})</Text>
          </Box>
          {parts.map((part, idx) => {
            const active = idx === selectedIndex;
            const color = labelColor(part.label);
            const truncLabel = part.label.length > LIST_WIDTH - 10
              ? part.label.slice(0, LIST_WIDTH - 13) + '…'
              : part.label;
            return (
              <Box key={idx} paddingX={1}>
                <Text color={active ? color : 'gray'} bold={active}>
                  {active ? '▶ ' : '  '}
                </Text>
                <Text color={active ? color : 'gray'} bold={active}>
                  {truncLabel}
                </Text>
                <Text dimColor> ({part.lines.length})</Text>
              </Box>
            );
          })}
        </Box>

        {/* ── Right: section content ── */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={labelColor(selected?.label ?? '')}
          overflow="hidden"
        >
          <Box paddingX={1} justifyContent="space-between">
            <Text bold color={labelColor(selected?.label ?? '')}>
              {selected?.label ?? ''}
            </Text>
            {totalContentLines > 0 && (
              <Text dimColor>
                L{contentOffset + 1}–{Math.min(contentOffset + termRows, totalContentLines)}/{totalContentLines} {contentPct}%
              </Text>
            )}
          </Box>
          <Box flexDirection="column" paddingX={1}>
            <MarkdownRenderer lines={visibleContent} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
