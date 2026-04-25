/**
 * HelpOverlay — full-screen keybinding reference panel.
 * Displayed over the main layout when the user presses [h].
 * @module tui/components/HelpOverlay
 */

import React from 'react';
import { Box, Text } from 'ink';

interface HelpOverlayProps {
  onClose: () => void;
}

interface KeyEntry {
  key: string;
  desc: string;
}

interface Section {
  title: string;
  color: string;
  keys: KeyEntry[];
}

const SECTIONS: Section[] = [
  {
    title: 'Global',
    color: 'cyan',
    keys: [
      { key: 'Tab / Shift+Tab', desc: 'Cycle panel focus forward / backward' },
      { key: 'v',               desc: 'Toggle Files mode ↔ Analysis mode' },
      { key: 'h',               desc: 'Open / close this help panel' },
      { key: 'Esc',             desc: 'Close overlay (detail / stream / help)' },
      { key: 'q  /  Ctrl+C',   desc: 'Quit' },
    ],
  },
  {
    title: 'Analysis mode — Runs panel',
    color: 'green',
    keys: [
      { key: '↑ / ↓',   desc: 'Select a workflow run' },
      { key: 'Enter',    desc: 'Load selected run and run analysis' },
    ],
  },
  {
    title: 'Analysis mode — Issues panel',
    color: 'green',
    keys: [
      { key: '↑ / ↓',   desc: 'Navigate issues list' },
      { key: 'Enter',    desc: 'Open detail view for selected issue' },
      { key: 'f',        desc: 'Cycle filter: All → Failures → Perf → Bugs → Quality' },
      { key: 'r',        desc: 'Re-analyze selected issue with Copilot (streaming)' },
      { key: 'e',        desc: 'Export JSON + Markdown report to current directory' },
      { key: 'a',        desc: 'Run the audit-and-fix skill — opens interactive Copilot session to validate logs, apply fixes, and purge workflow artefacts' },
      { key: 'Esc',      desc: 'Close detail / LLM stream panel' },
    ],
  },
  {
    title: 'Files mode — File Tree panel',
    color: 'blue',
    keys: [
      { key: '↑ / ↓',   desc: 'Navigate files and directories' },
      { key: 'Enter',    desc: 'Open file in viewer  /  Expand or collapse directory' },
    ],
  },
  {
    title: 'Files mode — File Viewer panel',
    color: 'blue',
    keys: [
      { key: '↑ / ↓',        desc: 'Scroll one line up / down' },
      { key: 'PgUp / PgDn',  desc: 'Scroll one page up / down' },
      { key: 'Ctrl+U / D',   desc: 'Same as PgUp / PgDn' },
      { key: 'g',             desc: 'Jump to top of file' },
      { key: 'G',             desc: 'Jump to bottom of file' },
      { key: 'c',             desc: "Run a consolidation analysis of the selected run's prompts/ log folder — opens interactive Copilot session (file viewer only)" },
      { key: 'd',             desc: 'Analyze the open prompt log file\'s parent folder — opens interactive Copilot session (prompt .md files only)' },
      { key: 'f',             desc: 'Extract actionable issues from the open prompt response and fix them with Copilot (prompt .md files only)' },
       { key: 'p',             desc: 'Toggle Prompt/Response split view (prompt .md files only)' },
       { key: 's',             desc: 'Toggle Prompt Parts view — sections list + content (any open file)' },
       { key: 'a',             desc: 'Analyze selected part vs codebase — streams Copilot analysis, saved to .ai_workflow/analysis/ (Parts view only)' },
       { key: 'b',             desc: 'Reverse-prompt the selected part — streams Copilot linguistic analysis and master-prompt synthesis, saved to .ai_workflow/analysis/ (Parts view only)' },
       { key: 'e',             desc: 'Reverse-prompt the whole prompt — streams Copilot linguistic analysis and master-prompt synthesis for the current prompt log, saved to .ai_workflow/analysis/ (Parts view on prompt .md files only)' },
       { key: 'g',             desc: 'Validate the open prompt log file against the current project codebase with historical-log-aware rules — opens interactive Copilot session (Parts view on prompt .md files only)' },
       { key: 'x',             desc: 'Send analysis file to Copilot CLI — opens interactive [[PLAN]] session to fix reported issues (Parts view on .ai_workflow/analysis/ files only)' },
      { key: 'z',             desc: 'Zoom focused pane full-screen / zoom out (in split view)' },
      { key: 'Tab',           desc: 'Switch focus: Prompt pane ↔ Response pane (works in split and zoom)' },
      { key: 'Esc',           desc: 'Close file viewer / cancel analysis, return to tree' },
    ],
  },
];

function Row({ keyStr, desc }: { keyStr: string; desc: string }) {
  return (
    <Box paddingX={2}>
      <Box width={22} flexShrink={0}>
        <Text color="yellow">{keyStr}</Text>
      </Box>
      <Text dimColor>{desc}</Text>
    </Box>
  );
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  void onClose; // used by parent; referenced here for type completeness
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      flexGrow={1}
      paddingY={1}
    >
      {/* Title */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan"> ⌨  Keyboard Reference </Text>
      </Box>

      {SECTIONS.map((section) => (
        <Box key={section.title} flexDirection="column" marginBottom={1}>
          <Box paddingX={2}>
            <Text bold color={section.color}>{section.title}</Text>
          </Box>
          {section.keys.map((k, index) => (
            <Row key={`${section.title}:${k.key}:${index}`} keyStr={k.key} desc={k.desc} />
          ))}
        </Box>
      ))}

      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>Press <Text color="cyan">h</Text> or <Text color="cyan">Esc</Text> to close</Text>
      </Box>
    </Box>
  );
}
