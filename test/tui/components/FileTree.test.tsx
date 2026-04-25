import React from 'react';
import { render } from 'ink-testing-library';
import { FileTree } from './FileTree';

jest.mock('../hooks/useFileTree.js', () => ({
  formatFileSize: (size: number) => `${size}B`,
}));

const baseEntry = {
  key: '1',
  filePath: '/foo',
  label: 'foo',
  depth: 0,
  isDir: false,
  isExpanded: false,
  sizeBytes: 123,
};

describe('FileTree', () => {
  it('renders loading state', () => {
    const { lastFrame } = render(
      <FileTree
        entries={[]}
        selectedIndex={0}
        focused={true}
        loading={true}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('Loading…');
  });

  it('renders error state', () => {
    const { lastFrame } = render(
      <FileTree
        entries={[]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error="Something went wrong"
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('Something went wrong');
  });

  it('renders empty state', () => {
    const { lastFrame } = render(
      <FileTree
        entries={[]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('No run selected');
  });

  it('renders a single file entry (not selected, not open)', () => {
    const entry = { ...baseEntry, key: 'f1', filePath: '/foo', label: 'foo.txt', isDir: false, sizeBytes: 456 };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('foo.txt');
    expect(lastFrame()).toContain('456B');
  });

  it('renders a selected file entry (focused)', () => {
    const entry = { ...baseEntry, key: 'f2', filePath: '/bar', label: 'bar.txt', isDir: false, sizeBytes: 789 };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={true}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('bar.txt');
    expect(lastFrame()).toContain('789B');
    expect(lastFrame()).toContain('▶ FILES');
  });

  it('renders a directory entry (collapsed)', () => {
    const entry = { ...baseEntry, key: 'd1', filePath: '/dir', label: 'dir', isDir: true, isExpanded: false, depth: 1 };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={true}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('▶ dir');
  });

  it('renders a directory entry (expanded)', () => {
    const entry = { ...baseEntry, key: 'd2', filePath: '/dir2', label: 'dir2', isDir: true, isExpanded: true, depth: 0 };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('▼ dir2');
  });

  it('renders an open file entry', () => {
    const entry = { ...baseEntry, key: 'f3', filePath: '/baz', label: 'baz.txt', isDir: false, sizeBytes: 321 };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error={null}
        openedPath={'/baz'}
      />
    );
    expect(lastFrame()).toContain('● baz.txt');
    expect(lastFrame()).toContain('321B');
  });

  it('applies indentation for depth', () => {
    const entry = { ...baseEntry, key: 'deep', filePath: '/deep', label: 'deep.txt', depth: 2, isDir: false };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('    deep.txt');
  });

  it('handles fullWidth prop', () => {
    const entry = { ...baseEntry, key: 'fw', filePath: '/fw', label: 'fw.txt', isDir: false };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={true}
        loading={false}
        error={null}
        openedPath={null}
        fullWidth={true}
      />
    );
    expect(lastFrame()).toContain('fw.txt');
  });

  it('clamps scrollOffset and shows correct visible entries', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ...baseEntry,
      key: `k${i}`,
      filePath: `/f${i}`,
      label: `file${i}.txt`,
      isDir: false,
      sizeBytes: 100 + i,
      depth: 0,
    }));
    // height = 6, so viewportRows = 3
    const { lastFrame } = render(
      <FileTree
        entries={entries}
        selectedIndex={8}
        focused={true}
        loading={false}
        error={null}
        openedPath={null}
        height={6}
      />
    );
    // Should show file7, file8, file9
    expect(lastFrame()).toContain('file7.txt');
    expect(lastFrame()).toContain('file8.txt');
    expect(lastFrame()).toContain('file9.txt');
    expect(lastFrame()).not.toContain('file0.txt');
  });

  it('does not crash if sizeBytes is undefined', () => {
    const entry = { ...baseEntry, key: 'no-size', filePath: '/no-size', label: 'no-size.txt', sizeBytes: undefined };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={false}
        loading={false}
        error={null}
        openedPath={null}
      />
    );
    expect(lastFrame()).toContain('no-size.txt');
  });

  it('renders with negative/zero height gracefully', () => {
    const entry = { ...baseEntry, key: 'neg', filePath: '/neg', label: 'neg.txt' };
    const { lastFrame } = render(
      <FileTree
        entries={[entry]}
        selectedIndex={0}
        focused={true}
        loading={false}
        error={null}
        openedPath={null}
        height={0}
      />
    );
    expect(lastFrame()).toContain('neg.txt');
  });
});
