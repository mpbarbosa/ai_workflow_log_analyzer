import { buildPromptLogConsolidationPrompt } from '../../src/tui/prompt_log_consolidation.js';

describe('buildPromptLogConsolidationPrompt', () => {
  it('anchors consolidation to the selected prompts directory', () => {
    const prompt = buildPromptLogConsolidationPrompt('/tmp/workflow_20260414_010203/prompts');

    expect(prompt).toContain('/tmp/workflow_20260414_010203/prompts');
    expect(prompt).toContain('consolidation analysis');
  });

  it('requires evidence-based, historically aware consolidated findings', () => {
    const prompt = buildPromptLogConsolidationPrompt('/tmp/prompts');

    expect(prompt).toContain('/home/mpb/Documents/GitHub/ai_workflow.js repository');
    expect(prompt).toContain('/home/mpb/Documents/GitHub/ai_workflow_log_analyzer project repo');
    expect(prompt).toContain('recurring patterns');
    expect(prompt).toContain('confirmed issues');
    expect(prompt).toContain('historical drift');
    expect(prompt).toContain('Cite the specific log files');
    expect(prompt).toContain('prioritized summary');
  });
});
