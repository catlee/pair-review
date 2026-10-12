// Copyright 2026 Tim Perkins (tjwp) | SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

const { createChangedFilePredicate, changedFileEntryPath, partitionByChangedFile } = require('../../src/utils/changed-file-membership');

describe('createChangedFilePredicate', () => {
  it('returns the canonical changed-file path for normalized spellings', () => {
    const resolve = createChangedFilePredicate(['src/a.js', { file: './src/b.js' }]);
    expect(resolve('src/a.js')).toBe('src/a.js');
    expect(resolve('./src/a.js')).toBe('src/a.js');
    expect(resolve('/src/a.js')).toBe('src/a.js');
    expect(resolve('src//a.js')).toBe('src/a.js');
    expect(resolve('src/b.js')).toBe('./src/b.js');
    expect(resolve('src/c.js')).toBeNull();
  });

  // The entry's own path comes back, never the normalized lookup key:
  // normalizing trims whitespace, which is legal in git file names.
  it('returns the entry path itself, keeping surrounding whitespace', () => {
    const resolve = createChangedFilePredicate([{ file: 'docs/notes.md ' }]);
    expect(resolve('docs/notes.md ')).toBe('docs/notes.md ');
    expect(resolve('./docs/notes.md ')).toBe('docs/notes.md ');

    const both = createChangedFilePredicate(['docs/notes.md ', 'docs/notes.md']);
    expect(both('docs/notes.md ')).toBe('docs/notes.md ');
    expect(both('docs/notes.md')).toBe('docs/notes.md');
  });

  it('accepts git numstat, GitHub API and plain-string entries', () => {
    const resolve = createChangedFilePredicate(['plain.js', { file: 'git.js' }, { filename: 'github.js' }]);
    expect(resolve('plain.js')).toBe('plain.js');
    expect(resolve('git.js')).toBe('git.js');
    expect(resolve('github.js')).toBe('github.js');
  });

  // Regression: a real file named like a git rename must not be rewritten to
  // its "destination". 7fb94d12 resolved "a => b.md" to "b.md".
  it('treats " => " and "{a => b}" in paths as literal file names', () => {
    const literal = createChangedFilePredicate(['a => b.md', 'src/{x => y}.md']);
    expect(literal('a => b.md')).toBe('a => b.md');
    expect(literal('src/{x => y}.md')).toBe('src/{x => y}.md');
    expect(literal('b.md')).toBeNull();
    expect(literal('src/y.md')).toBeNull();

    const destinationOnly = createChangedFilePredicate(['b.md']);
    expect(destinationOnly('a => b.md')).toBeNull();
  });

  it('rejects empty, missing and parent-relative paths', () => {
    const resolve = createChangedFilePredicate(['src/a.js']);
    expect(resolve('')).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
    expect(resolve('../src/a.js')).toBeNull();
  });

  it('recovers paths from the diff when metadata is missing or abbreviated', () => {
    const diff = 'diff --git a/src/full/path/file.js b/src/full/path/file.js\n--- a/src/full/path/file.js\n+++ b/src/full/path/file.js\n';
    const resolve = createChangedFilePredicate([{ file: 'src/.../file.js' }], diff);
    expect(resolve('src/full/path/file.js')).toBe('src/full/path/file.js');
    expect(resolve('src/.../file.js')).toBeNull();
  });

  it('reports unknown membership for an empty or missing list', () => {
    expect(createChangedFilePredicate([]).hasChangedFiles).toBe(false);
    expect(createChangedFilePredicate(null).hasChangedFiles).toBe(false);
    expect(createChangedFilePredicate(null)('a.js')).toBeNull();
    expect(createChangedFilePredicate(['a.js']).hasChangedFiles).toBe(true);
  });
});

describe('changedFileEntryPath', () => {
  it('reads the path of each entry shape', () => {
    expect(changedFileEntryPath('a.js')).toBe('a.js');
    expect(changedFileEntryPath({ file: 'b.js' })).toBe('b.js');
    expect(changedFileEntryPath({ filename: 'c.js' })).toBe('c.js');
    expect(changedFileEntryPath({ path: 'd.js' })).toBe('d.js');
    expect(changedFileEntryPath({})).toBeNull();
    expect(changedFileEntryPath(null)).toBeNull();
  });
});

describe('partitionByChangedFile', () => {
  it('splits items on changed files from items outside the diff', () => {
    const changed = { id: 1, file: './src/a.js' };
    const unchanged = { id: 2, file: 'src/other.js' };
    const result = partitionByChangedFile([changed, unchanged], ['src/a.js']);

    expect(result.membershipKnown).toBe(true);
    expect(result.inDiff).toEqual([{ id: 1, file: 'src/a.js' }]);
    expect(result.outsideDiff).toEqual([unchanged]);
    expect(changed.file).toBe('./src/a.js');
  });

  it('keeps the same object when the path is already canonical', () => {
    const item = { id: 1, file: 'src/a.js' };
    expect(partitionByChangedFile([item], ['src/a.js']).inDiff[0]).toBe(item);
  });

  it('recovers changed files from the diff', () => {
    const diff = 'diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n';
    const result = partitionByChangedFile([{ file: 'src/a.js' }, { file: 'src/b.js' }], [], diff);
    expect(result.membershipKnown).toBe(true);
    expect(result.inDiff).toEqual([{ file: 'src/a.js' }]);
    expect(result.outsideDiff).toEqual([{ file: 'src/b.js' }]);
  });

  it('keeps every item unchanged when the changed-file list is unknown', () => {
    const items = [{ id: 1, file: 'src/a.js' }, { id: 2, file: './src/b.js' }];
    for (const changedFiles of [[], null, undefined]) {
      const result = partitionByChangedFile(items, changedFiles, '');
      expect(result).toEqual({ inDiff: items, outsideDiff: [], membershipKnown: false });
      expect(result.inDiff).not.toBe(items);
    }
  });

  it('handles a missing item list', () => {
    expect(partitionByChangedFile(null, ['a.js'])).toEqual({ inDiff: [], outsideDiff: [], membershipKnown: true });
    expect(partitionByChangedFile(undefined, [])).toEqual({ inDiff: [], outsideDiff: [], membershipKnown: false });
  });

  it('treats items without a file as outside a known diff', () => {
    expect(partitionByChangedFile([{ id: 1 }, null], ['a.js']).outsideDiff).toEqual([{ id: 1 }, null]);
  });
});
