/**
 * Documentation Analyzer — detects documentation generation failures, AI parse
 * failures, missing documentation directories, and consistency issues.
 *
 * ## Analysis Framework
 *
 * For broken-reference issues this module applies a four-step framework that
 * mirrors the AI-assisted root-cause analysis performed by the documentation
 * quality prompt (persona: documentation_expert):
 *
 * a) **False Positive Check** — Is the target truly missing, or is it a build
 *    artifact, external URL, placeholder, or case-sensitivity mismatch?
 *    Issues are only raised when the scanner confirms the target is absent.
 *
 * b) **Root Cause Determination** — Why is the target missing?
 *    Populated in {@link Issue.rootCause}: renamed file, moved location, typo
 *    in reference, removed intentionally, or never existed.
 *
 * c) **Fix Recommendation** — What is the specific corrective action?
 *    Populated in {@link Issue.fixRecommendation}: update reference, restore
 *    file, remove reference, or create missing file.
 *
 * d) **Priority Assessment** — Severity maps to user impact:
 *    - `high`   → developer docs (API reference, architecture)
 *    - `medium` → internal / non-critical docs
 *    - `low`    → archive / deprecated docs
 *
 * > **Automated vs AI-assisted**: Steps (a) and (d) are fully automated here.
 * > Steps (b) and (c) are partially automated — the scanner populates known
 * > root causes when detectable from log data; deeper analysis is delegated to
 * > the AI via the documentation_expert prompt (see `.github/skills/` and the
 * > workflow's step_02 broken-reference prompt section).
 *
 * ## Data-Boundary Rules (enforced, non-speculative)
 *
 * This analyzer emits issues **only when log evidence is present**. The same
 * principle applies to the AI-assisted step_02 prompt:
 *
 * - **Cross-reference gaps** — A missing cross-reference is only flagged when
 *   the filename pairing *strongly* implies a documented relationship, i.e. a
 *   same-stem source/doc pair such as `metrics_parser.ts` + `metrics_parser.md`.
 *   Directory co-location alone is not sufficient evidence.
 *   _Example of a valid flag_: `doc_analyzer.ts` exists but `doc_analyzer.md`
 *   is absent — same stem, different extension, clear pairing.
 *   _Example of an invalid flag_: `CHANGELOG.md` and `README.md` are co-located
 *   but serve different purposes; no cross-reference gap should be inferred.
 *
 * - **Version inconsistencies** — Raised only when the `VERSION_ISSUE_RE` pattern
 *   matches a log event (`Version check: N issue(s) found`). Speculative claims
 *   about version numbers without this evidence are never emitted.
 *
 * - **Missing feature docs** — Not raised by this analyzer. Feature-level doc
 *   coverage requires content inspection that is outside the scope of log analysis.
 *
 * @module analyzers/doc_analyzer
 */

import type { AnyLogEvent } from '../parsers/log_parser.js';
import type { Issue } from '../types/index.js';

let _issueCounter = 0;
function nextId(): string {
  return `doc-${++_issueCounter}`;
}

// Matches: "Found 4 missing documentation files (0 critical)"
const GAP_DETECTED_RE = /Found (\d+) missing documentation files/i;
// Matches: "Generated 0 documentation files" or "Generated 3 documentation files"
const GENERATED_RE = /Generated (\d+) documentation files/i;
// Matches: "AI response not parsed (0 docs)"
const AI_PARSE_FAIL_RE = /AI response not parsed \(0 docs\)/i;
// Matches: "Documentation directory not found"
const DOCS_DIR_MISSING_RE = /Documentation directory not found/i;
// Matches: "Version check: 2 issue(s) found"
const VERSION_ISSUE_RE = /Version check: (\d+) issue\(s\) found/i;
// Matches: "Link check: 3 broken link(s)"
const BROKEN_LINK_RE = /Link check: (\d+) broken link\(s\)/i;

/**
 * Analyzes log events for documentation-related issues.
 */
