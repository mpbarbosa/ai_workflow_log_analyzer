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
 * Runs concurrently with Promise.all for reduced total latency.
 */
export async function analyzeAllPrompts(
  records: PromptRecord[],
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS,
  onProgress?: (done: number, total: number) => void
): Promise<PromptQualityResult[]> {
  let done = 0;
  return Promise.all(
    records.map(async (record) => {
      const result = await analyzePromptRecord(record, thresholds);
      onProgress?.(++done, records.length);
      return result;
    })
  );
}
