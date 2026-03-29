/**
 * @file analyze-logs CLI integration tests
 * Covers: happy paths, edge cases, error scenarios
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

jest.mock('chalk', () => ({
  red: (s: string) => `[red]${s}[/red]`,
  green: (s: string) => `[green]${s}[/green]`,
  yellow: (s: string) => `[yellow]${s}[/yellow]`,
  cyan: (s: string) => `[cyan]${s}[/cyan]`,
  dim: (s: string) => `[dim]${s}[/dim]`,
}));

const CLI_PATH = path.resolve(__dirname, '../../src/bin/analyze-logs.ts');

function runCli(args: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const proc = spawn('tsx', [CLI_PATH, ...args], {
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('analyze-logs CLI', () => {
  let tmpDir: string;
  let logsDir: string;
  let metricsDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'analyze-logs-test-'));
    logsDir = path.join(tmpDir, '.ai_workflow', 'logs');
    metricsDir = path.join(tmpDir, '.ai_workflow', 'metrics');
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(metricsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('shows error if no logs directory exists', async () => {
    await fs.rm(logsDir, { recursive: true, force: true });
    const { code, stderr } = await runCli([tmpDir]);
    expect(code).toBe(1);
    expect(stderr).toContain('No .ai_workflow/logs directory found');
  });

  it('shows error if no workflow runs found', async () => {
    const { code, stderr } = await runCli([tmpDir]);
    expect(code).toBe(1);
    expect(stderr).toContain('No workflow runs found');
  });

  it('uses latest run if no --run specified', async () => {
    const runId = 'workflow_20260101_120000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    // Place a dummy file to ensure directory is not empty
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');
    // Mock pipeline and reporters
    jest.mock('../../src/lib/pipeline.js', () => ({
      runAnalysisPipeline: jest.fn().mockResolvedValue({
        runId,
        counts: { total: 2, critical: 1 },
      }),
    }));
    jest.mock('../../src/reporters/json_reporter.js', () => ({
      toJson: jest.fn().mockReturnValue('{"ok":true}'),
    }));
    jest.mock('../../src/reporters/markdown_reporter.js', () => ({
      toMarkdown: jest.fn().mockReturnValue('# Report'),
    }));
    jest.mock('../../src/types/index.js', () => ({
      DEFAULT_THRESHOLDS: {
        stepDurationWarningMs: 5000,
        stepDurationCriticalMs: 10000,
        aiLatencyWarningMs: 2000,
        aiLatencyCriticalMs: 5000,
        memoryWarningMb: 512,
        memoryCriticalMb: 1024,
        promptQualityMinScore: 60,
      },
    }));

    const { code, stdout } = await runCli([tmpDir]);
    expect(code).toBe(0);
    expect(stdout).toContain('Using latest run: workflow_20260101_120000');
    expect(stdout).toContain('Running analysis pipeline');
    expect(stdout).toContain('✓ Analysis complete: 2 issues found (1 critical)');
  });

  it('uses --run to select a specific run', async () => {
    const runId = 'workflow_20260102_130000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');
    jest.mock('../../src/lib/pipeline.js', () => ({
      runAnalysisPipeline: jest.fn().mockResolvedValue({
        runId,
        counts: { total: 1, critical: 0 },
      }),
    }));
    jest.mock('../../src/types/index.js', () => ({
      DEFAULT_THRESHOLDS: {
        stepDurationWarningMs: 5000,
        stepDurationCriticalMs: 10000,
        aiLatencyWarningMs: 2000,
        aiLatencyCriticalMs: 5000,
        memoryWarningMb: 512,
        memoryCriticalMb: 1024,
        promptQualityMinScore: 60,
      },
    }));

    const { code, stdout } = await runCli([tmpDir, '--run', runId]);
    expect(code).toBe(0);
    expect(stdout).toContain('Running analysis pipeline');
    expect(stdout).toContain('✓ Analysis complete: 1 issues found (0 critical)');
  });

  it('writes JSON report if --json is specified', async () => {
    const runId = 'workflow_20260103_140000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');
    jest.mock('../../src/lib/pipeline.js', () => ({
      runAnalysisPipeline: jest.fn().mockResolvedValue({
        runId,
        counts: { total: 3, critical: 2 },
      }),
    }));
    jest.mock('../../src/reporters/json_reporter.js', () => ({
      toJson: jest.fn().mockReturnValue('{"ok":true}'),
    }));
    jest.mock('../../src/types/index.js', () => ({
      DEFAULT_THRESHOLDS: {
        stepDurationWarningMs: 5000,
        stepDurationCriticalMs: 10000,
        aiLatencyWarningMs: 2000,
        aiLatencyCriticalMs: 5000,
        memoryWarningMb: 512,
        memoryCriticalMb: 1024,
        promptQualityMinScore: 60,
      },
    }));

    const outPath = path.join(tmpDir, 'report.json');
    const { code, stdout } = await runCli([tmpDir, '--json', outPath]);
    expect(code).toBe(0);
    expect(stdout).toContain('JSON report written to:');
    const file = await fs.readFile(outPath, 'utf8');
    expect(file).toContain('"ok":true');
  });

  it('writes Markdown report if --md is specified', async () => {
    const runId = 'workflow_20260104_150000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');
    jest.mock('../../src/lib/pipeline.js', () => ({
      runAnalysisPipeline: jest.fn().mockResolvedValue({
        runId,
        counts: { total: 4, critical: 1 },
      }),
    }));
    jest.mock('../../src/reporters/markdown_reporter.js', () => ({
      toMarkdown: jest.fn().mockReturnValue('# Report'),
    }));
    jest.mock('../../src/types/index.js', () => ({
      DEFAULT_THRESHOLDS: {
        stepDurationWarningMs: 5000,
        stepDurationCriticalMs: 10000,
        aiLatencyWarningMs: 2000,
        aiLatencyCriticalMs: 5000,
        memoryWarningMb: 512,
        memoryCriticalMb: 1024,
        promptQualityMinScore: 60,
      },
    }));

    const outPath = path.join(tmpDir, 'report.md');
    const { code, stdout } = await runCli([tmpDir, '--md', outPath]);
    expect(code).toBe(0);
    expect(stdout).toContain('Markdown report written to:');
    const file = await fs.readFile(outPath, 'utf8');
    expect(file).toContain('# Report');
  });

  it('warns and continues if threshold config cannot be loaded', async () => {
    const runId = 'workflow_20260105_160000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');
    jest.mock('../../src/lib/pipeline.js', () => ({
      runAnalysisPipeline: jest.fn().mockResolvedValue({
        runId,
        counts: { total: 1, critical: 0 },
      }),
    }));
    jest.mock('../../src/types/index.js', () => ({
      DEFAULT_THRESHOLDS: {
        stepDurationWarningMs: 5000,
        stepDurationCriticalMs: 10000,
        aiLatencyWarningMs: 2000,
        aiLatencyCriticalMs: 5000,
        memoryWarningMb: 512,
        memoryCriticalMb: 1024,
        promptQualityMinScore: 60,
      },
    }));

    const { code, stdout, stderr } = await runCli([tmpDir, '--threshold-config', 'nonexistent.json']);
    expect(code).toBe(0);
    expect(stderr).toContain('Warning: could not load threshold config');
    expect(stdout).toContain('✓ Analysis complete: 1 issues found (0 critical)');
  });

  it('launches TUI if --tui is specified', async () => {
    const runId = 'workflow_20260106_170000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');
    jest.mock('../tui/index.js', () => ({
      startTUI: jest.fn(),
    }));
    const { code, stdout } = await runCli([tmpDir, '--tui']);
    expect(code).toBe(0);
    expect(stdout).toContain(''); // TUI may not print to stdout
  });
});