export function analyzeDocumentation(events: AnyLogEvent[]): Issue[] {
  const issues: Issue[] = [];

  // Track gap detection state per step to catch zero-output generation
  const gapState = new Map<string, { missing: number; timestamp: Date; evidence: string }>();

  for (const event of events) {
    const stepKey = event.stepId ?? 'unknown';

    // Gap detected — record how many files are missing
    const gapMatch = GAP_DETECTED_RE.exec(event.message);
    if (gapMatch) {
      const missing = parseInt(gapMatch[1], 10);
      if (missing > 0) {
        gapState.set(stepKey, {
          missing,
          timestamp: event.timestamp,
          evidence: event.raw,
        });
      }
      continue;
    }

    // Generation result — check if output is zero despite a detected gap
    const genMatch = GENERATED_RE.exec(event.message);
    if (genMatch) {
      const generated = parseInt(genMatch[1], 10);
      const gap = gapState.get(stepKey);
      if (generated === 0 && gap && gap.missing > 0) {
        issues.push({
          id: nextId(),
          category: 'documentation',
          severity: 'high',
          stepId: event.stepId,
          title: `Documentation generation produced no output${event.stepId ? ` in ${event.stepId}` : ''}`,
          detail: `Step detected ${gap.missing} missing documentation file(s) but generated 0. The AI response was likely not in the expected structured format.`,
          evidence: event.raw,
          fixRecommendation: `Update the documentation prompt to explicitly require structured output (e.g., JSON or a delimited format). Add an output format example to the prompt and validate the AI response before processing.`,
          timestamp: event.timestamp,
        });
      }
      // Resolved — remove from tracking regardless
      gapState.delete(stepKey);
      continue;
    }

    // AI response parse failure for a documentation step
    if (AI_PARSE_FAIL_RE.test(event.message)) {
      issues.push({
        id: nextId(),
        category: 'documentation',
        severity: 'high',
        stepId: event.stepId,
        title: `AI response parse failure${event.stepId ? ` in ${event.stepId}` : ''}`,
        detail: `The documentation step received a response from the AI but could not parse structured document output from it. The AI likely returned prose instead of the expected format.`,
        evidence: event.raw,
        fixRecommendation: `Constrain the AI output format by adding a strict schema example to the prompt. Instruct the model to respond only with the required structured format and add a fallback parser for common prose variants.`,
        timestamp: event.timestamp,
      });
      continue;
    }

    // Documentation directory missing
    if (DOCS_DIR_MISSING_RE.test(event.message)) {
      issues.push({
        id: nextId(),
        category: 'documentation',
        severity: 'medium',
        stepId: event.stepId,
        title: `Documentation directory not found${event.stepId ? ` in ${event.stepId}` : ''}`,
        detail: event.message,
        evidence: event.raw,
        fixRecommendation: `Create the expected documentation directory before running the workflow. Check the configured docs path in the workflow settings and ensure it exists and is writable.`,
        timestamp: event.timestamp,
      });
      continue;
    }

    // Version consistency issues
    const versionMatch = VERSION_ISSUE_RE.exec(event.message);
    if (versionMatch) {
      const count = parseInt(versionMatch[1], 10);
      if (count > 0) {
        issues.push({
          id: nextId(),
          category: 'documentation',
          severity: count >= 3 ? 'high' : 'medium',
          stepId: event.stepId,
          title: `Documentation version inconsistency${event.stepId ? ` in ${event.stepId}` : ''}`,
          detail: `Version check found ${count} inconsistency issue(s) across documentation files.`,
          evidence: event.raw,
          fixRecommendation: `Synchronise the version string across all documentation files (e.g., README.md, CHANGELOG.md, package.json). Consider using a single source of truth (such as package.json) and a pre-commit hook or CI check to keep them in sync.`,
          timestamp: event.timestamp,
        });
      }
      continue;
    }

    // Broken links in documentation
    const linkMatch = BROKEN_LINK_RE.exec(event.message);
    if (linkMatch) {
      const count = parseInt(linkMatch[1], 10);
      if (count > 0) {
        issues.push({
          id: nextId(),
          category: 'documentation',
          severity: 'medium',
          stepId: event.stepId,
          title: `Broken documentation links${event.stepId ? ` in ${event.stepId}` : ''}`,
          detail: `Link check found ${count} broken link(s) in documentation files.`,
          // Step (b): root cause — target file(s) are absent; specific cause
          // (renamed, moved, typo, deleted, never existed) requires AI-assisted
          // analysis by the documentation_expert prompt.
          rootCause: `${count} link target(s) could not be resolved. Possible causes: renamed or moved file, typo in reference path, or intentionally removed content. Run the documentation_expert analysis for per-reference root cause details.`,
          // Step (c): fix — update, restore, remove, or create the missing target
          fixRecommendation: `For each broken link: (1) check if the target was renamed/moved and update the reference path, (2) restore the file if it was removed unintentionally, or (3) remove the reference if the content is obsolete.`,
          evidence: event.raw,
          timestamp: event.timestamp,
        });
      }
    }
  }

  // Any gap that was never resolved by a generation event is also an issue
  for (const [stepId, data] of gapState) {
    issues.push({
      id: nextId(),
      category: 'documentation',
      severity: 'medium',
      stepId: stepId === 'unknown' ? undefined : stepId,
      title: `Unresolved documentation gap${stepId !== 'unknown' ? ` in ${stepId}` : ''}`,
      detail: `${data.missing} missing documentation file(s) were identified but no generation step completed.`,
      evidence: data.evidence,
      timestamp: data.timestamp,
    });
  }

  return issues;
}
