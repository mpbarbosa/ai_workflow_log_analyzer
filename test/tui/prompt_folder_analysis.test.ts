import { buildPromptFolderAnalysisPrompt } from '../../src/tui/prompt_folder_analysis.js';

describe('buildPromptFolderAnalysisPrompt', () => {
  it('anchors analysis to the selected prompt-log folder and source file', () => {
    const prompt = buildPromptFolderAnalysisPrompt(
      '/tmp/run/prompts/step_04',
      '/tmp/run/prompts/step_04/reviewer.md',
    );

    expect(prompt).toContain('/tmp/run/prompts/step_04');
    expect(prompt).toContain('/tmp/run/prompts/step_04/reviewer.md');
    expect(prompt).toContain('/home/mpb/Documents/GitHub/ai_workflow.js repository');
    expect(prompt).toContain('current working directory');
  });

  it('keeps folder analysis scoped below run-wide consolidation', () => {
    const prompt = buildPromptFolderAnalysisPrompt('/tmp/prompts/step_04', '/tmp/prompts/step_04/reviewer.md');

    expect(prompt).toContain('read across the files in this folder');
    expect(prompt).toContain('narrower than a run-wide consolidation');
    expect(prompt).toContain('historical drift');
    expect(prompt).toContain('prioritized summary');
  });
});
