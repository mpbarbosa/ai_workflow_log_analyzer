/**
 * Prompt Parser — parses prompt log markdown files into PromptRecord objects.
 * Format: prompts/step_XX/<timestamp>_<N>_<persona>.md
 * @module parsers/prompt_parser
 */

import { readFile } from 'node:fs/promises';
import { readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { PromptRecord } from '../types/index.js';

// ─── Filename parser ──────────────────────────────────────────────────────────

// e.g. "2026-03-27T01-42-21-069Z_0001_architecture_reviewer.md"
const FILENAME_RE = /^(\d{4}-\d{2}-\d{2}T[\d-]+Z)_(\d{4})_(.+)\.md$/;

function parseTimestamp(raw: string): Date {
  // Convert filename-safe dashes back to colons/dots: T01-42-21-069Z → T01:42:21.069Z
  const iso = raw.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/, 'T$1:$2:$3.$4Z');
  return new Date(iso);
}

function parsePersonaFromFilename(filename: string): { timestamp: Date; seq: number; persona: string } | null {
  const m = basename(filename).match(FILENAME_RE);
  if (!m) return null;
  return {
    timestamp: parseTimestamp(m[1]),
    seq: parseInt(m[2], 10),
    persona: m[3],
  };
}

// ─── Markdown content parser ──────────────────────────────────────────────────

interface ParsedPromptFile {
  persona: string;
  model: string;
  timestamp: Date;
  prompt: string;
  response: string;
}

/**
 * Parses the markdown content of a prompt log file.
 * Expected structure:
 * ```
 * # Prompt Log
 * **Timestamp:** ...
 * **Persona:** ...
 * **Model:** ...
 * ## Prompt
 * ```<content>```
 * ## Response
 * ```<content>```
 * ```
 */
export function parsePromptFileContent(content: string): ParsedPromptFile | null {
  const personaMatch = content.match(/\*\*Persona:\*\*\s*(\S+)/);
  const modelMatch = content.match(/\*\*Model:\*\*\s*(\S+)/);
  const tsMatch = content.match(/\*\*Timestamp:\*\*\s*(\S+)/);

  if (!personaMatch || !modelMatch) return null;

  const persona = personaMatch[1];
  const model = modelMatch[1];
  const timestamp = tsMatch ? new Date(tsMatch[1]) : new Date(0);

  // Extract prompt block — between ## Prompt and ## Response (or end)
  const promptSectionMatch = content.match(/## Prompt\s*\n([\s\S]*?)(?=\n## Response|\n## |$)/);
  const responseSectionMatch = content.match(/## Response\s*\n([\s\S]*?)(?=\n## |$)/);

  const extractCodeBlock = (section: string): string => {
    const codeBlock = section.match(/```[^\n]*\n([\s\S]*?)```/);
    return codeBlock ? codeBlock[1].trim() : section.trim();
  };

  const prompt = promptSectionMatch ? extractCodeBlock(promptSectionMatch[1]) : '';
  const response = responseSectionMatch ? extractCodeBlock(responseSectionMatch[1]) : '';

  return { persona, model, timestamp, prompt, response };
}

// ─── File loader ──────────────────────────────────────────────────────────────

/**
 * Loads and parses a single prompt log file into a PromptRecord.
 */
export async function parsePromptFile(
  filePath: string,
  stepId: string
): Promise<PromptRecord | null> {
  const meta = parsePersonaFromFilename(filePath);
  if (!meta) return null;

  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const parsed = parsePromptFileContent(content);
  if (!parsed) return null;

  return {
    stepId,
    timestamp: meta.timestamp,
    sequenceNum: meta.seq,
    persona: parsed.persona,
    model: parsed.model,
    prompt: parsed.prompt,
    response: parsed.response,
    promptChars: parsed.prompt.length,
    responseChars: parsed.response.length,
    // latencyMs is correlated later by the analyzers from AiCallEvent data
    latencyMs: undefined,
  };
}

// ─── Run-level loader ─────────────────────────────────────────────────────────

/**
 * Loads all prompt records for a workflow run.
 * @param runDir - Path to workflow_YYYYMMDD_HHMMSS/ directory
 */
export async function parseRunPrompts(runDir: string): Promise<PromptRecord[]> {
  const promptsDir = join(runDir, 'prompts');

  try {
    await stat(promptsDir);
  } catch {
    return [];
  }

  const records: PromptRecord[] = [];
  const stepDirs = await readdir(promptsDir);

  for (const stepDir of stepDirs.sort()) {
    const stepPath = join(promptsDir, stepDir);
    let files: string[];
    try {
      files = await readdir(stepPath);
    } catch {
      continue;
    }

    for (const file of files.sort()) {
      if (!file.endsWith('.md')) continue;
      const record = await parsePromptFile(join(stepPath, file), stepDir);
      if (record) records.push(record);
    }
  }

  return records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
