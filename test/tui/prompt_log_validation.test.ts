import { buildPromptLogValidationPrompt } from '../../src/tui/prompt_log_validation';

describe('buildPromptLogValidationPrompt', () => {
  it('anchors validation to the selected log path', () => {
    const prompt = buildPromptLogValidationPrompt('/tmp/run/prompts/step_04/prompt.md');

    expect(prompt).toContain('/tmp/run/prompts/step_04/prompt.md');
    expect(prompt).toContain("actual codebase");
  });

  it('treats later live-repo version bumps as historical context, not automatic mismatches', () => {
    const prompt = buildPromptLogValidationPrompt('/tmp/prompt.md');

    expect(prompt).toContain('historical artifact');
    expect(prompt).toContain('later version bump in the live repository is not, by itself, a mismatch');
    expect(prompt).toContain('contemporaneous artifacts');
  });

  it('requires evidence-based findings for partial or out-of-scope inputs', () => {
    const prompt = buildPromptLogValidationPrompt('/tmp/prompt.md');

    expect(prompt).toContain('truncated or partial evidence');
    expect(prompt).toContain('outside the provided scope');
    expect(prompt).toContain('unavailable or inconclusive');
    expect(prompt).toContain('Cite the log lines and current project files');
  });
});
