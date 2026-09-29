import { canonicalPath } from '@freddie/freddie-sandbox'

const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

export function sessionCwd(exec, requestedPath) {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  return canonicalPath(cwd)
}

export function sessionResolveOptions(exec, requestedPath, policyWorkspaceRoot) {
  const cwd = policyWorkspaceRoot ?? sessionCwd(exec, requestedPath)
  return {
    ...cwd !== undefined ? { cwd } : {},
    signal: exec.signal,
  }
}
