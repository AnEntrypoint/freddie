import { realpathSync } from '@freddie/freddie-runtime/fs'
import { isAbsolute, relative, sep } from '@freddie/freddie-runtime/path'

function containsDirectory(root, candidate) {
  const relation = relative(realpathSync.native(root), realpathSync.native(candidate))
  return relation === '' || (!isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${sep}`))
}

export function assertTempRootOutsideWorkspace(workspaceRoot, tempRoot) {
  if (containsDirectory(workspaceRoot, tempRoot)) {
    throw new Error(`Windows ACL temp root must be outside the workspace: workspace=${workspaceRoot}; temp=${tempRoot}`)
  }
}

export function assertPrivateTempDisjoint(writableDirs, tempDir) {
  for (const writableDir of writableDirs) {
    if (containsDirectory(writableDir, tempDir) || containsDirectory(tempDir, writableDir)) {
      throw new Error(`AclSandbox private temp directory must be disjoint from writable directories: writable=${writableDir}; temp=${tempDir}`)
    }
  }
}
