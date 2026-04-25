/**
 * Helpers for launching targeted Copilot fix sessions from prompt log responses.
 * @module tui/prompt_response_fix
 */

const ISSUE_SECTION_RE = /^(?:#{1,6}\s*)?(issues?|findings?|problems?|bugs?|fixes?|recommendations?|suggestions?)\b/i;
const ISSUE_BULLET_RE = /^([-*+]|\d+\.)\s+/;
const ISSUE_KEYWORD_RE =
  /\b(issue|bug|error|fail(?:ure|ing)?|broken|missing|incorrect|wrong|mismatch|outdated|stale|invalid|inconsistent|incomplete|unsupported|fix|update|remove|rename|add)\b/i;
const ISSUE_ACTION_RE = /\b(should|must|needs to|need to)\b/i;
const ISSUE_METADATA_RE =
  /^([-*+]|\d+\.)\s+\*\*(?:file|files|issue type|severity|impact|optimization example|recommended fix|root cause|status|finding):?\*\*:?/i;
const ISSUE_PERFORMANCE_RE =
  /\b(performance|startup|bundle|eager|lazy-?load|re-?export|memory|latency|throughput)\b/i;
const FILE_REFERENCE_RE = /\b[\w./-]+\.(?:[cm]?ts|tsx|[cm]?js|jsx|md|json|ya?ml)\b/;
const NO_ISSUES_RE = /\b(no (actionable )?(issues|findings)|nothing to fix|no changes needed)\b/i;

export const NO_ACTIONABLE_PROMPT_RESPONSE_ISSUES_MESSAGE = 'No actionable issues found in prompt response.';

/**
 * Returns the concrete issue lines worth handing off to the fix skill.
 */
export function extractPromptResponseIssueCandidates(responseText: string): string[] {
  const candidates = new Set<string>();
  const lines = responseText.split('\n').map((line) => line.trim()).filter(Boolean);

  let inIssueSection = false;

  for (const line of lines) {
    if (ISSUE_SECTION_RE.test(line)) {
      inIssueSection = true;
      continue;
    }

    if (/^#{1,6}\s+\S/.test(line)) {
      inIssueSection = false;
    }

    const isBullet = ISSUE_BULLET_RE.test(line);
    const mentionsIssue = ISSUE_KEYWORD_RE.test(line);
    const mentionsAction = ISSUE_ACTION_RE.test(line);
    const mentionsIssueMetadata = ISSUE_METADATA_RE.test(line);
    const mentionsPerformance = ISSUE_PERFORMANCE_RE.test(line);
    const mentionsFile = FILE_REFERENCE_RE.test(line);

    if (
      (isBullet && (inIssueSection || mentionsIssue || mentionsAction || mentionsIssueMetadata || mentionsPerformance || mentionsFile)) ||
      (inIssueSection && (mentionsIssue || mentionsAction || mentionsIssueMetadata || mentionsPerformance || mentionsFile))
    ) {
      candidates.add(line);
    }
  }

  if (candidates.size === 0 && NO_ISSUES_RE.test(responseText)) {
    return [];
  }

  return [...candidates];
}

/**
 * Returns true when the response appears to contain actionable fix candidates.
 */
export function hasPromptResponseIssueCandidates(responseText: string): boolean {
  return extractPromptResponseIssueCandidates(responseText).length > 0;
}

/**
 * Builds the interactive Copilot prompt for the prompt-response fix skill.
 */
export function buildPromptResponseFixPrompt(logFilePath: string, responseText: string): string {
  const candidateLines = extractPromptResponseIssueCandidates(responseText);
  const responseExcerpt = responseText.trim().split('\n').slice(0, 160).join('\n');

  return [
    `Use the fix-prompt-response-issues skill for this prompt log: ${logFilePath}`,
    '',
    'Important constraints:',
    '- Operate on the repository that owns this prompt log file (the current working directory for this session).',
    '- Extract only concrete, actionable issues from the prompt response.',
    '- Treat concrete performance, startup, bundle-size, eager-loading, and similar file-specific inefficiencies as actionable issues when the response ties them to named files or modules.',
    '- Ignore speculative commentary, generic improvement ideas, and praise, but keep optimization guidance when it explains how to fix a verified issue.',
    '- If the response does not contain actionable issues, stop and report exactly: No actionable issues found in prompt response.',
    '- Read the prompt log file itself if you need more context than the excerpt below.',
    '',
    'Prompt response excerpt:',
    '```markdown',
    responseExcerpt,
    '```',
    '',
    'Locally detected candidate issue lines:',
    '```text',
    candidateLines.join('\n'),
    '```',
  ].join('\n');
}
