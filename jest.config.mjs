/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/jest.setup.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          jsx: 'react-jsx',
          jsxImportSource: 'react',
        },
      },
    ],
  },
  testMatch: ['**/test/**/*.test.ts', '**/test/**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.ts', 'src/**/*.tsx', '!src/bin/**'],
  coverageReporters: ['text', 'lcov'],
};
