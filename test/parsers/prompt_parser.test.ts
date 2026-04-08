import { parsePromptFileContent, parseRunPrompts, parsePromptParts } from '../../src/parsers/prompt_parser.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/sample_run');

describe('parsePromptFileContent', () => {
  const sample = `# Prompt Log

**Timestamp:** 2026-03-27T01:42:21.069Z
**Persona:** architecture_reviewer
**Model:** gpt-4.1

## Prompt

\`\`\`
This is the prompt text.
\`\`\`

## Response

\`\`\`
This is the response text.
\`\`\`
`;

  it('extracts persona and model', () => {
    const result = parsePromptFileContent(sample);
    expect(result).not.toBeNull();
    expect(result?.persona).toBe('architecture_reviewer');
    expect(result?.model).toBe('gpt-4.1');
  });

  it('extracts prompt and response text', () => {
    const result = parsePromptFileContent(sample);
    expect(result?.prompt).toBe('This is the prompt text.');
    expect(result?.response).toBe('This is the response text.');
  });

  it('returns null for malformed content', () => {
    expect(parsePromptFileContent('no metadata here')).toBeNull();
  });

  it('correctly extracts prompt when embedded file content contains ## headings', () => {
    // Regression: the ## Prompt section regex previously stopped at the first \n##
    // encountered inside the code fence (e.g. ## [0.2.0] in an embedded CHANGELOG).
    // This left the opening ``` fence as the sole extracted content, causing
    // parsePromptParts to emit a spurious one-line Preamble with value "```".
    const withNestedHeadings = `# Prompt Log

**Timestamp:** 2026-03-30T14:52:52.917Z
**Persona:** documentation_expert
**Model:** gpt-4.1

## Prompt

\`\`\`
**Role**: You are a senior technical documentation specialist.

**Task**: Update the changelog.

**File Contents**:
### \`CHANGELOG.md\`
\`\`\`md
# Changelog

## [0.2.0] - 2026-03-27
### Added
- New feature
\`\`\`
\`\`\`

## Response

\`\`\`
No changes needed.
\`\`\`
`;

    const result = parsePromptFileContent(withNestedHeadings);
    expect(result).not.toBeNull();

    // Prompt must not start with a backtick fence
    expect(result!.prompt).not.toMatch(/^```/);
    expect(result!.prompt).toMatch(/^\*\*Role\*\*/);

    // parsePromptParts must not produce a Preamble containing only a fence character
    const parts = parsePromptParts(result!.prompt);
    const preamble = parts.find((p) => p.label === 'Preamble');
    expect(preamble).toBeUndefined();
  });
});

describe('parseRunPrompts', () => {
  it('returns prompt records from fixture run', async () => {
    const records = await parseRunPrompts(FIXTURE_DIR);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toMatchObject({
      stepId: 'step_05',
      persona: 'architecture_reviewer',
      model: 'gpt-4.1',
    });
  });

  it('returns empty array when prompts dir does not exist', async () => {
    const records = await parseRunPrompts('/nonexistent/path');
    expect(records).toEqual([]);
  });
});

describe('parsePromptParts', () => {
  it('splits a simple structured prompt into named parts', () => {
    const prompt = `**Role**: Senior engineer.\n\n**Task**: Validate configs.\n\n**Approach**: Be thorough.`;
    const parts = parsePromptParts(prompt);
    expect(parts.map((p) => p.label)).toEqual(['Role', 'Task', 'Approach']);
  });

  it('ignores bold-colon patterns inside a fenced code block', () => {
    const prompt = [
      '**Role**: Code reviewer.',
      '',
      '**Task**: Review the file below.',
      '',
      '```markdown',
      '**Output Format:** This is inside a fence and must not create a section.',
      '**Project Context:** Same here.',
      '```',
      '',
      '**Approach**: Be thorough.',
    ].join('\n');
    const parts = parsePromptParts(prompt);
    const labels = parts.map((p) => p.label);
    expect(labels).toContain('Role');
    expect(labels).toContain('Task');
    expect(labels).toContain('Approach');
    expect(labels).not.toContain('Output Format');
    expect(labels).not.toContain('Project Context');
  });

  it('resumes section detection after the closing fence', () => {
    const prompt = [
      '**Role**: Developer.',
      '',
      '**Task**: See file.',
      '```',
      '**Inside**: inside fence',
      '```',
      '**Approach**: After fence.',
    ].join('\n');
    const parts = parsePromptParts(prompt);
    const labels = parts.map((p) => p.label);
    expect(labels).toContain('Approach');
    expect(labels).not.toContain('Inside');
  });

  it('does NOT create sections from ### sub-headings', () => {
    const prompt = [
      '**Role**: Validator.',
      '',
      '**Task**: Check config files.',
      '### Configuration Files in Scope',
      '- file1.json',
      '- file2.yaml',
      '### Validation Tasks',
      '- Check schema',
    ].join('\n');
    const parts = parsePromptParts(prompt);
    const labels = parts.map((p) => p.label);
    expect(labels).not.toContain('Configuration Files in Scope');
    expect(labels).not.toContain('Validation Tasks');
    // ### content stays in the Task section body
    const taskPart = parts.find((p) => p.label === 'Task');
    expect(taskPart?.lines.join('\n')).toContain('Configuration Files in Scope');
    expect(taskPart?.lines.join('\n')).toContain('Validation Tasks');
  });

  it('fenced content with bold-colon lines is included in preceding section body', () => {
    const prompt = [
      '**Task**: Validate the following.',
      '```yaml',
      '**key**: value',
      '```',
    ].join('\n');
    const parts = parsePromptParts(prompt);
    const taskPart = parts.find((p) => p.label === 'Task');
    expect(taskPart).toBeDefined();
    const body = taskPart!.lines.join('\n');
    expect(body).toContain('**key**: value');
  });

  it('handles multiple fenced blocks in the same section', () => {
    const prompt = [
      '**Role**: Specialist.',
      '**Task**: Review two files.',
      '```',
      '**bold-colon-in-fence-1:**',
      '```',
      'Middle text.',
      '```',
      '**bold-colon-in-fence-2:**',
      '```',
      '**Approach**: Done.',
    ].join('\n');
    const parts = parsePromptParts(prompt);
    const labels = parts.map((p) => p.label);
    expect(labels).not.toContain('bold-colon-in-fence-1');
    expect(labels).not.toContain('bold-colon-in-fence-2');
    expect(labels).toContain('Approach');
  });
});
