import { parsePromptFileContent, parseRunPrompts } from '../../src/parsers/prompt_parser.js';
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
