/**
 * Shared path resolution and regular-file validation for model-facing read tools.
 * @module @freddie/freddie-tool-fs/src/read-target
 */

import { FsError } from '@freddie/freddie-fs'
import { sessionResolveOptions } from './session-cwd.js'

/**
 * One directory's immediate (non-recursive) entries, name-sorted, as a
 * plain-text listing -- inlined into the "it's a directory" error below so a
 * model that guessed a directory path gets the listing in the SAME turn,
 * without needing a second tool call to a different tool. Hidden entries
 * (dotfiles) and `node_modules` are skipped, matching the convention
 * str_replace_editor's own directory view already uses. Deliberately shallow
 * (unlike that tool's 2-level recursive view): `read`'s job is inspecting one
 * path, not browsing a tree, so this only ever needs to disambiguate "which
 * file did you mean" for the one directory actually requested.
 */
async function formatDirectoryListing(ctx, target, exec) {
  const entries = await ctx.fs.listDir(target, exec.signal)
  const names = entries
    .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map(entry => `${entry.type === 'directory' ? 'd' : 'f'}\t${entry.name}`)
    .sort((left, right) => left.slice(2).localeCompare(right.slice(2)))
  if (names.length === 0) return '(empty directory)'
  return names.join('\n')
}

/**
 * Resolve a model-supplied path, observe absence, and require a regular file.
 * @param ctx - the plugin context providing filesystem resolution and observation events.
 * @param exec - the current tool execution, including session cwd and cancellation.
 * @param requestedPath - the raw path supplied to the tool.
 * @returns the resolved target and its single stat result.
 */
export async function resolveRegularReadTarget(ctx, exec, requestedPath) {
  const target = await ctx.fs.resolve(requestedPath, sessionResolveOptions(exec, requestedPath))
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) {
    ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
    throw new FsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
  }
  if (info.type === 'directory') {
    const listing = await formatDirectoryListing(ctx, target, exec)
    throw new FsError(
      `cannot read "${target.displayPath}": it is a directory, not a file. Its contents:\n${listing}`,
      'FS_NOT_REGULAR_FILE',
    )
  }
  if (info.type !== 'file') {
    throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
  }
  return { target, info }
}
