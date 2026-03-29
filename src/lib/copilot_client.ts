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

// ─── Prompt part vs codebase analysis ────────────────────────────────────────

const SYSTEM_ANALYZE_PART = `You are a senior code reviewer and prompt engineer analyzing whether a specific section of an AI workflow prompt is well-aligned with the actual project codebase.

You will be given:
1. SECTION LABEL — the name of the prompt section being analyzed
2. SECTION CONTENT — the raw text of that section
3. CODEBASE CONTEXT — relevant source files from the project

Your task:
- Assess whether the section's claims, instructions, and context accurately reflect the real codebase
- Identify any gaps, outdated references, incorrect assumptions, or missing context
- Rate the alignment on a scale of 1–10 (10 = perfectly aligned)
- Provide specific, actionable suggestions for improving this prompt section

Output format (markdown):
## Alignment Score: N/10

## Summary
One-paragraph assessment of how well this section aligns with the codebase.

## Findings
- Finding 1 (with file/line reference if applicable)
- Finding 2

## Suggestions
1. Specific improvement to the prompt section
2. ...`;

/**
 * Reads TypeScript source files from the project for codebase context.
 * Returns a concatenated string capped at maxChars.
 */
async function readCodebaseContext(projectRoot: string, maxChars = 3000): Promise<string> {
  const { readdir, readFile, stat } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const collect = async (dir: string, files: string[]): Promise<void> => {
    let entries: string[];
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
      const full = join(dir, e);
      const s = await stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) await collect(full, files);
      else if (e.endsWith('.ts') && !e.endsWith('.d.ts')) files.push(full);
    }
  };

  const files: string[] = [];
  await collect(join(projectRoot, 'src'), files);

  let context = '';
  for (const f of files) {
    if (context.length >= maxChars) break;
    const rel = f.replace(projectRoot + '/', '');
    let text: string;
    try { text = await readFile(f, 'utf8'); } catch { continue; }
    const snippet = text.slice(0, Math.max(0, maxChars - context.length - rel.length - 10));
    context += `\n// --- ${rel} ---\n${snippet}`;
  }

  return context.trim();
}

/**
 * Streams an analysis of the given prompt part against the project codebase.
 * Implements the analyze-prompt-part skill defined in
 * .github/skills/analyze-prompt-part/SKILL.md.
 *
 * @param label      - Section label (e.g. "Role", "Task")
 * @param lines      - Raw content lines of the section
 * @param projectRoot - Root of the project being analyzed
 * @param signal     - Optional AbortSignal to cancel mid-stream
 */
export async function* analyzePromptPartVsCodebase(
  label: string,
  lines: string[],
  projectRoot: string,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const codebaseContext = await readCodebaseContext(projectRoot);
  const sectionContent = lines.join('\n').trim();

  const userPrompt = `**SECTION LABEL**: ${label}

**SECTION CONTENT**:
${sectionContent.slice(0, 2000)}

**CODEBASE CONTEXT** (src/**/*.ts, truncated):
\`\`\`typescript
${codebaseContext}
\`\`\``;

  yield* streamLLM(
    { prompt: userPrompt, systemMessage: SYSTEM_ANALYZE_PART, model: 'gpt-4.1' },
    signal
  );
}
