import { Buffer } from 'node:buffer'
import { throwIfAborted } from './abort.js'

export async function canonicalizeWorkspace(fs, workspaceRoot, signal) {
  throwIfAborted(signal)
  let target
  try {
    target = await fs.resolve(workspaceRoot, signal === undefined ? {} : { signal })
  } catch (error) {
    throwIfAborted(signal)
    throw new Error(`workspace root "${workspaceRoot}" cannot be resolved: ${messageOf(error)}`, { cause: error })
  }
  throwIfAborted(signal)
  const info = await fs.stat(target, signal).catch((error) => {
    throwIfAborted(signal)
    throw error
  })
  throwIfAborted(signal)
  if (info?.type !== 'directory') {
    throw new Error(`workspace root "${workspaceRoot}" is not a directory`)
  }
  return {
    target,
    canonicalPath: fs.processPath(target),
    fileUrl: fs.fileUrl(target),
  }
}

export async function readHostSource(fs, filePath, workspace, maxDocumentBytes, signal) {
  throwIfAborted(signal)
  let target
  try {
    target = await fs.resolve(filePath, {
      cwd: workspace.canonicalPath,
      ...signal === undefined ? {} : { signal },
    })
  } catch (error) {
    throwIfAborted(signal)
    throw new Error(`source "${filePath}" cannot be resolved: ${messageOf(error)}`, { cause: error })
  }
  throwIfAborted(signal)
  if (!fs.contains(workspace.target, target)) {
    throw new Error(`source "${filePath}" resolves outside the workspace`)
  }
  const chunks = []
  let bytes = 0
  try {
    const stream = await fs.streamText(target, signal)
    for await (const chunk of stream) {
      throwIfAborted(signal)
      bytes += Buffer.byteLength(chunk)
      if (bytes > maxDocumentBytes) break
      chunks.push(chunk)
    }
  } catch (error) {
    throwIfAborted(signal)
    throw new Error(`source "${filePath}" could not be read: ${messageOf(error)}`, { cause: error })
  }
  if (bytes > maxDocumentBytes) {
    throw new Error(
      `source "${filePath}" exceeds the ${maxDocumentBytes}-byte limit; reading stopped after ${bytes} bytes`,
    )
  }
  throwIfAborted(signal)
  return {
    fileUrl: fs.fileUrl(target),
    text: chunks.join(''),
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
