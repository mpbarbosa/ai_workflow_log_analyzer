import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockWriteFile = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  writeFile: mockWriteFile,
}));

const { toJson, writeJsonReport } = await import('../../src/reporters/json_reporter.js');

describe('json_reporter', () => {
  describe('toJson', () => {
    it('serializes a simple AnalysisReport object to pretty JSON', () => {
      const report = { summary: 'ok', issues: [] };
      const json = toJson(report as never);
      expect(json).toBe(JSON.stringify(report, null, 2));
    });

    it('serializes nested objects and arrays', () => {
      const report = {
        summary: 'detailed',
        issues: [
          { id: 1, message: 'foo', details: { severity: 'high' } },
          { id: 2, message: 'bar', details: { severity: 'low' } },
        ],
        meta: { generatedAt: '2026-03-30T15:00:00Z' },
      };
      const json = toJson(report as never);
      expect(json).toBe(JSON.stringify(report, null, 2));
    });

    it('serializes empty object', () => {
      const report = {};
      const json = toJson(report as never);
      expect(json).toBe('{}');
    });

    it('serializes null fields', () => {
      const report = { summary: null, issues: null };
      const json = toJson(report as never);
      expect(json).toBe(JSON.stringify(report, null, 2));
    });
  });

  describe('writeJsonReport', () => {
    beforeEach(() => {
      mockWriteFile.mockReset();
    });

    it('writes the JSON report to the specified file', async () => {
      const report = { summary: 'ok', issues: [] };
      const outputPath = '/tmp/report.json';
      await writeJsonReport(report as never, outputPath);
      expect(mockWriteFile).toHaveBeenCalledWith(
        outputPath,
        JSON.stringify(report, null, 2),
        'utf8'
      );
    });

    it('throws if writeFile fails', async () => {
      const report = { summary: 'fail', issues: [] };
      const outputPath = '/tmp/fail.json';
      mockWriteFile.mockRejectedValueOnce(new Error('disk full'));
      await expect(writeJsonReport(report as never, outputPath)).rejects.toThrow('disk full');
    });

    it('writes empty object as JSON', async () => {
      const report = {};
      const outputPath = '/tmp/empty.json';
      await writeJsonReport(report as never, outputPath);
      expect(mockWriteFile).toHaveBeenCalledWith(outputPath, '{}', 'utf8');
    });
  });
});
