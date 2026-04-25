/**
 * Helpers for launching interactive Copilot consolidation sessions from a run's prompt logs.
 * @module tui/prompt_log_consolidation
 */

/**
 * Builds the interactive Copilot prompt for consolidating findings across a run's prompt-log folder.
 */
export function buildPromptLogConsolidationPrompt(promptsDir: string): string {
  return [
    `Do a consolidation analysis of the log files in the ${promptsDir} log folder.`,
    'Use that request as the starting point, but improve it into a disciplined, evidence-based review.',
    'The prompt templates that produced this log are hosted in the /home/mpb/Documents/GitHub/ai_workflow.js repository.',
    'The prompt template lives in /home/mpb/Documents/GitHub/ai_workflow_log_analyzer project repo.',
    '',
    'Important consolidation rules:',
    '- Read across the full folder and consolidate recurring patterns instead of reviewing each file in isolation.',
    '- Group findings by confirmed issue/theme, and merge duplicate observations into a single consolidated finding.',
    '- Distinguish clearly between confirmed issues, plausible but unconfirmed concerns, and expected historical drift or no issue.',
    '- When the live repository has evolved since the log was captured, do not treat later changes as automatic mismatches.',
    '- Cite the specific log files and the relevant evidence for every consolidated finding.',
    '- Call out which findings appear to be prompt-template flaws, workflow-assumption problems, or repository-specific mismatches.',
    '- End with a prioritized summary and concrete next actions.',
  ].join('\n');
}
