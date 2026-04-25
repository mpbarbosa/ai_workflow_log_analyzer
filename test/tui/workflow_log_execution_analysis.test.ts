import { buildWorkflowLogExecutionAnalysisPrompt } from '../../src/tui/workflow_log_execution_analysis.js';

describe('buildWorkflowLogExecutionAnalysisPrompt', () => {
  it('anchors analysis to the selected workflow log path and sibling repo context', () => {
    const prompt = buildWorkflowLogExecutionAnalysisPrompt('/tmp/workflow_20260414_010203/workflow.log');

    expect(prompt).toContain('/tmp/workflow_20260414_010203/workflow.log');
    expect(prompt).toContain('sibling ai_workflow.js repository context');
    expect(prompt).toContain('primary evidence source');
  });

  it('requires expert, evidence-driven findings with prompt-improvement output', () => {
    const prompt = buildWorkflowLogExecutionAnalysisPrompt('/tmp/workflow.log');

    expect(prompt).toContain('expert ai_workflow.js execution analyst');
    expect(prompt).toContain('compare it against the observed step order in the log');
    expect(prompt).toContain('Validate step ordering explicitly');
    expect(prompt).toContain('Distinguish confirmed findings, inconclusive observations, and expected historical drift');
    expect(prompt).toContain('Flag skipped prerequisites, dependency violations, repeated backtracking, and any step-order mismatch');
    expect(prompt).toContain('For each confirmed execution-flow defect');
    expect(prompt).toContain('Propose better prompt structures');
    expect(prompt).toContain('Prompt / template improvement proposals for ai_workflow.js');
    expect(prompt).toContain('Prioritized findings (including step-order validation results)');
    expect(prompt).toContain('Recommended next actions');
  });
});
