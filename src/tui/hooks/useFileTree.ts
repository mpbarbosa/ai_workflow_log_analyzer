/**
 * useFileTree hook — builds a flat navigable list of files in a run directory.
 * Directories are collapsible; leaf items carry the full path for viewing.
 * @module tui/hooks/useFileTree
 */

import { useState, useEffect } from 'react';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

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
    // Heuristic: names without extension are dirs (steps/, prompts/)
    const isDir = !name.includes('.') || name.endsWith('/');
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
    if (!name.includes('.')) {
      // Directory
      result.push({ label: name + '/', filePath: null, depth: 0, isDir: true, isExpanded: false, key: full });
    } else {
      result.push({ label: name, filePath: full, depth: 0, isDir: false, key: full });
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
