/**
 * Log Parser — streams workflow.log and step/*.log files into typed LogEvent objects.
 * Uses readline to handle arbitrarily large files without loading into memory.
 * @module parsers/log_parser
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type {
  LogEvent,
  LogLevel,
  AiCallEvent,
  StepEvent,
  PerformanceEvent,
  RetryEvent,
} from '../types/index.js';

// ─── Regex patterns ───────────────────────────────────────────────────────────

const TIMESTAMP_RE = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] /;
const AI_CALL_START_RE = /\[AI\] SDK call starting — persona: (\S+), model: (\S+), prompt_chars: (\d+)/;
const AI_CALL_COMPLETE_RE = /\[AI\] SDK call completed — persona: (\S+), model: (\S+), response_chars: (\d+), latency: (\d+)ms/;
const STEP_START_RE = /→ Starting: (.+)/;
const STEP_COMPLETE_RE = /✓ Step (step_\S+) completed in (\d+)ms/;
const STEP_WARNING_RE = /⚠ Step (\d+) completed - (\d+) issue\(s\) found/;
const STEP_ERROR_RE = /✗ \[CRITICAL\] Operation '(step_\S+)' took ([\d.]+)(?:ms|s)(?: \(memory: ([\d.]+)MB\))?/;
const PERF_DEBUG_RE = /\[DEBUG\] \[Performance\] (step_\S+): ([\d.]+)(ms|s)/;
const RETRY_RE = /\[DEBUG\] Executing AI request \(attempt (\d+)\/(\d+)\)/;
const STEP_ID_FROM_LOG_RE = /step_[\w]+/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMs(value: string, unit: string): number {
  const n = parseFloat(value);
  return unit === 's' ? Math.round(n * 1000) : n;
}

function detectLevel(message: string): LogLevel {
  if (message.includes('[CRITICAL]') || message.startsWith('✗')) return 'critical';
  if (message.startsWith('⚠')) return 'warn';
  if (message.includes('[DEBUG]')) return 'debug';
  if (message.includes('Error') || message.includes('error') || message.includes('ERROR')) return 'error';
  return 'info';
}

function extractStepId(message: string): string | undefined {
  const m = message.match(STEP_ID_FROM_LOG_RE);
  return m ? m[0] : undefined;
}

// ─── Line parser ─────────────────────────────────────────────────────────────

/**
 * Parses a single raw log line into a typed event object.
 * Returns `null` for lines that do not match any known event format.
 * @param raw - Raw log line string
 * @param contextStepId - Step ID inherited from the surrounding file context
 */
export function parseLine(
  raw: string,
  contextStepId?: string
): LogEvent | AiCallEvent | StepEvent | PerformanceEvent | RetryEvent | null {
  const tsMatch = raw.match(TIMESTAMP_RE);
  if (!tsMatch) return null;

  const timestamp = new Date(tsMatch[1]);
  const message = raw.slice(tsMatch[0].length);
  const level = detectLevel(message);
  const base = { timestamp, level, message, raw };

  // AI call start
  let m = message.match(AI_CALL_START_RE);
  if (m) {
    return {
      ...base,
      kind: 'ai_call_start',
      stepId: contextStepId,
      persona: m[1],
      model: m[2],
      promptChars: parseInt(m[3], 10),
    } as AiCallEvent;
  }

  // AI call complete
  m = message.match(AI_CALL_COMPLETE_RE);
  if (m) {
    return {
      ...base,
      kind: 'ai_call_complete',
      stepId: contextStepId,
      persona: m[1],
      model: m[2],
      responseChars: parseInt(m[3], 10),
      latencyMs: parseInt(m[4], 10),
    } as AiCallEvent;
  }

  // Step complete
  m = message.match(STEP_COMPLETE_RE);
  if (m) {
    return {
      ...base,
      kind: 'step_complete',
      stepId: m[1],
      durationMs: parseInt(m[2], 10),
    } as StepEvent;
  }

  // Step warning
  m = message.match(STEP_WARNING_RE);
  if (m) {
    return {
      ...base,
      level: 'warn',
      kind: 'step_warning',
      stepId: contextStepId ?? `step_${m[1]}`,
      issueCount: parseInt(m[2], 10),
    } as StepEvent;
  }

  // Critical performance error
  m = message.match(STEP_ERROR_RE);
  if (m) {
    const unit = m[2].includes('.') && parseFloat(m[2]) < 100 ? 's' : 'ms';
    return {
      ...base,
      level: 'critical',
      kind: 'performance',
      stepId: m[1],
      durationMs: parseMs(m[2], unit),
      memoryMb: m[3] ? parseFloat(m[3]) : undefined,
      isCritical: true,
    } as PerformanceEvent;
  }

  // Performance debug
  m = message.match(PERF_DEBUG_RE);
  if (m) {
    return {
      ...base,
      level: 'debug',
      kind: 'performance',
      stepId: m[1],
      durationMs: parseMs(m[2], m[3]),
      isCritical: false,
    } as PerformanceEvent;
  }

  // Retry
  m = message.match(RETRY_RE);
  if (m) {
    return {
      ...base,
      level: 'warn',
      kind: 'retry',
      stepId: contextStepId ?? extractStepId(message),
      attempt: parseInt(m[1], 10),
      maxAttempts: parseInt(m[2], 10),
    } as RetryEvent;
  }

  // Generic log event
  return {
    ...base,
    stepId: contextStepId ?? extractStepId(message),
  } as LogEvent;
}

