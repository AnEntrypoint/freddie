/** Git working-tree snapshots, tree diffs, and ignore checks through the subprocess capability. */
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { parseNumstat } from './numstat.js'
import { canonicalPath, isInside, toPosix } from './paths.js'

/** Milliseconds a git child gets to exit after termination starts; a fixed lifecycle constant. */
const TERMINATE_GRACE_MS = 2_000
/** Retained stderr tail for diagnostics. */
const STDERR_TAIL_BYTES = 16 * 1024

/**
 * @typedef {{ exitCode: number | null; stdout: string; stderr: string; truncated: boolean }} GitRunResult
 *   Settled git command facts; a nonzero exit is a result, not an exception. `truncated` is true when
 *   stdout exceeded the output cap and lost its head.
 * @typedef {{ cwd: string; env?: Readonly<Record<string, string>>; stdin?: string; maxBytes?: number; signal: AbortSignal }} GitRunOptions
 *   Per-command spawn facts. `maxBytes` is an in-memory stdout cap for this command, replacing the
 *   runner's `outputMaxBytes`.
 * @typedef {{ timeoutMs: number; outputMaxBytes: number }} GitLimits Bounds every git command runs under.
 */

/** Runs one resolved git executable with scrubbed environment, timeout, and bounded output. */
export class GitRunner {
  /**
   * @param {import('@freddie/freddie-subprocess').SubprocessRuntime} subprocess
   * @param {string} executable
   * @param {GitLimits} limits
   */
  constructor(subprocess, executable, limits) {
    this.subprocess = subprocess
    this.executable = executable
    this.limits = limits
  }

