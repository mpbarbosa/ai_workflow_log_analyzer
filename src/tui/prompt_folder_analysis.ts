/**
 * Helpers for launching targeted Copilot analysis sessions from prompt-log folders.
 * @module tui/prompt_folder_analysis
 */

/**
 * Builds the interactive Copilot prompt for analyzing the open prompt file's parent folder.
 */
export function buildPromptFolderAnalysisPrompt(folderPath: string, sourceLogFilePath: string): string {
  return [
    `Analyze the prompt log folder at ${folderPath}.`,
    `This action was triggered from the prompt log file: ${sourceLogFilePath}`,
    'The prompt templates that produced this log are hosted in the /home/mpb/Documents/GitHub/ai_workflow.js repository.',
    '',
    'Important analysis rules:',
    '- Operate on the repository that owns these prompt logs (the current working directory for this session).',
    '- Treat the selected folder as the primary scope; read across the files in this folder instead of only the triggering file.',
    '- Keep this analysis narrower than a run-wide consolidation: focus on issues, patterns, and inconsistencies visible within this folder.',
    '- Distinguish clearly between confirmed issues, inconclusive observations, and expected historical drift.',
    '- Cite the specific prompt-log files in this folder and the current project files that support each finding.',
    '- End with a prioritized summary of actionable findings and concrete next steps.',
  ].join('\n');
}
