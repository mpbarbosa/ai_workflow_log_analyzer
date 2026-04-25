/**
 * Claude SDK Client — typed wrapper around @anthropic-ai/claude-agent-sdk for analysis calls.
 * Supports one-shot requests and streaming responses.
 * Exports the same interface as copilot_client.ts so callers can switch providers by changing the import.
 * @module lib/claude_client
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

export interface LlmRequest {
  prompt: string;
  model?: string;
  /** System message prepended to the conversation via the SDK systemPrompt option */
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function buildOptions(req: LlmRequest): Options {
  const opts: Options = { permissionMode: 'bypassPermissions' };
  if (req.model) opts.model = req.model;
  if (req.systemMessage) opts.systemPrompt = req.systemMessage;
  return opts;
}

function extractText(blocks: Array<{ type: string; text?: string }>): string {
  let text = '';
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') text += block.text;
  }
  return text;
}

// ─── One-shot request ─────────────────────────────────────────────────────────

/**
 * Sends a single prompt to the Claude Agent SDK and returns the full response.
 * Each call is self-contained — no session is reused across calls.
 */
export async function analyzeWithLLM(req: LlmRequest): Promise<LlmResponse> {
  const model = req.model ?? DEFAULT_MODEL;
  const start = Date.now();
  let content = '';

  const gen = query({ prompt: req.prompt, options: buildOptions({ ...req, model }) });
  for await (const message of gen) {
    if (message.type === 'assistant') {
      content += extractText(message.message.content as Array<{ type: string; text?: string }>);
    } else if (message.type === 'result' && message.subtype !== 'success') {
      const reason =
        'errors' in message && Array.isArray(message.errors) && message.errors[0]
          ? String(message.errors[0])
          : message.subtype;
      throw new Error(`LLM run failed: ${reason}`);
    }
  }

  return { content, model, latencyMs: Date.now() - start };
}

// ─── Streaming request ────────────────────────────────────────────────────────

/**
 * Streams a Claude Agent SDK response, yielding each assistant message as it arrives.
 * The SDK yields complete assistant turns rather than individual tokens; callers
 * receive progressive chunks as Claude produces them across multi-turn interactions.
 */
export async function* streamLLM(
  req: LlmRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const model = req.model ?? DEFAULT_MODEL;

  const gen = query({ prompt: req.prompt, options: buildOptions({ ...req, model }) });
  for await (const message of gen) {
    if (signal?.aborted) break;
    if (message.type === 'assistant') {
      const text = extractText(message.message.content as Array<{ type: string; text?: string }>);
      if (text) yield { delta: text, done: false };
    } else if (message.type === 'result' && message.subtype !== 'success') {
      const reason =
        'errors' in message && Array.isArray(message.errors) && message.errors[0]
          ? String(message.errors[0])
          : message.subtype;
      throw new Error(`LLM run failed: ${reason}`);
    }
  }

  yield { delta: '', done: true };
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
    model: DEFAULT_MODEL,
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
    model: DEFAULT_MODEL,
  });
  return result.content;
}

