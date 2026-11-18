import { realpathSync } from '@freddie/freddie-runtime/fs'
import { tmpdir } from '@freddie/freddie-runtime/os'

export function canonicalPath(path) {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

export function writableRoots(policy) {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}
