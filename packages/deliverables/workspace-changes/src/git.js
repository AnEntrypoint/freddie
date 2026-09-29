import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { parseNumstat } from './numstat.js'
import { canonicalPath, isInside, toPosix } from './paths.js'

const TERMINATE_GRACE_MS = 2_000
const STDERR_TAIL_BYTES = 16 * 1024
const UNREADABLE_FILES_EXIT_CODE = 1


export class GitRunner {
  constructor(subprocess, executable, limits) {
    this.subprocess = subprocess
    this.executable = executable
    this.limits = limits
  }

  async run(args, options) {
    const timeout = AbortSignal.timeout(this.limits.timeoutMs)
    const signal = AbortSignal.any([options.signal, timeout])
    const handle = this.subprocess.spawn({
      argv: [this.executable, ...args],
      cwd: options.cwd,
      stdio: {
        stdin: options.stdin === undefined ? 'ignore' : { data: options.stdin },
        stdout: { maxBytes: options.maxBytes ?? this.limits.outputMaxBytes },
        stderr: { maxBytes: STDERR_TAIL_BYTES },
      },
      graceMs: TERMINATE_GRACE_MS,
      signal,
      env: { GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', ...options.env },
    })
    const outcome = await handle.done
    if (signal.aborted) {
      throw new Error(`git ${args.join(' ')} ${timeout.aborted ? `timed out after ${this.limits.timeoutMs}ms` : 'was aborted'}`)
    }
    const stdout = handle.collected.stdout?.readFrom(0) ?? { text: '', lossy: false }
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    return { exitCode: outcome.exitCode, stdout: stdout.text, stderr, truncated: stdout.lossy }
  }
}

function ok(result, what) {
  if (result.exitCode !== 0) throw new Error(`${what} failed: ${result.stderr.trim()}`)
  return result
}


function isMissing(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

export async function locateGitWorkspace(git, cwd, scratch, signal) {
  const found = await git.run(['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-path', 'objects'], { cwd, signal })
  if (found.exitCode === 128 && /not a git repository/i.test(found.stderr)) return null
  const lines = ok(found, 'git rev-parse').stdout.split('\n').map(line => resolve(cwd, line))
  const [root, gitDir, repositoryObjects] = lines
  const directory = await canonicalPath(await scratch())
  const objects = join(directory, 'objects')
  await mkdir(objects, { recursive: true })
  const excludes = isInside(root, directory) ? [toPosix(relative(root, directory))] : []
  const env = { GIT_OBJECT_DIRECTORY: objects, GIT_ALTERNATE_OBJECT_DIRECTORIES: repositoryObjects }
  return { root, gitDir, scratch: directory, env, excludes }
}

export async function snapshotTree(git, workspace, signal) {
  const scratch = await mkdtemp(join(workspace.scratch, 'index-'))
  try {
    const index = join(scratch, 'index')
    await copyFile(join(workspace.gitDir, 'index'), index).catch((error) => {
      if (!isMissing(error)) throw error
    })
    const env = { ...workspace.env, GIT_INDEX_FILE: index }
    const pathspec = workspace.excludes.length === 0 ? [] : ['--', '.', ...workspace.excludes.map(path => `:(exclude)${path}`)]
    const added = await git.run(['add', '--all', '--ignore-errors', ...pathspec], { cwd: workspace.root, env, signal })
    if (added.exitCode !== UNREADABLE_FILES_EXIT_CODE) ok(added, `git add in ${workspace.root}`)
    return ok(await git.run(['write-tree'], { cwd: workspace.root, env, signal }), 'git write-tree').stdout.trim()
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}


export async function treeBlob(git, workspace, tree, path, signal) {
  const result = ok(await git.run(['ls-tree', '-z', '-l', tree, '--', path], {
    cwd: workspace.root, env: { ...workspace.env, GIT_LITERAL_PATHSPECS: '1' }, signal,
  }), 'git ls-tree')
  const entry = result.stdout.split('\0')[0]
  const match = /^\d+ (\S+) ([0-9a-f]+) +(\d+)\t/.exec(entry)
  if (match === null || match[1] !== 'blob') return null
  return { oid: match[2], size: Number(match[3]) }
}

export async function blobText(git, workspace, oid, maxBytes, signal) {
  const result = ok(await git.run(['cat-file', 'blob', oid], { cwd: workspace.root, env: workspace.env, maxBytes, signal }), 'git cat-file')
  if (result.truncated) throw new Error(`blob ${oid} exceeds ${maxBytes} bytes`)
  return result.stdout
}

export async function diffTrees(git, workspace, before, after, signal) {
  if (before === after) return []
  const result = ok(await git.run(['diff-tree', '-r', '-M', '-z', '--numstat', before, after], {
    cwd: workspace.root, env: workspace.env, signal,
  }), 'git diff-tree')
  if (result.truncated) throw new Error('git diff-tree output exceeded the configured cap')
  return parseNumstat(result.stdout)
}

export async function gitlinkPaths(git, workspace, signal) {
  const result = ok(await git.run(['ls-files', '-z', '--stage'], { cwd: workspace.root, env: workspace.env, signal }), 'git ls-files')
  const links = new Set()
  for (const entry of result.stdout.split('\0')) {
    if (entry.startsWith('160000 ')) links.add(entry.slice(entry.indexOf('\t') + 1))
  }
  return links
}

export async function ignoredPaths(git, workspace, paths, signal) {
  if (paths.length === 0) return new Set()
  const result = await git.run(['check-ignore', '-z', '--stdin'], {
    cwd: workspace.root, env: workspace.env, stdin: `${paths.join('\0')}\0`, signal,
  })
  if (result.exitCode === 1) return new Set()
  return new Set(ok(result, 'git check-ignore').stdout.split('\0').filter(path => path !== ''))
}
