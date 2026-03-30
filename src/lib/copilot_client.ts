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

**Scope**: You have been given ONLY the prompt text (capped at 3 000 chars) and the first
1 500 chars of the response. Do NOT infer what the full response contains beyond what is
shown. If truncation makes a quality dimension unassessable, reflect that uncertainty in
your feedback rather than speculating about omitted content.

Respond in this exact JSON format:
{
  "score": <number 0-100>,
  "feedback": "<1-2 sentence overall assessment>",
  "suggestions": ["<actionable suggestion>", ...]
}`;

/**
 * Scores the quality of a single prompt/response pair using an LLM judge.
 * @param persona - Persona name associated with the prompt
 * @param model - Model ID used for the AI call
 * @param prompt - The prompt text sent to the model
 * @param response - The model's response text
 * @returns Score (0–100), feedback sentence, and actionable suggestions
 */
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
Focus on the most critical issues and actionable recommendations.

**Scope**: You have been given ONLY the JSON analysis data provided. Do NOT invent
findings, issue counts, or recommendations not present in the data. If the data reports
no critical issues, do not fabricate urgency. When in doubt, silence is preferable to
speculation.`;

/**
 * Produces a concise executive summary of an analysis report using an LLM.
 * @param reportJson - JSON-serialised {@link AnalysisReport}
 * @returns 3–5 sentence plain-text summary focusing on critical issues
 */
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
2. SECTION CONTENT — the raw text of that section (capped at 2 000 chars)
3. CODEBASE CONTEXT — a truncated snapshot of project source and documentation files

**Identify your section type FIRST, then apply the matching rule exclusively.**

---

> **IMPORTANT — Role / Persona / Preamble sections (read this before anything else):**
>
> If SECTION LABEL is "Role", "Persona", or "Preamble", apply ONLY the rule below and
> ignore all other rules in this block.
>
> A Role section defines WHO performs the task, not what the project's source code does.
> The CODEBASE CONTEXT is provided for reference only — **do NOT use it to assess whether
> a role is appropriate.** Evaluate the role solely against the TASK stated within the
> same prompt section.
>
> A role is well-aligned when its stated expertise is relevant to its stated task.
> A role is misaligned only when it directly contradicts the stated task (e.g. a
> "database administrator" assigned to write CSS) or claims skills entirely irrelevant
> to that task.
>
> **Do NOT deduct points because the source code does not implement the role's domain.**
> A documentation specialist reviewing markdown files is perfectly aligned even if the
> project's TypeScript source contains zero documentation logic.
>
> ❌ Incorrect reasoning (do not do this):
>   "The role describes a documentation specialist, but the codebase context shows
>    bug_analyzer.ts with no documentation logic → alignment is weak."
>
> ✅ Correct reasoning:
>   "The role describes a documentation specialist. The stated task is to review markdown
>    documentation files. The expertise matches the task → well-aligned."

---

- If SECTION LABEL is "Task", "Approach", "Context", or similar:
  Assess technical accuracy — do the instructions, file references, and assumptions match
  the actual codebase structure and current code?

- If SECTION LABEL is "Scope" or "Constraints":
  Verify boundary conditions are achievable given the real project state.

---

**Scope**: You have been given ONLY the section text and the truncated codebase snapshot.
Do NOT assert facts about the codebase that are not explicitly visible in the provided
CODEBASE CONTEXT. The snapshot is truncated — absence of a symbol or file does not mean
it does not exist in the real codebase. When the evidence is insufficient to verify a
claim, note it explicitly rather than speculating. When in doubt, silence is preferable
to speculation.

Your task:
- Identify your section type and apply its rule exclusively
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
 * Reads project source and documentation files for codebase context.
 * Includes root-level markdown docs (README, CONTRIBUTING, ARCHITECTURE,
 * FUNCTIONAL_REQUIREMENTS) and TypeScript source files from src/.
 * Returns a concatenated string split across a docs budget and a code budget.
 */
async function readCodebaseContext(projectRoot: string, maxChars = 4000): Promise<string> {
  const { readFile, stat } = await import('node:fs/promises');
  const { join } = await import('node:path');

  // Root-level markdown docs that provide project standards and audience context
  const DOC_FILES = [
    'CONTRIBUTING.md',
    'README.md',
    'ARCHITECTURE.md',
    'FUNCTIONAL_REQUIREMENTS.md',
  ];

  const collectSrc = async (dir: string, files: string[]): Promise<void> => {
    const { readdir } = await import('node:fs/promises');
    let entries: string[];
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
      const full = join(dir, e);
      const s = await stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) await collectSrc(full, files);
      else if (e.endsWith('.ts') && !e.endsWith('.d.ts')) files.push(full);
    }
  };

  // Docs get up to 40% of the budget; source gets the rest
  const docsBudget = Math.floor(maxChars * 0.4);
  const srcBudget = maxChars - docsBudget;

  let docsContext = '';
  for (const name of DOC_FILES) {
    if (docsContext.length >= docsBudget) break;
    const full = join(projectRoot, name);
    let text: string;
    try { text = await readFile(full, 'utf8'); } catch { continue; }
    const snippet = text.slice(0, Math.max(0, docsBudget - docsContext.length - name.length - 10));
    docsContext += `\n<!-- --- ${name} --- -->\n${snippet}`;
  }

  const srcFiles: string[] = [];
  await collectSrc(join(projectRoot, 'src'), srcFiles);

  let srcContext = '';
  for (const f of srcFiles) {
    if (srcContext.length >= srcBudget) break;
    const rel = f.replace(projectRoot + '/', '');
    let text: string;
    try { text = await readFile(f, 'utf8'); } catch { continue; }
    const snippet = text.slice(0, Math.max(0, srcBudget - srcContext.length - rel.length - 10));
    srcContext += `\n// --- ${rel} ---\n${snippet}`;
  }

  return [docsContext.trim(), srcContext.trim()].filter(Boolean).join('\n\n');
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

**CODEBASE CONTEXT** (root docs + src/**/*.ts, truncated):
\`\`\`typescript
${codebaseContext}
\`\`\``;

  yield* streamLLM(
    { prompt: userPrompt, systemMessage: SYSTEM_ANALYZE_PART, model: 'gpt-4.1' },
    signal
  );
}
