/**
 * @file analyze-logs CLI integration tests
 * Covers: happy paths, edge cases, error scenarios
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

describe('analyze-logs --help / -h', () => {
  it('prints help and exits 0 with --help', async () => {
    const { code, stdout } = await runCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('analyze-logs');
    expect(stdout).toContain('--tui');
    expect(stdout).toContain('--json');
    expect(stdout).toContain('--md');
    expect(stdout).toContain('--run');
    expect(stdout).toContain('--skip-prompt-quality');
    expect(stdout).toContain('--skip-summary');
    expect(stdout).toContain('--threshold-config');
    expect(stdout).toContain('Examples:');
  });

  it('prints help and exits 0 with -h', async () => {
    const { code, stdout } = await runCli(['-h']);
    expect(code).toBe(0);
    expect(stdout).toContain('analyze-logs');
    expect(stdout).toContain('--help');
  });
});

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
    const { code, stderr } = await runCli([tmpDir, '--json', '/dev/null']);
    expect(code).toBe(1);
    expect(stderr).toContain('No .ai_workflow/logs directory found');
  });

  it('shows error if no workflow runs found', async () => {
    const { code, stderr } = await runCli([tmpDir, '--json', '/dev/null']);
    expect(code).toBe(1);
    expect(stderr).toContain('No workflow runs found');
  });

  it('uses latest run if no --run specified', async () => {
    const runId = 'workflow_20260101_120000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');

    const { code, stdout } = await runCli([tmpDir, '--json', '/dev/null', '--skip-prompt-quality', '--skip-summary']);
    expect(code).toBe(0);
    expect(stdout).toContain('Using latest run: workflow_20260101_120000');
    expect(stdout).toContain('Running analysis pipeline');
    expect(stdout).toContain('✓ Analysis complete:');
  });

  it('uses --run to select a specific run', async () => {
    const runId = 'workflow_20260102_130000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');

    const { code, stdout } = await runCli([tmpDir, '--run', runId, '--json', '/dev/null', '--skip-prompt-quality', '--skip-summary']);
    expect(code).toBe(0);
    expect(stdout).toContain('Running analysis pipeline');
    expect(stdout).toContain('✓ Analysis complete:');
  });

  it('writes JSON report if --json is specified', async () => {
    const runId = 'workflow_20260103_140000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');

    const outPath = path.join(tmpDir, 'report.json');
    const { code, stdout } = await runCli([tmpDir, '--json', outPath, '--skip-prompt-quality', '--skip-summary']);
    expect(code).toBe(0);
    expect(stdout).toContain('JSON report written to:');
    const file = await fs.readFile(outPath, 'utf8');
    expect(() => JSON.parse(file)).not.toThrow();
    expect(JSON.parse(file)).toHaveProperty('runId');
  });

  it('writes Markdown report if --md is specified', async () => {
    const runId = 'workflow_20260104_150000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');

    const outPath = path.join(tmpDir, 'report.md');
    const { code, stdout } = await runCli([tmpDir, '--md', outPath, '--skip-prompt-quality', '--skip-summary']);
    expect(code).toBe(0);
    expect(stdout).toContain('Markdown report written to:');
    const file = await fs.readFile(outPath, 'utf8');
    expect(file).toContain('# AI Workflow Log Analysis Report');
  });

  it('warns and continues if threshold config cannot be loaded', async () => {
    const runId = 'workflow_20260105_160000';
    const runDir = path.join(logsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'dummy.log'), 'log content');

    const { code, stdout, stderr } = await runCli([tmpDir, '--json', '/dev/null', '--skip-prompt-quality', '--skip-summary', '--threshold-config', 'nonexistent.json']);
    expect(code).toBe(0);
    expect(stderr).toContain('Warning: could not load threshold config');
    expect(stdout).toContain('✓ Analysis complete:');
  });
});
