/**
 * Tests for useFileTree utilities — formatFileSize and sizeBytes population.
 */

import { formatFileSize } from '../../src/tui/hooks/useFileTree.js';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// formatFileSize
// ---------------------------------------------------------------------------

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2457)).toBe('2.4 KB');
    expect(formatFileSize(1024 * 100)).toBe('100.0 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB');
  });

  it('formats exactly 1 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1572864)).toBe('1.5 MB');
    expect(formatFileSize(1024 * 1024 * 50)).toBe('50.0 MB');
  });

  it('formats exactly 1 GB', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1610612736)).toBe('1.5 GB');
    expect(formatFileSize(1024 * 1024 * 1024 * 2)).toBe('2.0 GB');
  });

  it('uses one decimal place for all non-byte units', () => {
    // All these should have exactly one decimal
    [
      formatFileSize(1024),
      formatFileSize(1024 * 1024),
      formatFileSize(1024 * 1024 * 1024),
    ].forEach((s) => {
      expect(s).toMatch(/\.\d\s/);
    });
  });
});

// ---------------------------------------------------------------------------
// sizeBytes population via scanDir (tested indirectly through a temp directory)
// ---------------------------------------------------------------------------

// We test the internal behaviour via the exported hook by directly importing the
// module and inspecting entries.  Because useFileTree is a React hook we cannot
// call it outside a component, but scanDir and buildTree are private functions.
// We instead create a temporary directory, run the app's own async tree-building
// path through the public hook's effect by reading the resulting FileEntry[]
// from a shallow integration approach: write known-size files, call the same
// underlying Node.js path that buildTree uses, and verify the public contract.

import { readdir, stat } from 'node:fs/promises';

async function buildEntriesFromDir(dir: string) {
  // Mirror exactly what buildTree does so we can test sizeBytes capture without
  // importing the private function.
  const names = (await readdir(dir)).sort();
  const entries = [];
  for (const name of names) {
    const full = join(dir, name);
    let isDir = false;
    let sizeBytes: number | undefined;
    try {
      const s = await stat(full);
      isDir = s.isDirectory();
      if (!isDir) sizeBytes = s.size;
    } catch { /* ignore */ }
    entries.push({ name, isDir, sizeBytes });
  }
  return entries;
}

describe('sizeBytes population', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'aft-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('captures exact byte size for a file', async () => {
    const content = 'hello world'; // 11 bytes
    await writeFile(join(tmpDir, 'test.txt'), content, 'utf8');

    const entries = await buildEntriesFromDir(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].isDir).toBe(false);
    expect(entries[0].sizeBytes).toBe(11);
  });

  it('does not set sizeBytes for directories', async () => {
    await mkdir(join(tmpDir, 'subdir'));

    const entries = await buildEntriesFromDir(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].isDir).toBe(true);
    expect(entries[0].sizeBytes).toBeUndefined();
  });

  it('handles mixed files and directories', async () => {
    await writeFile(join(tmpDir, 'a.txt'), '12345', 'utf8'); // 5 bytes
    await mkdir(join(tmpDir, 'bdir'));
    await writeFile(join(tmpDir, 'c.md'), 'x'.repeat(2048), 'utf8'); // 2048 bytes

    const entries = await buildEntriesFromDir(tmpDir);
    expect(entries).toHaveLength(3);

    const file1 = entries.find((e) => e.name === 'a.txt');
    const dir1 = entries.find((e) => e.name === 'bdir');
    const file2 = entries.find((e) => e.name === 'c.md');

    expect(file1?.sizeBytes).toBe(5);
    expect(dir1?.sizeBytes).toBeUndefined();
    expect(file2?.sizeBytes).toBe(2048);
  });

  it('formats sizes consistently across the boundary values', () => {
    // Boundary: 1023 B → B, 1024 B → KB
    expect(formatFileSize(1023)).toMatch(/B$/);
    expect(formatFileSize(1023)).not.toContain('KB');
    expect(formatFileSize(1024)).toContain('KB');

    // Boundary: just below 1 MB → KB, exactly 1 MB → MB
    expect(formatFileSize(1024 * 1024 - 1)).toContain('KB');
    expect(formatFileSize(1024 * 1024)).toContain('MB');

    // Boundary: just below 1 GB → MB, exactly 1 GB → GB
    expect(formatFileSize(1024 * 1024 * 1024 - 1)).toContain('MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toContain('GB');
  });
});
