import {
  buildPromptPartAnalysisSystemPrompt,
  buildPromptPartAnalysisUserPrompt,
  buildReversePromptPartAnalysisSystemPrompt,
  buildReversePromptPartAnalysisUserPrompt,
  buildReversePromptWholeAnalysisUserPrompt,
} from '../../src/lib/copilot_client';

describe('prompt part analysis prompt builders', () => {
  it('tells the analyzer to treat later repo version bumps as historical drift by default', () => {
    const prompt = buildPromptPartAnalysisSystemPrompt();

    expect(prompt).toContain('Historical-artifact rule');
    expect(prompt).toContain('later version bump');
    expect(prompt).toContain('historical drift');
    expect(prompt).toContain('expected repo evolution');
  });

  it('tells the analyzer not to overclaim from truncated or partial evidence', () => {
    const prompt = buildPromptPartAnalysisSystemPrompt();

    expect(prompt).toContain('Completeness rule');
    expect(prompt).toContain('truncation markers');
    expect(prompt).toContain('inconclusive or unavailable');
    expect(prompt).toContain('unsupported positive claims');
  });

  it('tells the analyzer that prompt templates live in the ai_workflow.js repo', () => {
    const prompt = buildPromptPartAnalysisSystemPrompt();

    expect(prompt).toContain('workflow prompt templates are hosted');
    expect(prompt).toContain('/home/mpb/Documents/GitHub/ai_workflow.js');
    expect(prompt).toContain('prompt-template source files');
  });

  it('builds the user prompt with the section label, content, and codebase snapshot', () => {
    const prompt = buildPromptPartAnalysisUserPrompt('Task', ['Line 1', 'Line 2'], '// ctx');

    expect(prompt).toContain('**SECTION LABEL**: Task');
    expect(prompt).toContain('Line 1\nLine 2');
    expect(prompt).toContain('**CODEBASE CONTEXT**');
    expect(prompt).toContain('// ctx');
  });

  it('exposes the reverse-prompt analysis system prompt with the required output contract', () => {
    const prompt = buildReversePromptPartAnalysisSystemPrompt();

    expect(prompt).toContain('Reverse Prompting');
    expect(prompt).toContain('### Part 1: Linguistic Analysis');
    expect(prompt).toContain('### Part 2: The Generated Master Prompt');
    expect(prompt).toContain('### Part 3: Execution Advice');
  });

  it('builds the reverse-prompt user prompt from the selected section text', () => {
    const prompt = buildReversePromptPartAnalysisUserPrompt('Constraints', ['Line 1', 'Line 2']);

    expect(prompt).toContain('**SECTION LABEL**: Constraints');
    expect(prompt).toContain('**GOLD STANDARD TEXT**');
    expect(prompt).toContain('Line 1\nLine 2');
    expect(prompt).toContain('single named part from a larger prompt');
  });

  it('builds the reverse-prompt whole-prompt user prompt from the full prompt text', () => {
    const prompt = buildReversePromptWholeAnalysisUserPrompt(['Line 1', 'Line 2']);

    expect(prompt).toContain('**PROMPT SCOPE**: Whole Prompt');
    expect(prompt).toContain('**GOLD STANDARD TEXT**');
    expect(prompt).toContain('Line 1\nLine 2');
    expect(prompt).toContain('multiple coordinated sections');
  });
});
