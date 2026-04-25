import {
  buildPromptResponseFixPrompt,
  extractPromptResponseIssueCandidates,
  hasPromptResponseIssueCandidates,
  NO_ACTIONABLE_PROMPT_RESPONSE_ISSUES_MESSAGE,
} from '../../src/tui/prompt_response_fix';

describe('prompt_response_fix helpers', () => {
  it('extracts concrete issue bullets from the response', () => {
    const response = [
      'Recommendations:',
      '1. Fix retry handling in src/lib/pipeline.ts to avoid duplicate runs.',
      '2. Update README.md keyboard map so the new binding is documented.',
      'Nice work overall.',
    ].join('\n');

    expect(extractPromptResponseIssueCandidates(response)).toEqual([
      '1. Fix retry handling in src/lib/pipeline.ts to avoid duplicate runs.',
      '2. Update README.md keyboard map so the new binding is documented.',
    ]);
    expect(hasPromptResponseIssueCandidates(response)).toBe(true);
  });

  it('treats explicit no-issues responses as non-actionable', () => {
    const response = 'No actionable issues found. No changes needed.';

    expect(extractPromptResponseIssueCandidates(response)).toEqual([]);
    expect(hasPromptResponseIssueCandidates(response)).toBe(false);
    expect(NO_ACTIONABLE_PROMPT_RESPONSE_ISSUES_MESSAGE).toContain('No actionable issues');
  });

  it('anchors the generated Copilot prompt to the prompt log and constraints', () => {
    const prompt = buildPromptResponseFixPrompt(
      '/tmp/run/prompts/step_04/reviewer.md',
      '1. Remove the stale reference to src/old.ts.\n2. Fix the missing help text in README.md.',
    );

    expect(prompt).toContain('fix-prompt-response-issues skill');
    expect(prompt).toContain('/tmp/run/prompts/step_04/reviewer.md');
    expect(prompt).toContain('current working directory');
    expect(prompt).toContain('Treat concrete performance, startup, bundle-size, eager-loading');
    expect(prompt).toContain('No actionable issues found in prompt response.');
    expect(prompt).toContain('Remove the stale reference to src/old.ts.');
  });

  it('detects actionable issues in prompt-log responses with markdown section headings', () => {
    const response = [
      '**Documentation Consistency Analysis — Partition 1 of 3**',
      '',
      '## 1. Cross-Reference Validation (Broken Links)',
      '',
      '### Reference: README.md:127 → ./docs/api/README.md',
      '- **Status**: Truly Broken',
      '- **Root Cause**: `docs/api/README.md` is referenced but not present.',
      '- **Recommended Fix**: Create `docs/api/README.md` or update the reference.',
      '- **Priority**: Critical — Main README; API docs are essential.',
    ].join('\n');

    const candidates = extractPromptResponseIssueCandidates(response);
    expect(candidates).toEqual([
      '- **Status**: Truly Broken',
      '- **Root Cause**: `docs/api/README.md` is referenced but not present.',
      '- **Recommended Fix**: Create `docs/api/README.md` or update the reference.',
    ]);
    expect(hasPromptResponseIssueCandidates(response)).toBe(true);
  });

  it('keeps concrete performance finding metadata so the fix skill gets enough context', () => {
    const response = [
      '### Findings',
      '',
      '#### 1. Eager Re-Export of Many Modules (Potential Startup/Bundle Impact)',
      '- **File:** `src/index.js` (parts 1/6, 2/6)',
      '- **Issue Type:** Eager re-export of many modules and functions',
      '- **Severity:** Medium',
      '- **Impact:** This file re-exports a large number of modules and functions at the top level. This can increase initial load time and bundle size.',
      '- **Optimization Example:** Use dynamic imports or split exports into smaller entry points (e.g., `export * from \'./lib/feature.js\'`) so consumers can import only what they need.',
    ].join('\n');

    expect(extractPromptResponseIssueCandidates(response)).toEqual([
      '- **File:** `src/index.js` (parts 1/6, 2/6)',
      '- **Issue Type:** Eager re-export of many modules and functions',
      '- **Severity:** Medium',
      '- **Impact:** This file re-exports a large number of modules and functions at the top level. This can increase initial load time and bundle size.',
      '- **Optimization Example:** Use dynamic imports or split exports into smaller entry points (e.g., `export * from \'./lib/feature.js\'`) so consumers can import only what they need.',
    ]);
    expect(hasPromptResponseIssueCandidates(response)).toBe(true);
  });
});
