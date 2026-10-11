// Copyright 2026 Tim Perkins (tjwp) | SPDX-License-Identifier: Apache-2.0
/**
 * The one "is this file part of the review's diff?" check.
 *
 * Suggestion validation, context-file seeding, comment auto-context and
 * GitHub submission all ask the same question, so they share this predicate.
 * Both sides are compared through `normalizePath` (so `./a.js` and `a.js`
 * agree). Nothing else is rewritten: a path containing ` => ` or `{a => b}`
 * is a literal file name here, never Git rename syntax. A real file named
 * `a => b.md` therefore matches only the changed-file entry `a => b.md`.
 */
const { normalizePath } = require('./paths');
const { mergeChangedFilesWithDiff } = require('./diff-file-list');

/**
 * Path of a changed_files entry: a plain string, a git numstat entry
 * (`file`) or a GitHub API entry (`filename`).
 * @param {object|string} entry
 * @returns {string|null}
 */
function changedFileEntryPath(entry) {
  if (typeof entry === 'string') return entry;
  const filePath = entry?.file ?? entry?.filename ?? entry?.path;
  return typeof filePath === 'string' ? filePath : null;
}

/**
 * Build a resolver that maps a file path to its changed-file entry.
 *
 * @param {Array<object|string>|null} changedFiles - changed_files entries or paths
 * @param {string} [diff] - Full unified diff; recovers entries missing from changedFiles
 * @returns {((file: string) => string|null) & { hasChangedFiles: boolean }}
 *   Returns the canonical changed_files entry path for a changed file, or null.
 *   `hasChangedFiles` is false when the list is empty, meaning membership is
 *   unknown rather than "nothing changed".
 */
function createChangedFilePredicate(changedFiles, diff = '') {
  const entries = diff
    ? mergeChangedFilesWithDiff(changedFiles, diff)
    : (Array.isArray(changedFiles) ? changedFiles : []);

  // Entry paths are git's own spelling; normalizing only drops a stray
  // leading "./" or doubled slash.
  const changedPaths = new Set(
    entries.map(entry => normalizePath(changedFileEntryPath(entry))).filter(Boolean)
  );

  const resolve = file => {
    const key = normalizePath(file);
    return key && changedPaths.has(key) ? key : null;
  };
  resolve.hasChangedFiles = changedPaths.size > 0;
  return resolve;
}

module.exports = { createChangedFilePredicate, changedFileEntryPath };
