import { FsError } from '@freddie/freddie-fs'
import { sessionResolveOptions } from './session-cwd.js'

async function formatDirectoryListing(ctx, target, exec) {
  const entries = await ctx.fs.listDir(target, exec.signal)
  const names = entries
    .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map(entry => `${entry.type === 'directory' ? 'd' : 'f'}\t${entry.name}`)
    .sort((left, right) => left.slice(2).localeCompare(right.slice(2)))
  if (names.length === 0) return '(empty directory)'
  return names.join('\n')
}

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
