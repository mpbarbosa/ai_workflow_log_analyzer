import {
  analyzeWithLLM,
  streamLLM,
  analyzePromptQuality,
  summarizeReport,
  analyzePromptPartVsCodebase,
  LlmRequest,
  LlmResponse,
  StreamChunk,
} from '../../src/lib/copilot_client';

import { CopilotClient, approveAll } from '@github/copilot-sdk';

jest.mock('@github/copilot-sdk', () => {
  const EventEmitter = require('events');
  class MockSession extends EventEmitter {
    async send() {}
    async destroy() {}
  }
  class MockCopilotClient {
    async start() {}
    async stop() {}
    async createSession() {
      return new MockSession();
    }
  }
  return {
    CopilotClient: MockCopilotClient,
    approveAll: jest.fn(),
  };
});

describe('copilot_client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeWithLLM', () => {
    it('returns content, model, and latency on success', async () => {
      const sessionEvents: any = {};
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: 'Hello world' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });

      const req: LlmRequest = { prompt: 'Say hello', model: 'gpt-4.1' };
      const res = await analyzeWithLLM(req);
      expect(res.content).toBe('Hello world');
      expect(res.model).toBe('gpt-4.1');
      expect(typeof res.latencyMs).toBe('number');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('uses default model if not provided', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async ({ model }) => {
        expect(model).toBe('gpt-4.1');
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: 'Default model' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const req: LlmRequest = { prompt: 'Test default model' };
      const res = await analyzeWithLLM(req);
      expect(res.content).toBe('Default model');
      expect(res.model).toBe('gpt-4.1');
    });

    it('prepends systemMessage if provided', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(({ prompt }) => {
          expect(prompt.startsWith('SYSTEM\n\nUSER')).toBe(true);
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: 'SysMsg' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const req: LlmRequest = { prompt: 'USER', systemMessage: 'SYSTEM' };
      const res = await analyzeWithLLM(req);
      expect(res.content).toBe('SysMsg');
    });

    it('rejects on session.error event', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('session.error', { data: { message: 'Test error' } });
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const req: LlmRequest = { prompt: 'fail' };
      await expect(analyzeWithLLM(req)).rejects.toThrow('Test error');
    });

    it('handles session.error with missing message', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('session.error', { data: {} });
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const req: LlmRequest = { prompt: 'fail' };
      await expect(analyzeWithLLM(req)).rejects.toThrow('Session error');
    });
  });

  describe('streamLLM', () => {
    function makeSessionWithChunks(chunks: string[], error?: string) {
      return async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            for (const c of chunks) {
              s.emit('assistant.message', { data: { content: c } });
            }
            if (error) {
              s.emit('session.error', { data: { message: error } });
            } else {
              s.emit('session.idle');
            }
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      };
    }

    it('yields chunks and done=true at end', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(
        makeSessionWithChunks(['A', 'B', 'C'])
      );
      const req: LlmRequest = { prompt: 'stream' };
      const results: StreamChunk[] = [];
      for await (const chunk of streamLLM(req)) {
        results.push(chunk);
      }
      expect(results).toEqual([
        { delta: 'A', done: false },
        { delta: 'B', done: false },
        { delta: 'C', done: false },
        { delta: '', done: true },
      ]);
    });

    it('throws error if session.error occurs', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(
        makeSessionWithChunks(['X'], 'Stream error')
      );
      const req: LlmRequest = { prompt: 'fail' };
      const iter = streamLLM(req);
      const first = await iter.next();
      expect(first.value).toEqual({ delta: 'X', done: false });
      await expect(iter.next()).rejects.toThrow('Stream error');
    });

    it('aborts if signal is aborted', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(
        makeSessionWithChunks(['A', 'B', 'C'])
      );
      const req: LlmRequest = { prompt: 'stream' };
      const controller = new AbortController();
      const results: StreamChunk[] = [];
      const iter = streamLLM(req, controller.signal);
      const first = await iter.next();
      results.push(first.value);
      controller.abort();
      const next = await iter.next();
      expect(next.done).toBe(true);
      expect(results[0]).toEqual({ delta: 'A', done: false });
    });

    it('handles empty response', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(
        makeSessionWithChunks([])
      );
      const req: LlmRequest = { prompt: 'empty' };
      const results: StreamChunk[] = [];
      for await (const chunk of streamLLM(req)) {
        results.push(chunk);
      }
      expect(results).toEqual([{ delta: '', done: true }]);
    });
  });

  describe('analyzePromptQuality', () => {
    it('parses valid JSON response and clamps score', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', {
              data: {
                content: `{
                  "score": 120,
                  "feedback": "Great prompt.",
                  "suggestions": ["Be concise"]
                }`,
              },
            });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res.score).toBe(100);
      expect(res.feedback).toBe('Great prompt.');
      expect(res.suggestions).toEqual(['Be concise']);
    });

    it('returns fallback if JSON parse fails', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: 'Not JSON' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res.score).toBe(50);
      expect(res.feedback).toContain('Not JSON');
      expect(res.suggestions).toEqual([]);
    });

    it('handles missing fields in JSON', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: '{}' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res.score).toBe(0);
      expect(res.feedback).toBe('');
      expect(res.suggestions).toEqual([]);
    });

    it('handles suggestions not being an array', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', {
              data: {
                content: `{
                  "score": 80,
                  "feedback": "Ok",
                  "suggestions": "Not an array"
                }`,
              },
            });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const res = await analyzePromptQuality('persona', 'gpt-4.1', 'prompt', 'response');
      expect(res.score).toBe(80);
      expect(res.feedback).toBe('Ok');
      expect(res.suggestions).toEqual([]);
    });
  });

  describe('summarizeReport', () => {
    it('returns the content from analyzeWithLLM', async () => {
      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: 'Summary text' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });
      const res = await summarizeReport('{"foo":"bar"}');
      expect(res).toBe('Summary text');
    });
  });

  describe('analyzePromptPartVsCodebase', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('streams LLM analysis with codebase context', async () => {
      // Patch readCodebaseContext to return fake context
      jest.doMock('../../src/lib/copilot_client', () => {
        const original = jest.requireActual('../../src/lib/copilot_client');
        return {
          ...original,
          __esModule: true,
          readCodebaseContext: jest.fn().mockResolvedValue('// codebase context'),
        };
      });

      (CopilotClient.prototype.createSession as jest.Mock).mockImplementation(async () => {
        const EventEmitter = require('events');
        const s = new EventEmitter();
        s.send = jest.fn().mockImplementation(() => {
          setTimeout(() => {
            s.emit('assistant.message', { data: { content: 'Chunk1' } });
            s.emit('assistant.message', { data: { content: 'Chunk2' } });
            s.emit('session.idle');
          }, 5);
          return Promise.resolve();
        });
        s.destroy = jest.fn();
        return s;
      });

      // Patch readCodebaseContext in the module scope
      const { analyzePromptPartVsCodebase } = require('../../src/lib/copilot_client');
      const results: StreamChunk[] = [];
      for await (const chunk of analyzePromptPartVsCodebase('Role', ['Line1', 'Line2'], '/fake/project')) {
        results.push(chunk);
      }
      expect(results).toEqual([
        { delta: 'Chunk1', done: false },
        { delta: 'Chunk2', done: false },
        { delta: '', done: true },
      ]);
    });
  });
});