// ─── File streaming ───────────────────────────────────────────────────────────

/**
 * Streams a single log file, yielding parsed LogEvent objects.
 * @param filePath - Absolute path to the .log file
 * @param contextStepId - Step ID context (for step-specific logs)
 */
export async function* streamLogFile(
  filePath: string,
  contextStepId?: string
): AsyncGenerator<LogEvent | AiCallEvent | StepEvent | PerformanceEvent | RetryEvent> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const event = parseLine(line, contextStepId);
    if (event) yield event;
  }
}

// ─── Run-level parser ─────────────────────────────────────────────────────────

/** Union of all structured log event types produced by {@link parseLine}. */
export type AnyLogEvent = LogEvent | AiCallEvent | StepEvent | PerformanceEvent | RetryEvent;

/**
 * Parses all log files for a workflow run directory.
 * Streams workflow.log first, then all step logs.
 * @param runDir - Path to workflow_YYYYMMDD_HHMMSS/ directory
 */
export async function* parseRunLogs(runDir: string): AsyncGenerator<AnyLogEvent> {
  // Main workflow log
  const mainLog = join(runDir, 'workflow.log');
  try {
    await stat(mainLog);
    yield* streamLogFile(mainLog);
  } catch {
    // no main log
  }

  // Step-specific logs
  const stepsDir = join(runDir, 'steps');
  try {
    const stepFiles = await readdir(stepsDir);
    for (const file of stepFiles.sort()) {
      if (!file.endsWith('.log')) continue;
      const stepId = file.replace('.log', '');
      yield* streamLogFile(join(stepsDir, file), stepId);
    }
  } catch {
    // no steps dir
  }
}

/**
 * Collects all log events for a run into an array.
 * Use only for small/medium runs; prefer streaming for large ones.
 */
export async function parseRunLogsToArray(runDir: string): Promise<AnyLogEvent[]> {
  const events: AnyLogEvent[] = [];
  for await (const event of parseRunLogs(runDir)) {
    events.push(event);
  }
  return events;
}

// ─── Run metadata ─────────────────────────────────────────────────────────────

interface RunMetadataFile {
  projectRoot?: string;
  runId?: string;
  timestamp?: string;
}

/**
 * Reads run_metadata.json from the run directory.
 * Returns an empty object if the file is absent or malformed (backward compat).
 */
export async function parseRunMetadata(runDir: string): Promise<RunMetadataFile> {
  const { readFile } = await import('node:fs/promises');
  try {
    const raw = await readFile(join(runDir, 'run_metadata.json'), 'utf8');
    return JSON.parse(raw) as RunMetadataFile;
  } catch {
    return {};
  }
}
