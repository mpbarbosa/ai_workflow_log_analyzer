/**
 * Helpers for launching targeted Copilot validation sessions from prompt logs.
 * @module tui/prompt_log_validation
 */

export function buildPromptLogValidationPrompt(logFilePath: string): string {
  return [
    `Validate the ${logFilePath} log file against this project's actual codebase.`,
    'The prompt templates that produced this log are hosted in the /home/mpb/Documents/GitHub/ai_workflow.js repository.',
    '',
    'Important validation rules:',
    '- Treat the log as a historical artifact. A later version bump in the live repository is not, by itself, a mismatch.',
    '- Only report a version mismatch when the log itself shows contemporaneous artifacts that should agree but do not.',
    '- Focus on real issues such as unsupported claims, conclusions drawn from truncated or partial evidence, impossible checks outside the provided scope, and statements contradicted by the visible codebase.',
    '- When the prompt or embedded file content is incomplete, require an unavailable or inconclusive result instead of a success claim.',
    '- Cite the log lines and current project files that support each finding.',
    '- Do not spend effort on expected repository evolution after the log timestamp.',
  ].join('\n');
}
