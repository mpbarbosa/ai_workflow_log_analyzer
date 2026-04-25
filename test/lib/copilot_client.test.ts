import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockStart = jest.fn(async () => undefined);
const mockStop = jest.fn(async () => undefined);
const mockCreateSession = jest.fn();
const mockApproveAll = jest.fn();

class MockCopilotClient {
  start = mockStart;
  stop = mockStop;
  createSession = mockCreateSession;
}

jest.unstable_mockModule('@github/copilot-sdk', () => ({
  CopilotClient: MockCopilotClient,
  approveAll: mockApproveAll,
}));

const {
  analyzeWithLLM,
  streamLLM,
  analyzePromptQuality,
  summarizeReport,
  analyzePromptPartVsCodebase,
  analyzeWholePromptWithReversePrompting,
} = await import('../../src/lib/copilot_client.js');

interface MockSession extends EventEmitter {
  send: jest.Mock<(...args: unknown[]) => Promise<void>>;
  destroy: jest.Mock<() => Promise<void>>;
}

function createMockSession(): MockSession {
  const session = new EventEmitter() as MockSession;
  session.send = jest.fn(async () => undefined);
  session.destroy = jest.fn(async () => undefined);
  return session;
}

describe('copilot_client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSession.mockReset();
    mockStart.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.useRealTimers();
  });

  describe('analyzeWithLLM', () => {
    it('returns content, model, and latency on success', async () => {
      let sessionRef: MockSession | undefined;
      mockCreateSession.mockImplementationOnce(async ({ model }) => {
        expect(model).toBe('gpt-4.1');
        sessionRef = createMockSession();
        sessionRef.send.mockImplementationOnce(async ({ prompt }) => {
          expect(prompt).toBe('Say hello');
          sessionRef!.emit('assistant.message', { data: { content: 'Hello world' } });
          sessionRef!.emit('session.idle');
        });
        return sessionRef;
      });

      const res = await analyzeWithLLM({ prompt: 'Say hello', model: 'gpt-4.1' });
      expect(res.content).toBe('Hello world');
      expect(res.model).toBe('gpt-4.1');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(sessionRef?.destroy).toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
    });

    it('prepends systemMessage and uses the default model', async () => {
      mockCreateSession.mockImplementationOnce(async ({ model, onPermissionRequest }) => {
        expect(model).toBe('gpt-4.1');
        expect(onPermissionRequest).toBe(mockApproveAll);
        const session = createMockSession();
        session.send.mockImplementationOnce(async ({ prompt }) => {
          expect(prompt).toBe('SYSTEM\n\nUSER');
          session.emit('assistant.message', { data: { content: 'SysMsg' } });
          session.emit('session.idle');
        });
        return session;
      });

      const res = await analyzeWithLLM({ prompt: 'USER', systemMessage: 'SYSTEM' });
      expect(res.content).toBe('SysMsg');
    });

    it('rejects on session.error events', async () => {
      mockCreateSession.mockImplementationOnce(async () => {
        const session = createMockSession();
        session.send.mockImplementationOnce(async () => {
          session.emit('session.error', { data: { message: 'Test error' } });
        });
        return session;
      });

      await expect(analyzeWithLLM({ prompt: 'fail' })).rejects.toThrow('Test error');
    });
  });

  describe('streamLLM', () => {
    function queueChunks(chunks: string[], error?: string) {
      mockCreateSession.mockImplementationOnce(async () => {
        const session = createMockSession();
        session.send.mockImplementationOnce(async () => {
          for (const chunk of chunks) {
            session.emit('assistant.message', { data: { content: chunk } });
          }
          if (error) {
            session.emit('session.error', { data: { message: error } });
          } else {
            session.emit('session.idle');
          }
        });
        return session;
      });
    }

    it('yields chunks and a final done marker', async () => {
      queueChunks(['A', 'B', 'C']);
      const results = [];
      for await (const chunk of streamLLM({ prompt: 'stream' })) {
        results.push(chunk);
      }
      expect(results).toEqual([
        { delta: 'A', done: false },
        { delta: 'B', done: false },
        { delta: 'C', done: false },
        { delta: '', done: true },
      ]);
    });

    it('throws when the session emits an error', async () => {
      queueChunks(['X'], 'Stream error');
      const iter = streamLLM({ prompt: 'fail' });
      await expect(iter.next()).resolves.toEqual({ value: { delta: 'X', done: false }, done: false });
      await expect(iter.next()).rejects.toThrow('Stream error');
    });

    it('stops cleanly when aborted', async () => {
      jest.useFakeTimers();
      mockCreateSession.mockImplementationOnce(async () => {
        const session = createMockSession();
        session.send.mockImplementationOnce(async () => {
          setTimeout(() => {
            session.emit('assistant.message', { data: { content: 'A' } });
            session.emit('assistant.message', { data: { content: 'B' } });
            session.emit('session.idle');
          }, 20);
        });
        return session;
      });

      const controller = new AbortController();
      const iter = streamLLM({ prompt: 'stream' }, controller.signal);
      const first = iter.next();
      await jest.advanceTimersByTimeAsync(20);
      expect(await first).toEqual({ value: { delta: 'A', done: false }, done: false });
      controller.abort();
      expect(await iter.next()).toEqual({ value: undefined, done: true });
    });
  });

  describe('analyzePromptQuality', () => {
    it('parses valid JSON and clamps the score', async () => {
      mockCreateSession.mockImplementationOnce(async () => {
        const session = createMockSession();
        session.send.mockImplementationOnce(async () => {
          session.emit('assistant.message', {
            data: {
              content: '{"score":120,"feedback":"Great prompt.","suggestions":["Be concise"]}',
            },
          });
          session.emit('session.idle');
        });
        return session;
      });

      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res).toEqual({
        score: 100,
        feedback: 'Great prompt.',
        suggestions: ['Be concise'],
      });
    });

    it('returns fallback output for non-JSON responses', async () => {
      mockCreateSession.mockImplementationOnce(async () => {
        const session = createMockSession();
        session.send.mockImplementationOnce(async () => {
          session.emit('assistant.message', { data: { content: 'Not JSON' } });
          session.emit('session.idle');
        });
        return session;
      });

      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res.score).toBe(50);
      expect(res.feedback).toContain('Not JSON');
      expect(res.suggestions).toEqual([]);
    });

    it('normalizes invalid suggestions payloads', async () => {
      mockCreateSession.mockImplementationOnce(async () => {
        const session = createMockSession();
        session.send.mockImplementationOnce(async () => {
          session.emit('assistant.message', {
            data: {
              content: '{"score":80,"feedback":"Ok","suggestions":"Not an array"}',
            },
          });
          session.emit('session.idle');
        });
        return session;
      });

      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res).toEqual({
        score: 80,
        feedback: 'Ok',
        suggestions: [],
      });
    });
  });

  it('summarizeReport returns the LLM content', async () => {
    mockCreateSession.mockImplementationOnce(async () => {
      const session = createMockSession();
      session.send.mockImplementationOnce(async () => {
        session.emit('assistant.message', { data: { content: 'Summary text' } });
        session.emit('session.idle');
      });
      return session;
    });

    await expect(summarizeReport('{"foo":"bar"}')).resolves.toBe('Summary text');
  });

  it('analyzePromptPartVsCodebase streams analysis with codebase context', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'copilot-client-'));
    await mkdir(join(projectRoot, 'src'));
    await writeFile(join(projectRoot, 'README.md'), '# Test Project\n');
    await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const ok = true;\n');

    mockCreateSession.mockImplementationOnce(async ({ model, onPermissionRequest }) => {
      expect(model).toBe('gpt-4.1');
      expect(onPermissionRequest).toBe(mockApproveAll);
      const session = createMockSession();
      session.send.mockImplementationOnce(async ({ prompt }) => {
        expect(prompt).toContain('**SECTION LABEL**: Role');
        expect(prompt).toContain('README.md');
        expect(prompt).toContain('src/index.ts');
        session.emit('assistant.message', { data: { content: 'Chunk1' } });
        session.emit('assistant.message', { data: { content: 'Chunk2' } });
        session.emit('session.idle');
      });
      return session;
    });

    const results = [];
    for await (const chunk of analyzePromptPartVsCodebase('Role', ['Line1', 'Line2'], projectRoot)) {
      results.push(chunk);
    }

    expect(results).toEqual([
      { delta: 'Chunk1', done: false },
      { delta: 'Chunk2', done: false },
      { delta: '', done: true },
    ]);

    await rm(projectRoot, { recursive: true, force: true });
  });

  it('analyzeWholePromptWithReversePrompting streams analysis for the full prompt text', async () => {
    mockCreateSession.mockImplementationOnce(async ({ model, onPermissionRequest }) => {
      expect(model).toBe('gpt-4.1');
      expect(onPermissionRequest).toBe(mockApproveAll);
      const session = createMockSession();
      session.send.mockImplementationOnce(async ({ prompt }) => {
        expect(prompt).toContain('**PROMPT SCOPE**: Whole Prompt');
        expect(prompt).toContain('Role line\nTask line');
        expect(prompt).toContain('multiple coordinated sections');
        session.emit('assistant.message', { data: { content: 'Whole1' } });
        session.emit('assistant.message', { data: { content: 'Whole2' } });
        session.emit('session.idle');
      });
      return session;
    });

    const results = [];
    for await (const chunk of analyzeWholePromptWithReversePrompting(['Role line', 'Task line'])) {
      results.push(chunk);
    }

    expect(results).toEqual([
      { delta: 'Whole1', done: false },
      { delta: 'Whole2', done: false },
      { delta: '', done: true },
    ]);
  });
});
