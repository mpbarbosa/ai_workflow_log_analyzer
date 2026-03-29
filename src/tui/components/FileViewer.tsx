/**
 * FileViewer — scrollable log file viewer with log-aware syntax colouring.
 * Timestamps dimmed; severity tokens coloured (CRITICAL red, WARN yellow, ✓ green).
 * @module tui/components/FileViewer
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { MarkdownRenderer } from './MarkdownRenderer.js';

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
}

const MAX_LINES = 2000;

/** Colour a raw log line into segments. */
function colourLine(line: string): React.ReactNode {
  // Timestamp prefix [YYYY-MM-DDTHH:MM:SS.mmmZ]
  const tsMatch = line.match(/^(\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\])\s?(.*)/);
  if (!tsMatch) {
    return <Text dimColor>{line}</Text>;
  }
  const [, ts, rest] = tsMatch;

  // Choose colour for the rest of the line
  let color: string | undefined;
  if (/CRITICAL|✗|ERROR|FAILED/i.test(rest)) color = 'red';
  else if (/WARN|⚠|WARNING|RETRY|attempt \d/i.test(rest)) color = 'yellow';
  else if (/✓|success|completed|done/i.test(rest)) color = 'green';
  else if (/\[AI\]|\[DEBUG\]/.test(rest)) color = 'magenta';

  return (
    <>
      <Text dimColor>{ts} </Text>
      <Text color={color}>{rest}</Text>
    </>
  );
}

export function FileViewer({ filePath, focused }: FileViewerProps) {
  const { stdout } = useStdout();
  const termRows = (stdout?.rows ?? 40) - 6; // leave room for header/border/statusbar

  const [lines, setLines] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) { setLines([]); setScrollOffset(0); return; }
    setLoading(true);
    setError(null);
    readFile(filePath, 'utf8')
      .then((text) => {
        const all = text.split('\n');
        setLines(all.slice(0, MAX_LINES));
        setScrollOffset(0);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filePath]);

  // Expose scroll control via key handling in parent via props would be complex;
  // instead expose a ref-like callback — parent calls scrollUp/scrollDown directly.
  // For now, store handlers on window-like object keyed by focused.
  useEffect(() => {
    (globalThis as Record<string, unknown>).__fileViewerScroll = {
      up: () => setScrollOffset((s) => Math.max(0, s - 1)),
      down: () => setScrollOffset((s) => Math.min(Math.max(0, lines.length - termRows), s + 1)),
      pageUp: () => setScrollOffset((s) => Math.max(0, s - termRows)),
      pageDown: () => setScrollOffset((s) => Math.min(Math.max(0, lines.length - termRows), s + termRows)),
      jumpEnd: () => setScrollOffset(Math.max(0, lines.length - termRows)),
      jumpStart: () => setScrollOffset(0),
    };
  }, [lines.length, termRows]);

  const borderColor = focused ? 'cyan' : 'gray';
  const title = filePath ? basename(filePath) : 'FILE VIEWER';
  const visibleLines = lines.slice(scrollOffset, scrollOffset + termRows);
  const totalLines = lines.length;
  const scrollPct = totalLines > 0 ? Math.round(((scrollOffset + termRows) / totalLines) * 100) : 100;
  const isMarkdown = filePath?.endsWith('.md') ?? false;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      flexGrow={1}
      overflow="hidden"
    >
      {/* Title bar */}
      <Box paddingX={1} justifyContent="space-between">
        <Text color={focused ? 'cyan' : 'white'} bold={focused}>
          {focused ? '▶ ' : '  '}{title}
        </Text>
        {totalLines > 0 && (
          <Text dimColor>
            L{scrollOffset + 1}–{Math.min(scrollOffset + termRows, totalLines)}/{totalLines} {scrollPct}%
          </Text>
        )}
      </Box>

      {loading && (
        <Box paddingX={1}><Text dimColor>Loading…</Text></Box>
      )}

      {error && (
        <Box paddingX={1}><Text color="red">{error}</Text></Box>
      )}

      {!filePath && !loading && (
        <Box paddingX={1} paddingY={1}>
          <Text dimColor>Select a file in the tree and press Enter to open it.</Text>
        </Box>
      )}

      {!loading && !error && (
        isMarkdown ? (
          <Box flexDirection="column" paddingX={1}>
            <MarkdownRenderer lines={visibleLines} />
          </Box>
        ) : (
          visibleLines.map((line, i) => {
            const lineNum = scrollOffset + i + 1;
            return (
              <Box key={lineNum} paddingX={1}>
                <Text dimColor>{String(lineNum).padStart(4, ' ')} </Text>
                {colourLine(line)}
              </Box>
            );
          })
        )
      )}
    </Box>
  );
}
