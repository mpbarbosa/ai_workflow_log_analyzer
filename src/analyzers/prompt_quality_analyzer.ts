/**
 * Prompt Quality Analyzer — LLM-assisted analysis of prompt+response pairs.
 * Uses the Copilot SDK to score each prompt on quality dimensions.
 * @module analyzers/prompt_quality_analyzer
 */

import type { PromptRecord, Issue, PromptQualityResult, ThresholdConfig } from '../types/index.js';
import { DEFAULT_THRESHOLDS } from '../types/index.js';
import { analyzePromptQuality } from '../lib/copilot_client.js';

let _issueCounter = 0;
function nextId(): string {
  return `pq-${++_issueCounter}`;
}

/**
 * Analyzes a single prompt record for quality using the Copilot SDK.
 */
export async function analyzePromptRecord(
  record: PromptRecord,
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): Promise<PromptQualityResult> {
  const { score, feedback, suggestions } = await analyzePromptQuality(
    record.persona,
    record.model,
    record.prompt,
    record.response
  );

  let issue: Issue | undefined;
  if (score < thresholds.promptQualityMinScore) {
    issue = {
      id: nextId(),
      category: 'prompt_quality',
      severity: score < 40 ? 'high' : 'medium',
      stepId: record.stepId,
      title: `Low prompt quality in ${record.stepId} (${score}%) — persona: ${record.persona}`,
      detail: feedback,
      evidence: record.prompt.slice(0, 500),
      llmAnalysis: [feedback, ...suggestions.map((s) => `• ${s}`)].join('\n'),
      timestamp: record.timestamp,
    };
  }

  return { promptRecord: record, score, feedback, suggestions, issue };
}

/**
 * Analyzes all prompt records for a run.
 * Runs sequentially to avoid overwhelming the Copilot SDK.
 */
export async function analyzeAllPrompts(
  records: PromptRecord[],
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS,
  onProgress?: (done: number, total: number) => void
): Promise<PromptQualityResult[]> {
  const results: PromptQualityResult[] = [];
  for (let i = 0; i < records.length; i++) {
    const result = await analyzePromptRecord(records[i], thresholds);
    results.push(result);
    onProgress?.(i + 1, records.length);
  }
  return results;
}
