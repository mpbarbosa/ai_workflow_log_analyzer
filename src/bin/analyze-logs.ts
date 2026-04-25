#!/usr/bin/env tsx
/**
 * CLI entry point for ai_workflow_log_analyzer.
 * Modes: --tui (default), --json, --md
 * @module bin/analyze-logs
 */

import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { writeFile, readdir, mkdir } from 'node:fs/promises';
import chalk from 'chalk';
import { setProvider } from '../lib/ai_client.js';
import type { AIProvider } from '../lib/ai_client.js';

/**
 * Returns (and creates) the next step directory for a given run's analysis output.
 * Path: <projectRoot>/.ai_workflow/analysis/<runId>/step_<N>
 */
async function resolveAnalysisStepDir(projectRoot: string, runId: string): Promise<string> {
  const analysisRunDir = join(projectRoot, '.ai_workflow', 'analysis', runId);

  let existingSteps: string[] = [];
  try {
    const entries = await readdir(analysisRunDir);
    existingSteps = entries.filter((e) => /^step_\d+$/.test(e));
  } catch {
    // directory doesn't exist yet — start at step_1
  }

  const nextStep =
    existingSteps.length > 0
      ? Math.max(...existingSteps.map((e) => parseInt(e.replace('step_', ''), 10))) + 1
      : 1;

  const stepDir = join(analysisRunDir, `step_${nextStep}`);
  await mkdir(stepDir, { recursive: true });
  return stepDir;
}

const program = new Command();