// ─── Prompt part analysis ────────────────────────────────────────────────────

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

  > **IMPORTANT — Task-as-summary rule (read before evaluating any Task section):**
  >
  > Structured prompts are split into named sections at \`**Label**:\` boundaries.
  > This means a "Task" section often contains only the high-level goal opener;
  > detailed criteria, definitions, and examples live in sibling sections such as
  > "Validation Criteria", "Required Directory Definition", "Contents match...",
  > "Tasks", "Output", etc.
  >
  > A Task section that states a clear, scoped goal and explicitly or implicitly
  > delegates specifics to named companion sections is **well-designed** — it is
  > acting as a concise summary, not an incomplete spec.
  >
  > **Do NOT penalize a Task section for missing detail that belongs in companion
  > sections.** If the Task text is a coherent goal statement (what to do and why),
  > treat it as correct. Only flag vagueness if the Task provides no actionable
  > direction at all.
  >
  > ❌ Incorrect reasoning (do not do this):
  >   "The Task section says 'validate directory structure' but doesn't specify
  >    which directories are required → alignment is weak."
  >
  > ✅ Correct reasoning:
  >   "The Task section states the validation goal clearly. Details about which
  >    directories are required live in the companion 'Validation Criteria' and
  >    'Required Directory Definition' sections. The Task is a well-scoped opener
  >    → well-aligned."

  **Important for Task sections**: The CODEBASE CONTEXT is the TARGET project being
  validated or reviewed by the AI workflow. The validation/analysis code itself lives
  in a separate \`ai_workflow.js\` system, and the workflow prompt templates are hosted
  in the \`/home/mpb/Documents/GitHub/ai_workflow.js\` repository/folder rather than in
  the target project's source tree. Absence of validation scripts, analyzers, workflow
  logic, or prompt-template source files in the codebase context is normal and must NOT
  be flagged as a misalignment.

  Task sections may organize their body with \`### Heading\` markdown headings (e.g.
  "### Configuration Files in Scope", "### Project Context"). These are sub-sections
  of the Task, not separate top-level sections — do not penalize a Task for referencing
  content that appears in an adjacent markdown heading below it.

  **Rendered-variable rule**: Task sections are often generated from templates with
  placeholder values. If SECTION CONTENT contains resolved fields such as \`none found\`,
  \`N/A\`, \`unknown\`, empty path lists, or zero counts, treat them as possible
  project-specific template variable outcomes rather than template defects. Do NOT
  recommend changing the template unless the wording is misleading even when such
  values are absent.

- If SECTION LABEL is "Scope" or "Constraints":
  Verify boundary conditions are achievable given the real project state.

---

**Prompt flaw vs. context limitation**: Clearly separate these two in your findings:
1. A flaw in the prompt section itself (ambiguous wording, wrong file reference, incorrect assumption)
2. Insufficient or truncated evidence in CODEBASE CONTEXT preventing verification

Only finding type 1 should materially reduce the alignment score. Do not deduct more
than 1–2 points solely because a claim cannot be verified from the truncated context.

**Historical-artifact rule**:
- Some prompt logs describe an earlier repository snapshot than the live codebase you are comparing against.
- A later version bump, changelog entry, or documentation refresh in the live repository is **not** by itself a prompt flaw or mismatch.
- Only flag version drift when the section itself claims contemporaneous parity between two artifacts that should match at the same time, or when the prompt embeds evidence proving the mismatch existed in the analyzed snapshot.
- Prefer wording such as "historical drift" or "expected repo evolution" over "mismatch" when the only disagreement is that the repository changed after the prompt was generated.

**Completeness rule**:
- If SECTION CONTENT visibly contains truncation markers, clipped file contents, placeholder omissions, or partial batches, do not treat downstream success claims as fully validated.
- In that case, focus findings on over-claiming from incomplete evidence and mark the missing checks as inconclusive or unavailable.
- Do not reward or repeat unsupported positive claims (for example: "all files validated successfully", "version badges are present", or "terminology is consistent") unless the provided text explicitly shows the supporting evidence.

**Recommendation discipline**:
- Be assertive. Do not hedge with "optionally", "consider", "may want to", or similar phrasing.
- If you identify a prompt flaw, each suggestion must describe a concrete edit to the prompt text
  or prompt structure and explain why that change is needed.
- If you do NOT identify a concrete prompt flaw, explicitly say \`No prompt change needed\` in the
  Summary and make the first Suggestions item \`No prompt change needed — current wording is aligned.\`
- Do not invent improvement work just to avoid an empty review.

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
- Prompt flaw: ...
- Context limitation: ...

## Suggestions
1. Specific improvement to the prompt section
2. ...`;

export function buildPromptPartAnalysisSystemPrompt(): string {
  return SYSTEM_ANALYZE_PART;
}

const SYSTEM_REVERSE_PROMPT_PART = `<System>
You are an Expert Prompt Engineer and Linguistic Forensic Analyst. Your specialty is "Reverse Prompting"—the art of deconstructing a finished piece of content to uncover the precise instructions, constraints, and contextual nuances required to generate it from scratch. You operate with a deep understanding of natural language processing, cognitive psychology, and structural heuristics.
</System>
<Context>
The user has provided a "Gold Standard" example of content, a specific problem, or a successful use case. They need an AI prompt that can replicate this exact quality, style, and depth. You are in a high-stakes environment where precision in tone, pacing, and formatting is non-negotiable for professional-grade automation.
</Context>
<Instructions>
1. **Initial Forensic Audit**: Scan the user-provided text/case. Identify the primary intent and the secondary emotional drivers.
2. **Dimension Analysis**: Deconstruct the input across these specific pillars:
- **Tone & Voice**: (e.g., Authoritative yet empathetic, satirical, clinical)
- **Pacing & Rhythm**: (e.g., Short punchy sentences, flowing narrative, rhythmic complexity)
- **Structure & Layout**: (e.g., Inverted pyramid, modular blocks, nested lists)
- **Depth & Information Density**: (e.g., High-level overview vs. granular technical detail)
- **Formatting Nuances**: (e.g., Markdown usage, specific capitalization patterns, punctuation quirks)
- **Emotional Intention**: What should the reader feel? (e.g., Urgency, trust, curiosity)
3. **Synthesis**: Translate these observations into a "Master Prompt" using the structured format: <System>, <Context>, <Instructions>, <Constraints>, <Output Format>.
4. **Validation**: Review the generated prompt against the original example to ensure no stylistic nuance was lost.
</Instructions>
<Constraints>
- Avoid generic descriptions like "professional" or "creative"; use hyper-specific descriptors (e.g., "Wall Street Journal editorial style" or "minimalist Zen-like prose").
- The generated prompt must be "executable" as a standalone instruction set.
- Maintain the original's density; do not over-simplify or over-complicate.
</Constraints>
<Output Format>
Follow this exact layout for the final output:
### Part 1: Linguistic Analysis
[Detailed breakdown of the identified Tone, Pacing, Structure, and Intent]

### Part 2: The Generated Master Prompt
\`\`\`xml
[Insert the fully engineered prompt here]
\`\`\`

### Part 3: Execution Advice
[Advice on which LLM models work best for this prompt and suggested temperature/top-p settings]
</Output Format>
<Reasoning>
Apply Theory of Mind to analyze the logic behind the original author's choices. Use Strategic Chain-of-Thought to map the path from the original text's "effect" back to the "cause" (the instructions). Ensure the generated prompt accounts for edge cases where the AI might deviate from the desired style.
</Reasoning>
<User Input>
Please paste the "Gold Standard" text, the specific issue, or the use case you want to reverse-engineer. Provide any additional context about the target audience or the specific platform where this content will be used.
</User Input>`;

