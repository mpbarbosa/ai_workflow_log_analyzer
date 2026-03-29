import { parseLine, parseRunLogsToArray } from '../../src/parsers/log_parser.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/sample_run');

describe('parseLine', () => {
  it('parses a step_complete event', () => {
    const raw = '[2026-03-27T01:41:18.715Z] ✓ Step step_00 completed in 33ms';
    const event = parseLine(raw);
    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      kind: 'step_complete',
      stepId: 'step_00',
      durationMs: 33,
    });
  });

  it('parses an AI call start event', () => {
    const raw = '[2026-03-27T01:42:21.057Z] [AI] SDK call starting — persona: architecture_reviewer, model: gpt-4.1, prompt_chars: 4092';
    const event = parseLine(raw);
    expect(event).toMatchObject({
      kind: 'ai_call_start',
      persona: 'architecture_reviewer',
      model: 'gpt-4.1',
      promptChars: 4092,
    });
  });

  it('parses an AI call complete event with latency', () => {
    const raw = '[2026-03-27T01:42:35.288Z] [AI] SDK call completed — persona: architecture_reviewer, model: gpt-4.1, response_chars: 6589, latency: 35504ms';
    const event = parseLine(raw);
    expect(event).toMatchObject({
      kind: 'ai_call_complete',
      latencyMs: 35504,
      responseChars: 6589,
    });
  });

  it('parses a critical performance event', () => {
    const raw = "[2026-03-27T01:42:35.310Z] ✗ [CRITICAL] Operation 'step_05' took 51.8s (memory: 97.77MB)";
    const event = parseLine(raw);
    expect(event).toMatchObject({
      kind: 'performance',
      stepId: 'step_05',
      isCritical: true,
      memoryMb: 97.77,
    });
  });

  it('parses a retry event', () => {
    const raw = '[2026-03-27T01:42:21.081Z] [DEBUG] Executing AI request (attempt 2/3)';
    const event = parseLine(raw, 'step_05');
    expect(event).toMatchObject({
      kind: 'retry',
      attempt: 2,
      maxAttempts: 3,
      stepId: 'step_05',
    });
  });

  it('returns null for lines without timestamp', () => {
    const event = parseLine('no timestamp here');
    expect(event).toBeNull();
  });
});

describe('parseRunLogsToArray', () => {
  it('parses all log events from fixture run directory', async () => {
    const events = await parseRunLogsToArray(FIXTURE_DIR);
    expect(events.length).toBeGreaterThan(5);
    const stepComplete = events.find((e) => 'kind' in e && e.kind === 'step_complete');
    expect(stepComplete).toBeDefined();
  });

  it('includes events from step-specific log files', async () => {
    const events = await parseRunLogsToArray(FIXTURE_DIR);
    const criticalEvent = events.find((e) => 'kind' in e && e.kind === 'performance' && (e as any).isCritical);
    expect(criticalEvent).toBeDefined();
  });
});
