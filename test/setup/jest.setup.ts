/**
 * Jest test setup for ESM-mode test files.
 * @module test/setup/jest.setup
 */

import { jest } from '@jest/globals';
import { createRequire } from 'node:module';

Object.assign(globalThis, {
  jest,
  require: createRequire(import.meta.url),
});
