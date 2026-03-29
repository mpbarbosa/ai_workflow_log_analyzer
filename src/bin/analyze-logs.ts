#!/usr/bin/env node
/**
 * CLI entry point for ai_workflow_log_analyzer.
 * Modes: --tui (default), --json, --md
 * @module bin/analyze-logs
 */

import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';

const program = new Command();

program
  .name('analyze-logs')
  .version('0.1.0')
  .description('Analyze ai_workflow.js execution logs for failures, bugs, prompt quality, and performance issues')
  .argument('[project-root]', 'Root directory of the ai_workflow.js project to analyze', process.cwd())
  .option('--tui', 'Launch interactive TUI dashboard (default)')
  .option('--json [output]', 'Output analysis as JSON (optionally specify output file)')
  .option('--md [output]', 'Output analysis as Markdown (optionally specify output file)')
  .option('--run <run-id>', 'Analyze a specific run ID (e.g. workflow_20260326_224118)')
  .option('--skip-prompt-quality', 'Skip LLM prompt quality analysis (faster, no SDK required)')
  .option('--skip-summary', 'Skip LLM executive summary')
  .option('--threshold-config <path>', 'Path to threshold config JSON/YAML file')
  .action(async (projectRootArg: string, opts: {
    tui?: boolean;
    json?: string | boolean;
    md?: string | boolean;
    run?: string;
    skipPromptQuality?: boolean;
    skipSummary?: boolean;
    thresholdConfig?: string;
  }) => {
    const projectRoot = resolve(projectRootArg);
    const isTui = !opts.json && !opts.md;

    if (isTui || opts.tui) {
      // Launch TUI
      const { startTUI } = await import('../tui/index.js');
      startTUI({ projectRoot, skipPromptQuality: opts.skipPromptQuality });
      return;
    }

    // Non-interactive: find run directory
    const { readdir } = await import('node:fs/promises');
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

    // JSON output
    if (opts.json !== undefined) {
      const { toJson } = await import('../reporters/json_reporter.js');
      const json = toJson(report);
      const outPath = typeof opts.json === 'string' ? opts.json : `analysis-${report.runId}.json`;
      await writeFile(outPath, json, 'utf8');
      console.log(chalk.green(`JSON report written to: ${outPath}`));
    }

    // Markdown output
    if (opts.md !== undefined) {
      const { toMarkdown } = await import('../reporters/markdown_reporter.js');
      const md = toMarkdown(report);
      const outPath = typeof opts.md === 'string' ? opts.md : `analysis-${report.runId}.md`;
      await writeFile(outPath, md, 'utf8');
      console.log(chalk.green(`Markdown report written to: ${outPath}`));
    }
  });

program.parse();
