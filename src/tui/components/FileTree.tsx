/**
 * FileTree — browsable file tree for a workflow run directory.
 * Directories expand/collapse with Enter; files are highlighted for opening.
 * @module tui/components/FileTree
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { FileEntry } from '../hooks/useFileTree.js';

interface FileTreeProps {
  entries: FileEntry[];
  selectedIndex: number;
  focused: boolean;
  loading: boolean;
  openedPath: string | null;
}

const INDENT = '  ';

export function FileTree({ entries, selectedIndex, focused, loading, openedPath }: FileTreeProps) {
  const borderColor = focused ? 'cyan' : 'gray';
  const title = focused ? '▶ FILES' : '  FILES';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={28}
      flexShrink={0}
      overflow="hidden"
    >
      <Box paddingX={1}>
        <Text color={focused ? 'cyan' : 'white'} bold={focused}>{title}</Text>
      </Box>

      {loading && (
        <Box paddingX={1}>
          <Text dimColor>Loading…</Text>
        </Box>
      )}

      {!loading && entries.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>No run selected</Text>
        </Box>
      )}

      {!loading && entries.map((entry, i) => {
        const isSelected = i === selectedIndex;
        const isOpen = entry.filePath === openedPath;
        const indent = INDENT.repeat(entry.depth);

        let icon = '';
        if (entry.isDir) {
          icon = entry.isExpanded ? '▼ ' : '▶ ';
        } else {
          icon = isOpen ? '● ' : '  ';
        }

        const label = `${indent}${icon}${entry.label}`;

        return (
          <Box key={entry.key} paddingX={1}>
            <Text
              color={isSelected && focused ? 'black' : entry.isDir ? 'blue' : isOpen ? 'cyan' : undefined}
              backgroundColor={isSelected && focused ? 'cyan' : undefined}
              dimColor={!isSelected && !entry.isDir && !isOpen}
            >
              {label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