program
  .name('analyze-logs')
  .version('0.2.1')
  .description('Analyze ai_workflow.js execution logs for failures, bugs, prompt quality, and performance issues')
  .argument('[project-root]', 'Root directory of the ai_workflow.js project to analyze', process.cwd())
  .option('--project <path>', 'Alias for [project-root] positional argument')
  .option('--tui', 'Launch interactive TUI dashboard (default)')
  .option('--json [output]', 'Output analysis as JSON (optionally specify output file)')
  .option('--md [output]', 'Output analysis as Markdown (optionally specify output file)')
  .option('--run <run-id>', 'Analyze a specific run ID (e.g. workflow_20260326_224118)')
  .option('--provider <name>', 'AI provider to use for LLM calls: copilot (default) or claude', 'copilot')
  .option('--skip-prompt-quality', 'Skip LLM prompt quality analysis (faster, no SDK required)')
  .option('--skip-summary', 'Skip LLM executive summary')
  .option('--threshold-config <path>', 'Path to threshold config JSON/YAML file')
  .addHelpText('after', `
Examples:
  # Interactive TUI (default mode)
  $ analyze-logs --tui /path/to/ai-workflow-project
  $ analyze-logs --tui --project /path/to/ai-workflow-project

  # Headless / CI — write reports to files
  $ analyze-logs --json report.json /path/to/project
  $ analyze-logs --md report.md /path/to/project

  # Both formats in one pass (report lands in .ai_workflow/analysis/<run>/step_N/)
  $ analyze-logs --json --md /path/to/project

  # Target a specific run by ID
  $ analyze-logs --run workflow_20260327_012345 --json /path/to/project

  # Use Claude instead of Copilot for LLM-assisted analyses
  $ analyze-logs --provider claude --tui /path/to/project
  $ analyze-logs --provider claude --json report.json /path/to/project

  # Faster: skip LLM-assisted analyses entirely (no provider required)
  $ analyze-logs --skip-prompt-quality --skip-summary --md report.md /path/to/project

  # Custom detection thresholds (JSON or YAML)
  $ analyze-logs --threshold-config thresholds.yaml --json /path/to/project

Notes:
  - Omitting --json and --md always launches the interactive TUI.
  - --json/--md without a file path auto-generates the output path under
    <project-root>/.ai_workflow/analysis/<run-id>/step_<N>/.
  - --skip-prompt-quality also suppresses the executive summary.
  - --provider copilot requires GitHub Copilot CLI authenticated (gh copilot --version).
  - --provider claude requires the Claude CLI configured locally.`)
  .action(async (projectRootArg: string, opts: {
    tui?: boolean;
    project?: string;
    provider?: string;
    json?: string | boolean;
    md?: string | boolean;
    run?: string;
    skipPromptQuality?: boolean;
    skipSummary?: boolean;
    thresholdConfig?: string;
  }) => {
    const projectRoot = resolve(opts.project ?? projectRootArg);
    const provider = (opts.provider === 'claude' ? 'claude' : 'copilot') as AIProvider;
    setProvider(provider);

    const isTui = !opts.json && !opts.md;

    if (isTui || opts.tui) {
      // Launch TUI
      const { startTUI } = await import('../tui/index.js');
      startTUI({ projectRoot, skipPromptQuality: opts.skipPromptQuality, provider });
      return;
    }

    // Non-interactive: find run directory
    let runDir: string;

    if (opts.run) {
      runDir = join(projectRoot, '.ai_workflow', 'logs', opts.run);
    } else {
      // Use latest run
      const logsDir = join(projectRoot, '.ai_workflow', 'logs');
      let entries: string[];
      try {
        entries = await readdir(logsDir);
      } catch {
        console.error(chalk.red(`No .ai_workflow/logs directory found in: ${projectRoot}`));
        process.exit(1);
      }
      const runs = entries.filter((e) => /^workflow_\d{8}_\d{6}$/.test(e)).sort().reverse();
      if (runs.length === 0) {
        console.error(chalk.red('No workflow runs found.'));
        process.exit(1);
      }
      runDir = join(logsDir, runs[0]);
      console.log(chalk.dim(`Using latest run: ${runs[0]}`));
    }

    const metricsDir = join(projectRoot, '.ai_workflow', 'metrics');

    // Load threshold config if provided
    const { DEFAULT_THRESHOLDS } = await import('../types/index.js');
    let thresholds = DEFAULT_THRESHOLDS;
    if (opts.thresholdConfig) {
      try {
        const raw = await import('node:fs/promises').then((fs) => fs.readFile(opts.thresholdConfig!, 'utf8'));
        if (opts.thresholdConfig.endsWith('.yaml') || opts.thresholdConfig.endsWith('.yml')) {
          const yaml = await import('js-yaml');
          thresholds = { ...DEFAULT_THRESHOLDS, ...(yaml.load(raw) as object) };
        } else {
          thresholds = { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
        }
      } catch (e) {
        console.warn(chalk.yellow(`Warning: could not load threshold config: ${e}`));
      }
    }

    const { runAnalysisPipeline } = await import('../lib/pipeline.js');
    console.log(chalk.cyan('Running analysis pipeline…'));

    const report = await runAnalysisPipeline(runDir, metricsDir, {
      thresholds,
      skipPromptQuality: opts.skipPromptQuality,
      skipSummary: opts.skipSummary,
      onProgress: (phase, done, total) => {
        process.stdout.write(`\r${chalk.dim(phase)} ${done}/${total}   `);
      },
    });

    process.stdout.write('\n');
    console.log(chalk.green(`✓ Analysis complete: ${report.counts.total} issues found (${report.counts.critical} critical)`));

    // Lazily resolved on first default-path output; shared between JSON and MD so both land in the same step dir.
    let analysisStepDir: string | undefined;

    // JSON output
    if (opts.json !== undefined) {
      const { toJson } = await import('../reporters/json_reporter.js');
      const json = toJson(report);
      let outPath: string;
      if (typeof opts.json === 'string') {
        outPath = opts.json;
      } else {
        analysisStepDir ??= await resolveAnalysisStepDir(projectRoot, report.runId);
        outPath = join(analysisStepDir, 'report.json');
      }
      await writeFile(outPath, json, 'utf8');
      console.log(chalk.green(`JSON report written to: ${outPath}`));
    }

    // Markdown output
    if (opts.md !== undefined) {
      const { toMarkdown } = await import('../reporters/markdown_reporter.js');
      const md = toMarkdown(report);
      let outPath: string;
      if (typeof opts.md === 'string') {
        outPath = opts.md;
      } else {
        analysisStepDir ??= await resolveAnalysisStepDir(projectRoot, report.runId);
        outPath = join(analysisStepDir, 'report.md');
      }
      await writeFile(outPath, md, 'utf8');
      console.log(chalk.green(`Markdown report written to: ${outPath}`));
    }
  });

program.parse();
