/**
 * Helpers for launching interactive Copilot execution-analysis sessions from workflow.log files.
 * @module tui/workflow_log_execution_analysis
 */

/**
 * Builds the interactive Copilot prompt for analyzing a selected workflow.log file as an ai_workflow.js execution artifact.
 */
export function buildWorkflowLogExecutionAnalysisPrompt(logFilePath: string): string {
  return [
    `Analyze the ai_workflow.js execution log at ${logFilePath}.`,
    '',
    'You are operating in the sibling ai_workflow.js repository context, not in the log-analyzer repository.',
    'Treat this as a workflow-forensics and prompt-engineering review of a historical execution artifact.',
    '',
    'Adopt the role of an expert ai_workflow.js execution analyst. Be precise, skeptical, evidence-driven, and concrete.',
    '',
    'Important analysis rules:',
    '- Treat the selected workflow.log file as the primary evidence source.',
    '- Use the ai_workflow.js repository context to reason about workflow design, task orchestration, prompt structure, and execution expectations.',
    '- Reconstruct the expected ai_workflow.js execution flow from the live repository, then compare it against the observed step order in the log.',
    '- Validate step ordering explicitly: confirm whether prerequisite, planning, execution, verification, and cleanup steps happened in the right sequence before dependent work began.',
    '- Distinguish confirmed findings, inconclusive observations, and expected historical drift.',
    '- Focus on execution failures, orchestration mistakes, prompt-structure weaknesses, invalid assumptions, retry loops, missing prerequisites, out-of-order steps, and misleading success signals.',
    '- Call out where the execution suggests weaknesses in ai_workflow.js prompt design, task decomposition, tool choice, sequencing, or evidence handling.',
    '- Flag skipped prerequisites, dependency violations, repeated backtracking, and any step-order mismatch that made later work invalid or unreliable.',
    '- For each confirmed execution-flow defect, explain the downstream impact and propose the smallest ai_workflow.js prompt, orchestration, or guardrail change that would prevent the same ordering mistake.',
    '- Propose better prompt structures when the log suggests the original prompt was ambiguous, weakly scoped, insufficiently evidence-bound, or operationally brittle.',
    '- Do not overclaim from partial log excerpts; when evidence is missing, say so explicitly.',
    '- Cite the relevant log excerpts for every substantive finding.',
    '- End with:',
    '  1. Executive summary',
    '  2. Prioritized findings (including step-order validation results)',
    '  3. Prompt / template improvement proposals for ai_workflow.js',
    '  4. Recommended next actions',
  ].join('\n');
}
