/** TUI entry — renders the Ink App component. */
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { AppProps } from './App.js';

export function startTUI(props: AppProps): void {
  render(<App {...props} />);
}
