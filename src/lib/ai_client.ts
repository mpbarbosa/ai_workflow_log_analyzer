/**
 * AI Client — provider-switching facade over copilot_client and claude_client.
 * Call setProvider() once at startup (CLI or TUI entry) before any LLM calls.
 * All application code imports LLM functions from here, not from the provider modules directly.
 * Provider modules are loaded lazily on first use so unused SDKs are never imported.
 * @module lib/ai_client
 */

export type AIProvider = 'copilot' | 'claude';

export type { LlmRequest, LlmResponse, StreamChunk } from './copilot_client.js';
import type { LlmRequest, LlmResponse, StreamChunk } from './copilot_client.js';

let _provider: AIProvider = 'copilot';

/** Sets the active AI provider for all subsequent LLM calls. Must be called before the pipeline or TUI starts. */
export function setProvider(provider: AIProvider): void {
  _provider = provider;
}

export function getProvider(): AIProvider {
  return _provider;
}

// ─── Lazy loader ──────────────────────────────────────────────────────────────

// The union type is structural — both modules expose the same shape.
type ClientModule = typeof import('./copilot_client.js');
let _copilot: ClientModule | undefined;
let _claude: ClientModule | undefined;

async function client(): Promise<ClientModule> {
  if (_provider === 'claude') {
    if (!_claude) _claude = (await import('./claude_client.js')) as unknown as ClientModule;
    return _claude;
  }
  if (!_copilot) _copilot = await import('./copilot_client.js');
  return _copilot;
}

// ─── Delegated exports ────────────────────────────────────────────────────────

export async function analyzeWithLLM(req: LlmRequest): Promise<LlmResponse> {
  return (await client()).analyzeWithLLM(req);
}

export async function analyzePromptQuality(
  persona: string,
  model: string,
  prompt: string,
  response: string
): Promise<{ score: number; feedback: string; suggestions: string[] }> {
  return (await client()).analyzePromptQuality(persona, model, prompt, response);
}

export async function summarizeReport(reportJson: string): Promise<string> {
  return (await client()).summarizeReport(reportJson);
}

export async function* streamLLM(
  req: LlmRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  yield* (await client()).streamLLM(req, signal);
}

export async function* analyzePromptPartVsCodebase(
  label: string,
  lines: string[],
  projectRoot: string,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  yield* (await client()).analyzePromptPartVsCodebase(label, lines, projectRoot, signal);
}

export async function* analyzePromptPartWithReversePrompting(
  label: string,
  lines: string[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  yield* (await client()).analyzePromptPartWithReversePrompting(label, lines, signal);
}

export async function* analyzeWholePromptWithReversePrompting(
  lines: string[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  yield* (await client()).analyzeWholePromptWithReversePrompting(lines, signal);
}
