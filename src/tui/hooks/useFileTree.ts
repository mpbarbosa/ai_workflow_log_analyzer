/**
 * useFileTree hook — builds a flat navigable list of files in a run directory.
 * Directories are collapsible; leaf items carry the full path for viewing.
 * File entries include the size in bytes for human-readable display.
 * @module tui/hooks/useFileTree
 */

import { useState, useEffect } from 'react';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface FileEntry {
  /** Display label (indented name) */
  label: string;
  /** Absolute path — set only for files */
  filePath: string | null;
  /** Depth for indentation */
  depth: number;
  isDir: boolean;
  isExpanded?: boolean;
  /** Key used to track expansion state */
  key: string;
  /** File size in bytes — populated for files only, undefined for directories */
  sizeBytes?: number;
}

/**
 * Converts a raw byte count into a human-readable size string.
 * Uses 1-decimal-place precision for KB, MB, and GB.
 *
 * @example
 * formatFileSize(512)       // "512 B"
 * formatFileSize(2457)      // "2.4 KB"
 * formatFileSize(1572864)   // "1.5 MB"
 * formatFileSize(1610612736) // "1.5 GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function scanDir(dir: string, depth: number): Promise<FileEntry[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch {
    return [];
  }

  const entries: FileEntry[] = [];
  for (const name of names) {
    const full = join(dir, name);
    let isDir = false;
    let sizeBytes: number | undefined;
    try {
      const s = await stat(full);
      isDir = s.isDirectory();
      if (!isDir) sizeBytes = s.size;
    } catch { /* treat as file on error */ }
    if (isDir) {
      entries.push({
        label: name + '/',
        filePath: null,
        depth,
        isDir: true,
        isExpanded: false,
        key: full,
      });
    } else {
      entries.push({
        label: name,
        filePath: full,
        depth,
        isDir: false,
        key: full,
        sizeBytes,
      });
    }
  }
  return entries;
}

async function buildTree(runDir: string, analysisDir: string | null): Promise<FileEntry[]> {
  const result: FileEntry[] = [];
  const topNames = (await readdir(runDir).catch(() => [])).sort();

  for (const name of topNames) {
    const full = join(runDir, name);
    let isDir = false;
    let sizeBytes: number | undefined;
    try {
      const s = await stat(full);
      isDir = s.isDirectory();
      if (!isDir) sizeBytes = s.size;
    } catch { /* treat as file on error */ }
    if (isDir) {
      result.push({ label: name + '/', filePath: null, depth: 0, isDir: true, isExpanded: false, key: full });
    } else {
      result.push({ label: name, filePath: full, depth: 0, isDir: false, key: full, sizeBytes });
    }
  }

  if (analysisDir) {
    const analysisNames = await readdir(analysisDir).catch(() => null);
    if (analysisNames !== null) {
      result.push({
        label: 'analysis/',
        filePath: null,
        depth: 0,
        isDir: true,
        isExpanded: false,
        key: analysisDir,
      });
    }
  }

  return result;
}

/**
 * Builds and manages the file-tree for a workflow run directory.
 * Handles lazy directory expansion and tracks the selected entry.
 * @param runDir - Absolute path to the workflow run directory, or `null` when no run is selected
 * @param analysisDir - Optional path to an analysis output directory to append as a tree node
 */
export function useFileTree(runDir: string | null, analysisDir: string | null = null) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runDir) { setEntries([]); return; }
    setLoading(true);
    setSelectedIndex(0);
    buildTree(runDir, analysisDir).then((e) => { setEntries(e); setLoading(false); });
  }, [runDir, analysisDir]);

  const selectedEntry = entries[selectedIndex] ?? null;

  const moveUp = () => setSelectedIndex((i) => Math.max(0, i - 1));
  const moveDown = () => setSelectedIndex((i) => Math.min(entries.length - 1, i + 1));

  const toggleExpand = async () => {
    if (!selectedEntry?.isDir || !runDir) return;
    const idx = selectedIndex;
    const entry = entries[idx];

    if (entry.isExpanded) {
      // Collapse: remove all children of this dir
      const childDepth = entry.depth + 1;
      const before = entries.slice(0, idx + 1);
      let after = entries.slice(idx + 1);
      // Drop entries that are children (deeper depth until we hit same/shallower)
      while (after.length > 0 && after[0].depth >= childDepth) after = after.slice(1);
      setEntries([...before.map((e, i) => i === idx ? { ...e, isExpanded: false } : e), ...after]);
    } else {
      // Expand: read children and insert after this entry
      const children = await scanDir(entry.key, entry.depth + 1);
      const updated = [
        ...entries.slice(0, idx),
        { ...entry, isExpanded: true },
        ...children,
        ...entries.slice(idx + 1),
      ];
      setEntries(updated);
    }
  };

  return { entries, selectedIndex, selectedEntry, loading, moveUp, moveDown, toggleExpand };
}
