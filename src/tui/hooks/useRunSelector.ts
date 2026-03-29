/**
 * useRunSelector hook — discovers available workflow run directories.
 * @module tui/hooks/useRunSelector
 */

import { useState, useEffect } from 'react';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunInfo } from '../../types/index.js';

const RUN_DIR_RE = /^workflow_\d{8}_\d{6}$/;

async function discoverRuns(aiWorkflowDir: string): Promise<RunInfo[]> {
  const logsDir = join(aiWorkflowDir, 'logs');
  let entries: string[];
  try {
    entries = await readdir(logsDir);
  } catch {
    return [];
  }

  const runs: RunInfo[] = [];
  for (const entry of entries) {
    if (!RUN_DIR_RE.test(entry)) continue;
    const runPath = join(logsDir, entry);
    let stepCount = 0;
    let startTime: Date | null = null;

    try {
      const s = await stat(runPath);
      startTime = s.birthtime;
    } catch {
      // ignore
    }

    try {
      const stepsDir = join(runPath, 'steps');
      const stepFiles = await readdir(stepsDir);
      stepCount = stepFiles.filter((f) => f.endsWith('.log')).length;
    } catch {
      // no steps dir
    }

    runs.push({ runId: entry, path: runPath, startTime, stepCount });
  }

  return runs.sort((a, b) => (b.startTime?.getTime() ?? 0) - (a.startTime?.getTime() ?? 0));
}

export function useRunSelector(aiWorkflowDir: string) {
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    discoverRuns(aiWorkflowDir).then((found) => {
      setRuns(found);
      setLoading(false);
    });
  }, [aiWorkflowDir]);

  const select = (index: number) => setSelectedIndex(Math.max(0, Math.min(runs.length - 1, index)));
  const selectedRun = runs[selectedIndex] ?? null;

  return { runs, selectedIndex, selectedRun, loading, select };
}
