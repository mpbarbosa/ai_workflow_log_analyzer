import * as aiClient from './ai_client';
import type { LlmRequest, LlmResponse, StreamChunk } from './copilot_client.js';

jest.mock('./copilot_client.js', () => ({
  analyzeWithLLM: jest.fn(),
  analyzePromptQuality: jest.fn(),
  summarizeReport: jest.fn(),
  streamLLM: jest.fn(),
  analyzePromptPartVsCodebase: jest.fn(),
  analyzePromptPartWithReversePrompting: jest.fn(),
  analyzeWholePromptWithReversePrompting: jest.fn(),
}));

jest.mock('./claude_client.js', () => ({
  analyzeWithLLM: jest.fn(),
  analyzePromptQuality: jest.fn(),
  summarizeReport: jest.fn(),
  streamLLM: jest.fn(),
  analyzePromptPartVsCodebase: jest.fn(),
  analyzePromptPartWithReversePrompting: jest.fn(),
  analyzeWholePromptWithReversePrompting: jest.fn(),
}));

const copilotClient = require('./copilot_client.js');
const claudeClient = require('./claude_client.js');

describe('ai_client', () => {
  beforeEach(() => {
    aiClient.setProvider('copilot');
    jest.clearAllMocks();
  });

  describe('setProvider and getProvider', () => {
    it('should default to copilot', () => {
      expect(aiClient.getProvider()).toBe('copilot');
    });

    it('should set and get provider', () => {
      aiClient.setProvider('claude');
      expect(aiClient.getProvider()).toBe('claude');
      aiClient.setProvider('copilot');
      expect(aiClient.getProvider()).toBe('copilot');
    });
  });

  describe('analyzeWithLLM', () => {
    const req: LlmRequest = { prompt: 'test' } as any;
    const res: LlmResponse = { result: 'ok' } as any;

    it('delegates to copilot by default', async () => {
      (copilotClient.analyzeWithLLM as jest.Mock).mockResolvedValue(res);
      const result = await aiClient.analyzeWithLLM(req);
      expect(copilotClient.analyzeWithLLM).toHaveBeenCalledWith(req);
      expect(result).toBe(res);
    });

    it('delegates to claude when provider is claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.analyzeWithLLM as jest.Mock).mockResolvedValue(res);
      const result = await aiClient.analyzeWithLLM(req);
      expect(claudeClient.analyzeWithLLM).toHaveBeenCalledWith(req);
      expect(result).toBe(res);
    });

    it('propagates errors from provider', async () => {
      (copilotClient.analyzeWithLLM as jest.Mock).mockRejectedValue(new Error('fail'));
      await expect(aiClient.analyzeWithLLM(req)).rejects.toThrow('fail');
    });
  });

  describe('analyzePromptQuality', () => {
    const persona = 'dev';
    const model = 'gpt';
    const prompt = 'foo';
    const response = 'bar';
    const result = { score: 1, feedback: 'good', suggestions: ['a'] };

    it('delegates to copilot', async () => {
      (copilotClient.analyzePromptQuality as jest.Mock).mockResolvedValue(result);
      const res = await aiClient.analyzePromptQuality(persona, model, prompt, response);
      expect(copilotClient.analyzePromptQuality).toHaveBeenCalledWith(persona, model, prompt, response);
      expect(res).toBe(result);
    });

    it('delegates to claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.analyzePromptQuality as jest.Mock).mockResolvedValue(result);
      const res = await aiClient.analyzePromptQuality(persona, model, prompt, response);
      expect(claudeClient.analyzePromptQuality).toHaveBeenCalledWith(persona, model, prompt, response);
      expect(res).toBe(result);
    });

    it('propagates errors', async () => {
      (copilotClient.analyzePromptQuality as jest.Mock).mockRejectedValue(new Error('bad'));
      await expect(aiClient.analyzePromptQuality(persona, model, prompt, response)).rejects.toThrow('bad');
    });
  });

  describe('summarizeReport', () => {
    const report = '{"foo":"bar"}';
    it('delegates to copilot', async () => {
      (copilotClient.summarizeReport as jest.Mock).mockResolvedValue('summary');
      const res = await aiClient.summarizeReport(report);
      expect(copilotClient.summarizeReport).toHaveBeenCalledWith(report);
      expect(res).toBe('summary');
    });

    it('delegates to claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.summarizeReport as jest.Mock).mockResolvedValue('summary');
      const res = await aiClient.summarizeReport(report);
      expect(claudeClient.summarizeReport).toHaveBeenCalledWith(report);
      expect(res).toBe('summary');
    });

    it('propagates errors', async () => {
      (copilotClient.summarizeReport as jest.Mock).mockRejectedValue(new Error('fail'));
      await expect(aiClient.summarizeReport(report)).rejects.toThrow('fail');
    });
  });

  describe('streamLLM', () => {
    const req: LlmRequest = { prompt: 'stream' } as any;
    const chunk: StreamChunk = { text: 'a' } as any;

    it('yields chunks from copilot', async () => {
      (copilotClient.streamLLM as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
        yield { text: 'b' };
      })());
      const results = [];
      for await (const c of aiClient.streamLLM(req)) results.push(c);
      expect(results).toEqual([chunk, { text: 'b' }]);
    });

    it('yields chunks from claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.streamLLM as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.streamLLM(req)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('propagates errors', async () => {
      (copilotClient.streamLLM as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
      await expect((async () => { for await (const _ of aiClient.streamLLM(req)) {}})()).rejects.toThrow('fail');
    });
  });

  describe('analyzePromptPartVsCodebase', () => {
    const label = 'lbl';
    const lines = ['a', 'b'];
    const projectRoot = '/root';
    const chunk: StreamChunk = { text: 'x' } as any;

    it('yields from copilot', async () => {
      (copilotClient.analyzePromptPartVsCodebase as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.analyzePromptPartVsCodebase(label, lines, projectRoot)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('yields from claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.analyzePromptPartVsCodebase as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.analyzePromptPartVsCodebase(label, lines, projectRoot)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('propagates errors', async () => {
      (copilotClient.analyzePromptPartVsCodebase as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
      await expect((async () => { for await (const _ of aiClient.analyzePromptPartVsCodebase(label, lines, projectRoot)) {}})()).rejects.toThrow('fail');
    });
  });

  describe('analyzePromptPartWithReversePrompting', () => {
    const label = 'lbl';
    const lines = ['a', 'b'];
    const chunk: StreamChunk = { text: 'y' } as any;

    it('yields from copilot', async () => {
      (copilotClient.analyzePromptPartWithReversePrompting as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.analyzePromptPartWithReversePrompting(label, lines)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('yields from claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.analyzePromptPartWithReversePrompting as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.analyzePromptPartWithReversePrompting(label, lines)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('propagates errors', async () => {
      (copilotClient.analyzePromptPartWithReversePrompting as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
      await expect((async () => { for await (const _ of aiClient.analyzePromptPartWithReversePrompting(label, lines)) {}})()).rejects.toThrow('fail');
    });
  });

  describe('analyzeWholePromptWithReversePrompting', () => {
    const lines = ['a', 'b'];
    const chunk: StreamChunk = { text: 'z' } as any;

    it('yields from copilot', async () => {
      (copilotClient.analyzeWholePromptWithReversePrompting as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.analyzeWholePromptWithReversePrompting(lines)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('yields from claude', async () => {
      aiClient.setProvider('claude');
      (claudeClient.analyzeWholePromptWithReversePrompting as jest.Mock).mockReturnValue((async function* () {
        yield chunk;
      })());
      const results = [];
      for await (const c of aiClient.analyzeWholePromptWithReversePrompting(lines)) results.push(c);
      expect(results).toEqual([chunk]);
    });

    it('propagates errors', async () => {
      (copilotClient.analyzeWholePromptWithReversePrompting as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
      await expect((async () => { for await (const _ of aiClient.analyzeWholePromptWithReversePrompting(lines)) {}})()).rejects.toThrow('fail');
    });
  });
});
