/**
 * JSON Reporter — serializes an AnalysisReport to structured JSON.
 * @module reporters/json_reporter
 */

import { writeFile } from 'node:fs/promises';
import type { AnalysisReport } from '../types/index.js';

/**
 * Returns the analysis report as a formatted JSON string.
 */
export function toJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Writes the report to a JSON file.
 */
export async function writeJsonReport(report: AnalysisReport, outputPath: string): Promise<void> {
  await writeFile(outputPath, toJson(report), 'utf8');
}
