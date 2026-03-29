/**
 * Copilot SDK Client — typed wrapper around @github/copilot-sdk for analysis calls.
 * Supports one-shot requests and streaming responses.
 * @module lib/copilot_client
 */

import { CopilotClient, approveAll } from '@github/copilot-sdk';

export interface LlmRequest {
  prompt: string;
  model?: string;
  /** System message prepended before the user prompt */
  systemMessage?: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  latencyMs: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

// ─── One-shot request ─────────────────────────────────────────────────────────

/**
 * Sends a single prompt to the Copilot SDK and returns the full response.
 * Creates and destroys a session per call (safe for parallel analysis).
 */
export async function analyzeWithLLM(req: LlmRequest): Promise<LlmResponse> {
  const client = new CopilotClient();
  await client.start();

  const model = req.model ?? 'gpt-4.1';
  const session = await client.createSession({ model, onPermissionRequest: approveAll });

  let content = '';
  const start = Date.now();

  await new Promise<void>((resolve, reject) => {
    session.on('assistant.message', (e) => {
      content += e.data.content ?? '';
    });
    session.on('session.idle', () => resolve());
    session.on('session.error', (e) => reject(new Error(e.data?.message ?? 'Session error')));

    const fullPrompt = req.systemMessage
      ? `${req.systemMessage}\n\n${req.prompt}`
      : req.prompt;

    session.send({ prompt: fullPrompt }).catch(reject);
  });

  const latencyMs = Date.now() - start;

  await session.destroy();
  await client.stop();

  return { content, model, latencyMs };
}

// ─── Streaming request ────────────────────────────────────────────────────────

/**
 * Streams a Copilot SDK response, yielding chunks as they arrive.
 * Caller is responsible for stopping the client when done.
 */
export async function* streamLLM(
  req: LlmRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const client = new CopilotClient();
  await client.start();

  const model = req.model ?? 'gpt-4.1';
  const session = await client.createSession({ model, onPermissionRequest: approveAll });

  const chunks: StreamChunk[] = [];
  let done = false;
  let error: Error | null = null;

  session.on('assistant.message', (e) => {
    chunks.push({ delta: e.data.content ?? '', done: false });
  });
  session.on('session.idle', () => {
    done = true;
    chunks.push({ delta: '', done: true });
  });
  session.on('session.error', (e) => {
    error = new Error(e.data?.message ?? 'Session error');
    done = true;
  });

  const fullPrompt = req.systemMessage
    ? `${req.systemMessage}\n\n${req.prompt}`
    : req.prompt;

  session.send({ prompt: fullPrompt }).catch((e) => {
    error = e as Error;
    done = true;
  });

  while (!done || chunks.length > 0) {
    if (signal?.aborted) break;
    if (chunks.length > 0) {
      yield chunks.shift()!;
    } else {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  if (error) throw error;

  await session.destroy();
  await client.stop();
}

// ─── Analysis prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT_QUALITY = `You are an expert AI prompt quality analyst.
Evaluate the given prompt and its response from an AI workflow automation system.
Score the prompt quality from 0-100 and provide structured feedback.

Respond in this exact JSON format:
{
  "score": <number 0-100>,
  "feedback": "<1-2 sentence overall assessment>",
  "suggestions": ["<actionable suggestion>", ...]
}`;

export async function analyzePromptQuality(
  persona: string,
  model: string,
  prompt: string,
  response: string
): Promise<{ score: number; feedback: string; suggestions: string[] }> {
  const userPrompt = `**Persona**: ${persona}
**Model**: ${model}

**Prompt**:
${prompt.slice(0, 3000)}

**Response** (first 1500 chars):
${response.slice(0, 1500)}`;

  const result = await analyzeWithLLM({
    prompt: userPrompt,
    systemMessage: SYSTEM_PROMPT_QUALITY,
    model: 'gpt-4.1',
  });

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score: number; feedback: string; suggestions: string[] };
      return {
        score: Math.max(0, Math.min(100, parsed.score ?? 50)),
        feedback: parsed.feedback ?? '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    }
  } catch {
    // fallback
  }

  return { score: 50, feedback: result.content.slice(0, 200), suggestions: [] };
}

const SYSTEM_SUMMARIZE = `You are a technical analysis assistant.
Summarize the analysis report for an AI workflow run concisely (3-5 sentences).
Focus on the most critical issues and actionable recommendations.`;

export async function summarizeReport(reportJson: string): Promise<string> {
  const result = await analyzeWithLLM({
    prompt: reportJson.slice(0, 4000),
    systemMessage: SYSTEM_SUMMARIZE,
    model: 'gpt-4.1',
  });
  return result.content;
}
