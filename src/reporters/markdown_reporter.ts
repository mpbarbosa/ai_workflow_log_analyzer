/**
 * Markdown Reporter — renders an AnalysisReport as a human-readable Markdown document.
 * @module reporters/markdown_reporter
 */

import { writeFile } from 'node:fs/promises';
import type { AnalysisReport, Issue, PromptQualityResult } from '../types/index.js';

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

const CATEGORY_LABEL: Record<string, string> = {
  failure: 'Failure',
  performance: 'Performance',
  bug: 'Bug',
  documentation: 'Documentation',
  prompt_quality: 'Prompt Quality',
};

function severityIcon(s: string): string {
  return SEVERITY_ICON[s] ?? '⚪';
}

function formatIssue(issue: Issue): string {
  const icon = severityIcon(issue.severity);
  const lines = [
    `### ${icon} ${issue.title}`,
    ``,
    `- **Category**: ${CATEGORY_LABEL[issue.category] ?? issue.category}`,
    `- **Severity**: ${issue.severity}`,
  ];
  if (issue.stepId) lines.push(`- **Step**: \`${issue.stepId}\``);
  if (issue.timestamp) lines.push(`- **Time**: ${issue.timestamp.toISOString()}`);
  lines.push(``, issue.detail);
  if (issue.rootCause) {
    lines.push(``, `**Root Cause**: ${issue.rootCause}`);
  }
  if (issue.fixRecommendation) {
    lines.push(``, `**Recommended Fix**: ${issue.fixRecommendation}`);
  }
  if (issue.evidence) {
    lines.push(``, `<details><summary>Evidence</summary>`, ``, `\`\`\``, issue.evidence, `\`\`\``, `</details>`);
  }
  if (issue.llmAnalysis) {
    lines.push(``, `**AI Analysis**:`, ``, issue.llmAnalysis);
  }
  return lines.join('\n');
}

function formatPromptQuality(r: PromptQualityResult): string {
  const scoreBar = '█'.repeat(Math.round(r.score / 10)) + '░'.repeat(10 - Math.round(r.score / 10));
  const lines = [
    `### Step \`${r.promptRecord.stepId}\` — Persona: \`${r.promptRecord.persona}\``,
    ``,
    `**Quality Score**: \`${r.score}%\` \`${scoreBar}\``,
    ``,
    r.feedback,
  ];
  if (r.suggestions.length > 0) {
    lines.push(``, `**Suggestions**:`);
    for (const s of r.suggestions) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

/**
 * Renders an AnalysisReport as a Markdown string.
 */
export function toMarkdown(report: AnalysisReport): string {
  const { runId, analyzedAt, counts, metrics, issues, promptQuality, summary } = report;
  const sections: string[] = [];

  // Header
  sections.push(
    `# AI Workflow Log Analysis Report`,
    ``,
    `**Run ID**: \`${runId}\`  `,
    `**Analyzed At**: ${analyzedAt.toISOString()}  `,
    `**Run Started**: ${metrics.startTime.toISOString()}  `,
    `**Steps**: ${metrics.stepCount} | **AI Calls**: ${metrics.totalAiCalls} | **Avg AI Latency**: ${(metrics.avgAiLatencyMs / 1000).toFixed(1)}s`,
    ``,
    `---`,
  );

  // Summary
  if (summary) {
    sections.push(``, `## Executive Summary`, ``, summary, ``);
  }

  // Counts table
  sections.push(
    ``,
    `## Issue Summary`,
    ``,
    `| Category | Count |`,
    `|----------|-------|`,
    `| 🔴 Critical | ${counts.critical} |`,
    `| Failures | ${counts.failures} |`,
    `| Performance | ${counts.performance} |`,
    `| Bugs | ${counts.bugs} |`,
    `| Prompt Quality | ${counts.promptQuality} |`,
    `| **Total** | **${counts.total}** |`,
    ``,
    `---`,
  );

  // Issues by category
  for (const category of ['failure', 'performance', 'bug', 'documentation', 'prompt_quality'] as const) {
    const categoryIssues = issues.filter((i) => i.category === category);
    if (categoryIssues.length === 0) continue;
    sections.push(``, `## ${CATEGORY_LABEL[category]} Issues (${categoryIssues.length})`, ``);
    for (const issue of categoryIssues) {
      sections.push(formatIssue(issue), ``);
    }
    sections.push(`---`);
  }

  // Prompt quality details
  if (promptQuality.length > 0) {
    const belowThreshold = promptQuality.filter((r) => r.issue);
    if (belowThreshold.length > 0) {
      sections.push(``, `## Prompt Quality Details`, ``);
      for (const r of belowThreshold) {
        sections.push(formatPromptQuality(r), ``);
      }
    }
  }

  return sections.join('\n');
}

/**
 * Writes the report to a Markdown file.
 */
export async function writeMarkdownReport(report: AnalysisReport, outputPath: string): Promise<void> {
  await writeFile(outputPath, toMarkdown(report), 'utf8');
}
