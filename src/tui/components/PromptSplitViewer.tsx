/**
 * PromptSplitViewer — parses a prompt log .md file and shows PROMPT and
 * RESPONSE in dedicated side-by-side panes.
 * Activated by pressing [p] when a prompts/*.md file is open in FileViewer.
 * @module tui/components/PromptSplitViewer
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parsePromptFileContent } from '../../parsers/prompt_parser.js';

interface PromptSplitViewerProps {
  filePath: string;
  focusedPane: 'prompt' | 'response';
  /** When set, only this pane is rendered full-screen (no sidebar, no split). */
  zoomedPane: 'prompt' | 'response' | null;
}

// ─── Scrollable pane ──────────────────────────────────────────────────────────

interface PaneProps {
  title: string;
  color: string;
  lines: string[];
  offset: number;
  maxRows: number;
  focused: boolean;
  meta?: string;
}

function Pane({ title, color, lines, offset, maxRows, focused, meta }: PaneProps) {
  const visible = lines.slice(offset, offset + maxRows);
  const pct = lines.length > 0 ? Math.round(((offset + maxRows) / lines.length) * 100) : 100;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? color : 'gray'}
      flexGrow={1}
      overflow="hidden"
    >
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color={focused ? color : 'white'}>
          {focused ? '▶ ' : '  '}{title}
        </Text>
        <Text dimColor>
          {meta && <>{meta}  </>}
          {lines.length > 0 && `L${offset + 1}–${Math.min(offset + maxRows, lines.length)}/${lines.length} ${Math.min(pct, 100)}%`}
        </Text>
      </Box>
      {visible.map((line, i) => (
        <Box key={offset + i} paddingX={1}>
          <Text>{line || ' '}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ParsedView {
  persona: string;
  model: string;
  timestamp: Date;
  promptLines: string[];
  responseLines: string[];
}

export function PromptSplitViewer({ filePath, focusedPane, zoomedPane }: PromptSplitViewerProps) {
  const { stdout } = useStdout();
  const maxRows = Math.max(5, (stdout?.rows ?? 40) - 8);

  const [parsed, setParsed] = useState<ParsedView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptOffset, setPromptOffset] = useState(0);
  const [responseOffset, setResponseOffset] = useState(0);

  useEffect(() => {
    setParsed(null);
    setError(null);
    setPromptOffset(0);
    setResponseOffset(0);

    readFile(filePath, 'utf8')
      .then((text) => {
        const result = parsePromptFileContent(text);
        if (!result) { setError('Could not parse prompt file structure.'); return; }
        setParsed({
          persona: result.persona,
          model: result.model,
          timestamp: result.timestamp,
          promptLines: result.prompt.split('\n'),
          responseLines: result.response.split('\n'),
        });
      })
      .catch((e) => setError(String(e)));
  }, [filePath]);

  // Expose scroll handlers via global (same pattern as FileViewer)
  useEffect(() => {
    if (!parsed) return;
    const maxP = Math.max(0, parsed.promptLines.length - maxRows);
    const maxR = Math.max(0, parsed.responseLines.length - maxRows);

    (globalThis as Record<string, unknown>).__promptSplitScroll = {
      up:        () => focusedPane === 'prompt'
                   ? setPromptOffset((s) => Math.max(0, s - 1))
                   : setResponseOffset((s) => Math.max(0, s - 1)),
      down:      () => focusedPane === 'prompt'
                   ? setPromptOffset((s) => Math.min(maxP, s + 1))
                   : setResponseOffset((s) => Math.min(maxR, s + 1)),
      pageUp:    () => focusedPane === 'prompt'
                   ? setPromptOffset((s) => Math.max(0, s - maxRows))
                   : setResponseOffset((s) => Math.max(0, s - maxRows)),
      pageDown:  () => focusedPane === 'prompt'
                   ? setPromptOffset((s) => Math.min(maxP, s + maxRows))
                   : setResponseOffset((s) => Math.min(maxR, s + maxRows)),
      jumpStart: () => focusedPane === 'prompt' ? setPromptOffset(0) : setResponseOffset(0),
      jumpEnd:   () => focusedPane === 'prompt' ? setPromptOffset(maxP) : setResponseOffset(maxR),
    };
  }, [parsed, focusedPane, maxRows]);

  const filename = basename(filePath);

  if (error) {
    return (
      <Box flexGrow={1} borderStyle="single" borderColor="red" padding={1} flexDirection="column">
        <Text color="red">Parse error: {error}</Text>
        <Text dimColor>{filename}</Text>
      </Box>
    );
  }

  if (!parsed) {
    return (
      <Box flexGrow={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>Parsing…</Text>
      </Box>
    );
  }

  const meta = `${parsed.persona}  ·  ${parsed.model}  ·  ${parsed.timestamp.toISOString()}`;

  return (
    <Box flexGrow={1} flexDirection="column">
      {/* File title bar */}
      <Box paddingX={1}>
        <Text color="cyan" bold>📄 {filename}</Text>
        <Text dimColor>  {meta}</Text>
        {zoomedPane && <Text color="yellow" bold>  ⬛ ZOOM: {zoomedPane.toUpperCase()}</Text>}
      </Box>

      {/* Pane area: zoomed (full-screen) or split (side-by-side) */}
      <Box flexGrow={1}>
        {zoomedPane === 'prompt' ? (
          <Pane
            title="PROMPT — ZOOMED"
            color="yellow"
            lines={parsed.promptLines}
            offset={promptOffset}
            maxRows={maxRows}
            focused
            meta={`${parsed.promptLines.length} lines`}
          />
        ) : zoomedPane === 'response' ? (
          <Pane
            title="RESPONSE — ZOOMED"
            color="green"
            lines={parsed.responseLines}
            offset={responseOffset}
            maxRows={maxRows}
            focused
            meta={`${parsed.responseLines.length} lines`}
          />
        ) : (
          /* Normal split view */
          <>
            <Pane
              title="PROMPT"
              color="yellow"
              lines={parsed.promptLines}
              offset={promptOffset}
              maxRows={maxRows}
              focused={focusedPane === 'prompt'}
            />
            <Pane
              title="RESPONSE"
              color="green"
              lines={parsed.responseLines}
              offset={responseOffset}
              maxRows={maxRows}
              focused={focusedPane === 'response'}
            />
          </>
        )}
      </Box>
    </Box>
  );
}

/** Returns true if the given file path looks like a prompt log file. */
export function isPromptFile(filePath: string): boolean {
  return filePath.includes('/prompts/') && filePath.endsWith('.md');
}