export function buildReversePromptPartAnalysisSystemPrompt(): string {
  return SYSTEM_REVERSE_PROMPT_PART;
}

/**
 * Reads project source and documentation files for codebase context.
 * Includes root-level markdown docs (README, CONTRIBUTING, ARCHITECTURE,
 * FUNCTIONAL_REQUIREMENTS) and TypeScript source files from src/.
 * Returns a concatenated string split across a docs budget and a code budget.
 */
async function readCodebaseContext(projectRoot: string, maxChars = 4000): Promise<string> {
  const { readFile, stat } = await import('node:fs/promises');
  const { join } = await import('node:path');

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
      else if (
        (e.endsWith('.ts') && !e.endsWith('.d.ts')) ||
        (e.endsWith('.js') && !e.endsWith('.min.js'))
      ) files.push(full);
    }
  };

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
  const userPrompt = buildPromptPartAnalysisUserPrompt(label, lines, codebaseContext);

  yield* streamLLM(
    { prompt: userPrompt, systemMessage: SYSTEM_ANALYZE_PART, model: DEFAULT_MODEL },
    signal
  );
}

/**
 * Streams a reverse-prompting analysis of the given prompt part.
 *
 * @param label  - Section label (e.g. "Task", "Constraints")
 * @param lines  - Raw content lines of the section
 * @param signal - Optional AbortSignal to cancel mid-stream
 */
export async function* analyzePromptPartWithReversePrompting(
  label: string,
  lines: string[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const userPrompt = buildReversePromptPartAnalysisUserPrompt(label, lines);

  yield* streamLLM(
    { prompt: userPrompt, systemMessage: SYSTEM_REVERSE_PROMPT_PART, model: DEFAULT_MODEL },
    signal
  );
}

/**
 * Streams a reverse-prompting analysis of an entire structured prompt.
 *
 * @param lines  - Raw lines of the full prompt text
 * @param signal - Optional AbortSignal to cancel mid-stream
 */
export async function* analyzeWholePromptWithReversePrompting(
  lines: string[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const userPrompt = buildReversePromptWholeAnalysisUserPrompt(lines);

  yield* streamLLM(
    { prompt: userPrompt, systemMessage: SYSTEM_REVERSE_PROMPT_PART, model: DEFAULT_MODEL },
    signal
  );
}

export function buildPromptPartAnalysisUserPrompt(
  label: string,
  lines: string[],
  codebaseContext: string
): string {
  const sectionContent = lines.join('\n').trim();

  return `**SECTION LABEL**: ${label}

**SECTION CONTENT**:
${sectionContent.slice(0, 2000)}

**CODEBASE CONTEXT** (root docs + src/**/*.ts, truncated):
\`\`\`typescript
${codebaseContext}
\`\`\``;
}

export function buildReversePromptPartAnalysisUserPrompt(
  label: string,
  lines: string[]
): string {
  const sectionContent = lines.join('\n').trim();

  return `You are reverse-engineering a structured prompt section extracted from an AI workflow log.

**SECTION LABEL**: ${label}

**GOLD STANDARD TEXT**:
${sectionContent.slice(0, 4000)}

**ADDITIONAL CONTEXT**:
- Treat the selected section text above as the "Gold Standard" example to reverse-engineer.
- This is a single named part from a larger prompt, so avoid assuming sibling sections unless they are explicitly referenced in the text.
- Preserve the section's observed tone, pacing, structure, density, and formatting habits when synthesizing the master prompt.`;
}

/**
 * Builds the user prompt for reverse-prompting an entire structured prompt.
 */
export function buildReversePromptWholeAnalysisUserPrompt(lines: string[]): string {
  const promptContent = lines.join('\n').trim();

  return `You are reverse-engineering an entire structured prompt extracted from an AI workflow log.

**PROMPT SCOPE**: Whole Prompt

**GOLD STANDARD TEXT**:
${promptContent.slice(0, 4000)}

**ADDITIONAL CONTEXT**:
- Treat the full prompt text above as the "Gold Standard" example to reverse-engineer.
- This text contains multiple coordinated sections, so preserve the relationships between role, context, instructions, constraints, and output contract.
- Preserve the prompt's observed tone, pacing, structure, density, and formatting habits when synthesizing the master prompt.`;
}
