/** TUI entry — renders the Ink App component. */
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { AppProps } from './App.js';
import { setProvider } from '../lib/ai_client.js';

export function startTUI(props: AppProps): void {
  if (props.provider) setProvider(props.provider);
  render(<App {...props} />);
}