  /**
   * Run `git <args>` to completion.
   * @param {readonly string[]} args - git arguments; never shell-interpreted.
   * @param {GitRunOptions} options - working directory, extra environment, stdin data, and cancellation.
   * @returns {Promise<GitRunResult>} exit facts and collected output.
   * @throws when the command times out, is aborted, or cannot spawn.
   */
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
      // The subprocess credential scrub removes ambient GIT_CONFIG_KEY_n entries.
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

/**
 * Reject a failed command with its stderr.
 * @param {GitRunResult} result - settled command facts.
 * @param {string} what - command description for the error message.
 * @returns {GitRunResult} the same result when it exited zero.
 */
function ok(result, what) {
  if (result.exitCode !== 0) throw new Error(`${what} failed: ${result.stderr.trim()}`)
  return result
}

/**
 * @typedef {{ root: string; gitDir: string; scratch: string; env: Readonly<Record<string, string>>; excludes: readonly string[] }} GitWorkspace
 *   The repository enclosing a Session working directory and the private directory its snapshots
 *   write to. `root` is the top-level directory every diff path is relative to; `scratch` holds the
 *   snapshot object store and each snapshot's scratch index; `env` routes object writes to the
 *   private store and object reads through the repository's store; `excludes` are work-tree paths a
 *   snapshot must skip (the private directory when a temporary root lies inside the work tree).
 */

/** Whether a filesystem error names a missing path. */
function isMissing(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

/**
 * Locate the repository enclosing a working directory and prepare the private
 * directory its snapshots write to. The repository's own object store is
 * attached read-only as an alternate, so snapshots read committed content from
 * it and write nothing into it. A private directory that lies inside the work
 * tree, as a temporary root under the workspace does, is excluded from every
 * snapshot. A directory outside any repository yields null; any other git
 * failure throws.
 * @param {GitRunner} git - command runner.
 * @param {string} cwd - absolute Session working directory.
 * @param {() => Promise<string>} scratch - yields the private directory for snapshot objects and scratch indexes; called only for a located repository.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<GitWorkspace | null>} the repository, or null when the directory is not inside one.
 */
export async function locateGitWorkspace(git, cwd, scratch, signal) {
  const found = await git.run(['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-path', 'objects'], { cwd, signal })
  if (found.exitCode === 128 && /not a git repository/i.test(found.stderr)) return null
  const lines = ok(found, 'git rev-parse').stdout.split('\n').map(line => resolve(cwd, line))
  const [root, gitDir, repositoryObjects] = lines
  // git reports the canonical root; compare the private directory in the same spelling.
  const directory = await canonicalPath(await scratch())
  const objects = join(directory, 'objects')
  await mkdir(objects, { recursive: true })
  const excludes = isInside(root, directory) ? [toPosix(relative(root, directory))] : []
  const env = { GIT_OBJECT_DIRECTORY: objects, GIT_ALTERNATE_OBJECT_DIRECTORIES: repositoryObjects }
  return { root, gitDir, scratch: directory, env, excludes }
}

/**
 * Write the complete work tree, including untracked and modified files but
 * not ignored ones, as a tree object through a private index seeded from the
 * repository's index. New blobs and the tree land in the private object store;
 * the repository's index, object store, work tree, and refs stay unchanged,
 * and an in-progress merge keeps its unmerged entries.
 * @param {GitRunner} git - command runner.
 * @param {GitWorkspace} workspace - addressed repository.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<string>} the tree object id.
 */
export async function snapshotTree(git, workspace, signal) {
  const scratch = await mkdtemp(join(workspace.scratch, 'index-'))
  try {
    const index = join(scratch, 'index')
    // A repository without an index yet (fresh `git init`) starts from scratch.
    await copyFile(join(workspace.gitDir, 'index'), index).catch((error) => {
      if (!isMissing(error)) throw error
    })
    const env = { ...workspace.env, GIT_INDEX_FILE: index }
    // `--ignore-errors` skips unreadable files and reports them through exit code 1; the index is still complete.
    const pathspec = workspace.excludes.length === 0 ? [] : ['--', '.', ...workspace.excludes.map(path => `:(exclude)${path}`)]
    const added = await git.run(['add', '--all', '--ignore-errors', ...pathspec], { cwd: workspace.root, env, signal })
    if (added.exitCode !== 1) ok(added, `git add in ${workspace.root}`)
    return ok(await git.run(['write-tree'], { cwd: workspace.root, env, signal }), 'git write-tree').stdout.trim()
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/**
 * @typedef {{ oid: string; size: number }} TreeBlob A blob one snapshot tree holds at a path.
 */

/**
 * The blob a snapshot tree holds at one path.
 * @param {GitRunner} git - command runner.
 * @param {GitWorkspace} workspace - addressed repository.
 * @param {string} tree - snapshot tree id.
 * @param {string} path - slash-separated path relative to the repository root.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<TreeBlob | null>} the blob, or null when the tree holds nothing at the path or holds a gitlink or tree there.
 */
export async function treeBlob(git, workspace, tree, path, signal) {
  // The path is a pathspec; literal matching keeps `*`, `?`, and `[` in a file name from selecting another entry.
  const result = ok(await git.run(['ls-tree', '-z', '-l', tree, '--', path], {
    cwd: workspace.root, env: { ...workspace.env, GIT_LITERAL_PATHSPECS: '1' }, signal,
  }), 'git ls-tree')
  const entry = result.stdout.split('\0')[0]
  const match = /^\d+ (\S+) ([0-9a-f]+) +(\d+)\t/.exec(entry)
  if (match === null || match[1] !== 'blob') return null
  return { oid: match[2], size: Number(match[3]) }
}

/**
 * The text of one blob whose size {@link treeBlob} reported within the cap.
 * @param {GitRunner} git - command runner.
 * @param {GitWorkspace} workspace - addressed repository.
 * @param {string} oid - blob id.
 * @param {number} maxBytes - inclusive byte cap the caller checked the blob's size against.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<string>} the blob decoded as UTF-8.
 */
export async function blobText(git, workspace, oid, maxBytes, signal) {
  const result = ok(await git.run(['cat-file', 'blob', oid], { cwd: workspace.root, env: workspace.env, maxBytes, signal }), 'git cat-file')
  if (result.truncated) throw new Error(`blob ${oid} exceeds ${maxBytes} bytes`)
  return result.stdout
}

/**
 * Per-file line counts between two snapshot trees, with renames detected.
 * @param {GitRunner} git - command runner.
 * @param {GitWorkspace} workspace - addressed repository.
 * @param {string} before - turn-start tree id.
 * @param {string} after - turn-end tree id.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<import('./numstat.js').NumstatEntry[]>} changed files relative to the repository root.
 * @throws when git fails or the output exceeded the cap.
 */
export async function diffTrees(git, workspace, before, after, signal) {
  if (before === after) return []
  const result = ok(await git.run(['diff-tree', '-r', '-M', '-z', '--numstat', before, after], {
    cwd: workspace.root, env: workspace.env, signal,
  }), 'git diff-tree')
  if (result.truncated) throw new Error('git diff-tree output exceeded the configured cap')
  return parseNumstat(result.stdout)
}

/**
 * Work-tree directories the index records as gitlinks: nested repositories and
 * submodules, whose contents snapshots never descend into and `check-ignore`
 * refuses to classify.
 * @param {GitRunner} git - command runner.
 * @param {GitWorkspace} workspace - addressed repository.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<Set<string>>} slash-separated gitlink paths relative to the repository root.
 */
export async function gitlinkPaths(git, workspace, signal) {
  const result = ok(await git.run(['ls-files', '-z', '--stage'], { cwd: workspace.root, env: workspace.env, signal }), 'git ls-files')
  const links = new Set()
  for (const entry of result.stdout.split('\0')) {
    if (entry.startsWith('160000 ')) links.add(entry.slice(entry.indexOf('\t') + 1))
  }
  return links
}

/**
 * The subset of work-tree paths that the repository ignores. Tracked files
 * are never reported, so a tracked file matching an ignore pattern still
 * counts as covered by snapshots.
 * @param {GitRunner} git - command runner.
 * @param {GitWorkspace} workspace - addressed repository.
 * @param {readonly string[]} paths - slash-separated paths relative to the repository root.
 * @param {AbortSignal} signal - cancellation.
 * @returns {Promise<Set<string>>} the ignored members of `paths`.
 */
export async function ignoredPaths(git, workspace, paths, signal) {
  if (paths.length === 0) return new Set()
  const result = await git.run(['check-ignore', '-z', '--stdin'], {
    cwd: workspace.root, env: workspace.env, stdin: `${paths.join('\0')}\0`, signal,
  })
  if (result.exitCode === 1) return new Set()
  return new Set(ok(result, 'git check-ignore').stdout.split('\0').filter(path => path !== ''))
}
