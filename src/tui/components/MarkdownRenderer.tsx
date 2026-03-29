/**
 * MarkdownRenderer — renders a subset of Markdown as styled Ink components.
 *
 * Supported syntax:
 *   # / ## / ###   Headings (bold + coloured)
 *   **text**        Bold (inline)
 *   *text*          Italic → dimmed (inline)
 *   `code`          Inline code → cyan
 *   ```…```         Fenced code blocks → bordered box
 *   - / * item      Unordered lists
 *   1. item         Ordered lists
 *   ---             Horizontal rule
 *   > text          Blockquote → dimmed + indent
 *   plain text      Normal paragraph lines
 *
 * @module tui/components/MarkdownRenderer
 */

import React from 'react';
import { Box, Text } from 'ink';

// ── Inline parser ─────────────────────────────────────────────────────────────

type Span =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bold-italic'; value: string };

function parseInline(raw: string): Span[] {
  const spans: Span[] = [];
  // Combined regex: ***…***, **…**, *…*, `…`
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) spans.push({ kind: 'text', value: raw.slice(last, m.index) });
    if (m[2] !== undefined) spans.push({ kind: 'bold-italic', value: m[2] });
    else if (m[3] !== undefined) spans.push({ kind: 'bold', value: m[3] });
    else if (m[4] !== undefined) spans.push({ kind: 'italic', value: m[4] });
    else if (m[5] !== undefined) spans.push({ kind: 'code', value: m[5] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) spans.push({ kind: 'text', value: raw.slice(last) });
  return spans.length ? spans : [{ kind: 'text', value: raw }];
}

function InlineSpans({ raw }: { raw: string }) {
  const spans = parseInline(raw);
  return (
    <>
      {spans.map((s, i) => {
        switch (s.kind) {
          case 'bold':        return <Text key={i} bold>{s.value}</Text>;
          case 'italic':      return <Text key={i} dimColor>{s.value}</Text>;
          case 'bold-italic': return <Text key={i} bold dimColor>{s.value}</Text>;
          case 'code':        return <Text key={i} color="cyan">{s.value}</Text>;
          default:            return <Text key={i}>{s.value}</Text>;
        }
      })}
    </>
  );
}

// ── Block renderer ────────────────────────────────────────────────────────────

interface RenderedBlock {
  key: string;
  node: React.ReactNode;
}

function renderBlocks(lines: string[]): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      blocks.push({
        key: `code-${i}`,
        node: (
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            marginY={0}
            paddingX={1}
          >
            {lang && <Text dimColor>{lang}</Text>}
            {codeLines.map((cl, ci) => (
              <Text key={ci} color="cyan">{cl || ' '}</Text>
            ))}
          </Box>
        ),
      });
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      blocks.push({
        key: `h1-${i}`,
        node: (
          <Box paddingY={0}>
            <Text bold color="yellow">{'━━ '}<InlineSpans raw={h1[1]} />{' ━━'}</Text>
          </Box>
        ),
      });
      i++; continue;
    }
    if (h2) {
      blocks.push({
        key: `h2-${i}`,
        node: (
          <Box paddingY={0}>
            <Text bold color="cyan">{'── '}<InlineSpans raw={h2[1]} /></Text>
          </Box>
        ),
      });
      i++; continue;
    }
    if (h3) {
      blocks.push({
        key: `h3-${i}`,
        node: (
          <Box paddingY={0}>
            <Text bold color="white">{'  '}<InlineSpans raw={h3[1]} /></Text>
          </Box>
        ),
      });
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({
        key: `hr-${i}`,
        node: <Text dimColor>{'─'.repeat(60)}</Text>,
      });
      i++; continue;
    }

    // Blockquote
    const bq = line.match(/^> ?(.*)/);
    if (bq) {
      blocks.push({
        key: `bq-${i}`,
        node: (
          <Box paddingLeft={2}>
            <Text dimColor>│ </Text>
            <Text dimColor><InlineSpans raw={bq[1]} /></Text>
          </Box>
        ),
      });
      i++; continue;
    }

    // Unordered list item
    const ul = line.match(/^(\s*)[-*+] (.+)/);
    if (ul) {
      const indent = Math.floor(ul[1].length / 2);
      blocks.push({
        key: `ul-${i}`,
        node: (
          <Box paddingLeft={1 + indent * 2}>
            <Text color="yellow">{'• '}</Text>
            <Text><InlineSpans raw={ul[2]} /></Text>
          </Box>
        ),
      });
      i++; continue;
    }

    // Ordered list item
    const ol = line.match(/^(\s*)(\d+)\. (.+)/);
    if (ol) {
      const indent = Math.floor(ol[1].length / 2);
      blocks.push({
        key: `ol-${i}`,
        node: (
          <Box paddingLeft={1 + indent * 2}>
            <Text color="yellow">{ol[2]}. </Text>
            <Text><InlineSpans raw={ol[3]} /></Text>
          </Box>
        ),
      });
      i++; continue;
    }

    // Blank line → small spacer
    if (line.trim() === '') {
      blocks.push({ key: `blank-${i}`, node: <Text> </Text> });
      i++; continue;
    }

    // Plain paragraph line
    blocks.push({
      key: `p-${i}`,
      node: (
        <Box paddingLeft={1}>
          <Text><InlineSpans raw={line} /></Text>
        </Box>
      ),
    });
    i++;
  }

  return blocks;
}

// ── Public component ──────────────────────────────────────────────────────────

interface MarkdownRendererProps {
  /** Lines of the markdown file (already sliced to the visible window). */
  lines: string[];
}

export function MarkdownRenderer({ lines }: MarkdownRendererProps) {
  const blocks = renderBlocks(lines);
  return (
    <>
      {blocks.map((b) => (
        <Box key={b.key}>{b.node}</Box>
      ))}
    </>
  );
}
