/**
 * useAnalysis hook — runs the full analysis pipeline and manages state for the TUI.
 * @module tui/hooks/useAnalysis
 */

import { useState, useCallback } from 'react';
import { join } from 'node:path';
import { runAnalysisPipeline } from '../../lib/pipeline.js';
import type { AnalysisReport, RunInfo, ThresholdConfig, IssueFilter } from '../../types/index.js';

export type AnalysisState = 'idle' | 'running' | 'done' | 'error';

export interface AnalysisProgress {
  phase: string;
  done: number;
  total: number;
}

export function useAnalysis(thresholds?: ThresholdConfig) {
  const [state, setState] = useState<AnalysisState>('idle');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress>({ phase: '', done: 0, total: 0 });
  const [filter, setFilter] = useState<IssueFilter>('all');

  const run = useCallback(async (runInfo: RunInfo, projectRoot: string, skipPromptQuality = false) => {
    setState('running');
    setError(null);
    setReport(null);

    try {
      const metricsDir = join(projectRoot, '.ai_workflow', 'metrics');
      const result = await runAnalysisPipeline(runInfo.path, metricsDir, {
        thresholds,
        skipPromptQuality,
        skipSummary: skipPromptQuality,
        onProgress: (phase, done, total) => setProgress({ phase, done, total }),
      });
      setReport(result);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }, [thresholds]);

  const filteredIssues = report
    ? (filter === 'all' ? report.issues : report.issues.filter((i) => i.category === filter))
    : [];

  const cycleFilter = useCallback(() => {
    const order: IssueFilter[] = ['all', 'failure', 'performance', 'bug', 'prompt_quality'];
    setFilter((prev) => {
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length];
    });
  }, []);

  return { state, report, error, progress, filter, filteredIssues, run, cycleFilter };
}
