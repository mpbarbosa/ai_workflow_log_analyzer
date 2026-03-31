/**
 * Analysis pipeline — orchestrates parsers and analyzers into a full AnalysisReport.
 * @module lib/pipeline
 */

import { join } from 'node:path';
import { parseRunLogsToArray, parseRunMetadata } from '../parsers/log_parser.js';
import { parseRunPrompts } from '../parsers/prompt_parser.js';
import { parseMetrics } from '../parsers/metrics_parser.js';
import { analyzeFailures } from '../analyzers/failure_analyzer.js';
import { analyzePerformance } from '../analyzers/performance_analyzer.js';
import { analyzeBugs } from '../analyzers/bug_analyzer.js';
import { analyzeDocumentation } from '../analyzers/doc_analyzer.js';
import { analyzeAllPrompts } from '../analyzers/prompt_quality_analyzer.js';
import { summarizeReport } from './copilot_client.js';
import type { AnalysisReport, Issue, RunMetrics, ThresholdConfig } from '../types/index.js';
import { DEFAULT_THRESHOLDS } from '../types/index.js';

/**
 * Options for {@link runAnalysisPipeline}.
 * All fields are optional; omitted fields fall back to safe defaults.
 */
export interface PipelineOptions {
  thresholds?: ThresholdConfig;
  /** Explicit project root; overrides value found in run_metadata.json */
  projectRoot?: string;
  /** Skip LLM-assisted prompt quality analysis (faster, offline) */
  skipPromptQuality?: boolean;
  /** Skip final LLM executive summary */
  skipSummary?: boolean;
  onProgress?: (phase: string, done: number, total: number) => void;
}

/**
 * Runs the full analysis pipeline on a workflow run directory.
 * @param runDir - Path to workflow_YYYYMMDD_HHMMSS/ directory
 * @param metricsDir - Path to .ai_workflow/metrics/ directory
 */
export async function runAnalysisPipeline(
  runDir: string,
  metricsDir: string,
  opts: PipelineOptions = {}
): Promise<AnalysisReport> {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const runId = runDir.split('/').pop() ?? 'unknown';

  opts.onProgress?.('Parsing logs', 0, 3);
  const [events, prompts, metricsData, runMeta] = await Promise.all([
    parseRunLogsToArray(runDir),
    parseRunPrompts(runDir),
    parseMetrics(metricsDir),
    parseRunMetadata(runDir),
  ]);
  opts.onProgress?.('Parsing logs', 3, 3);

  const projectRoot = opts.projectRoot ?? runMeta.projectRoot;

  opts.onProgress?.('Analyzing', 0, 4);
  const failures = analyzeFailures(events);
  const perfIssues = analyzePerformance(events, thresholds);
  const bugs = analyzeBugs(events);
  const docIssues = analyzeDocumentation(events);
  opts.onProgress?.('Analyzing', 4, 4);

  // Build run metrics from parsed data or metrics file
  const metrics: RunMetrics = metricsData.currentRun ?? {
    runId,
    startTime: events[0]?.timestamp ?? new Date(),
    stepCount: 0,
    steps: [],
    totalAiCalls: 0,
    avgAiLatencyMs: 0,
  };

  // Prompt quality analysis (requires Copilot SDK — degrade gracefully on LLM errors)
  let promptQuality: Awaited<ReturnType<typeof analyzeAllPrompts>> = [];
  if (!opts.skipPromptQuality && prompts.length > 0) {
    try {
      promptQuality = await analyzeAllPrompts(prompts, thresholds, (done, total) => {
        opts.onProgress?.('Prompt quality', done, total);
      });
    } catch {
      // LLM unavailable (e.g. no Copilot access, network error) — skip silently
    }
  }

  const promptQualityIssues = promptQuality.flatMap((r) => (r.issue ? [r.issue] : []));
  const allIssues: Issue[] = [...failures, ...perfIssues, ...bugs, ...docIssues, ...promptQualityIssues];

  const counts = {
    total: allIssues.length,
    failures: failures.length,
    performance: perfIssues.length,
    bugs: bugs.length,
    documentation: docIssues.length,
    promptQuality: promptQualityIssues.length,
    critical: allIssues.filter((i) => i.severity === 'critical').length,
  };

  const report: AnalysisReport = {
    runId,
    analyzedAt: new Date(),
    projectRoot,
    metrics,
    issues: allIssues,
    promptQuality,
    counts,
  };

  if (!opts.skipSummary) {
    opts.onProgress?.('Summarizing', 0, 1);
    try {
      report.summary = await summarizeReport(JSON.stringify({ runId, counts, topIssues: allIssues.slice(0, 5) }));
    } catch {
      // summary is optional
    }
    opts.onProgress?.('Summarizing', 1, 1);
  }

  return report;
}
