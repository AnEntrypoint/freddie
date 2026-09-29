import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { captureFile, mutationPath, sameCapture } from './capture.js'
import { compareText } from './compare.js'
import {
  blobText, diffTrees, gitlinkPaths, ignoredPaths, locateGitWorkspace, snapshotTree, treeBlob,
} from './git.js'
import { canonicalPath, compareDisplay, displayPathOf, durablePathOf, isInside, isTemporaryPath, temporaryRoots, toPosix } from './paths.js'


function freshState(turn) {
  return { turn, baseline: null, captures: new Map(), lastToolResultSeq: -1, attemptedAfterSeq: -1, recordedAfterSeq: -1 }
}

const OVERSIZED = Symbol('oversized')

export class TurnRecorder {
  constructor(session, cwd, env) {
    this.session = session
    this.cwd = cwd
    this.env = env
    this.chain = Promise.resolve()
    this.state = freshState(0)
    this.paths = undefined
    this.repository = null
    this.scratch = undefined
    this.records = new Map()
    this.lifetime = new AbortController()
  }

  start(turn) {
    const state = freshState(turn)
    this.state = state
    void this.enqueue(async (signal) => {
      try {
        this.paths ??= { cwd: await realpath(this.cwd), home: await canonicalPath(homedir()), temporaryRoots: await temporaryRoots() }
        const repository = await this.locate(this.paths.cwd, signal)
        if (repository === null) return
        const tree = await snapshotTree(repository.git, repository.workspace, signal)
        state.baseline = { ...repository, tree }
      } catch (error) {
        state.baseline = 'failed'
        throw error
      }
    })
  }

  capture(name, args) {
    const path = mutationPath(name, args)
    if (path === undefined) return
    const state = this.state
    void this.enqueue(async () => {
      const paths = this.paths
      if (paths === undefined) return
      const absolute = await canonicalPath(resolve(paths.cwd, path))
      if (state.captures.has(absolute)) return
      const capture = await captureFile(absolute, join(await this.scratchDir(), 'captures'), this.env.maxFileBytes)
      if (capture !== undefined) state.captures.set(absolute, capture)
    })
  }

  observe(event) {
    const state = this.state
    if (event.data.turn === state.turn) state.lastToolResultSeq = event.seq
  }

  stopping(turn) {
    const state = this.state
    if (turn !== state.turn) return Promise.resolve()
    return this.enqueue(signal => this.record(state, signal))
  }

  end(turn) {
    const state = this.state
    if (turn !== state.turn || state.attemptedAfterSeq >= state.lastToolResultSeq) return
    void this.enqueue(signal => this.record(state, signal))
  }

  settled() {
    return this.chain
  }

  summary(seq) {
    return this.records.get(seq)?.summary
  }

  async diff(seq, index, signal) {
    const record = this.records.get(seq)
    const file = record?.summary.files[index]
    const sources = record?.sources[index]
    if (file === undefined || sources === undefined) return undefined
    const { path, display } = file
    if (sources.refusal !== undefined) return { kind: sources.refusal, path, display }
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    try {
      const [before, after] = await Promise.all([this.readSide(sources.before, combined), this.readSide(sources.after, combined)])
      if (before === OVERSIZED || after === OVERSIZED) return { kind: 'oversized', path, display }
      const { hunks, coarse } = compareText(before, after, this.env.diffTimeoutMs)
      return { kind: 'text', path, display, before: before !== null, after: after !== null, hunks, coarse }
    } catch (error) {
      if (this.lifetime.signal.aborted) return undefined
      throw error
    }
  }

  async dispose() {
    this.lifetime.abort()
    this.records.clear()
    await this.chain
    if (this.scratch !== undefined) await rm(await this.scratch, { recursive: true, force: true })
  }

  enqueue(task) {
    const run = this.chain.then(async () => {
      if (this.lifetime.signal.aborted) return
      try {
        await task(this.lifetime.signal)
      } catch (error) {
        this.warnUnlessDisposed(error)
      }
    })
    this.chain = run
    return run
  }

  warnUnlessDisposed(error) {
    if (!this.lifetime.signal.aborted) this.env.warn(`workspace-changes: ${String(error)}`)
  }

  scratchDir() {
    this.scratch ??= mkdtemp(join(this.env.tempRoot, 'freddie-workspace-changes-'))
    return this.scratch
  }

  async locate(cwd, signal) {
    if (this.repository !== null) return this.repository
    const git = await this.env.git
    if (git === null) return null
    const workspace = await locateGitWorkspace(git, cwd, () => this.scratchDir(), signal)
    if (workspace === null) return null
    this.repository = { git, workspace }
    return this.repository
  }

  async readSide(source, signal) {
    switch (source.kind) {
      case 'absent': return null
      case 'file': return readFile(source.file, { encoding: 'utf8', signal })
      case 'snapshot': {
        const { git, workspace } = source.repository
        const blob = await treeBlob(git, workspace, source.tree, source.path, signal)
        if (blob === null) return null
        if (blob.size > this.env.maxFileBytes) return OVERSIZED
        return blobText(git, workspace, blob.oid, this.env.maxFileBytes, signal)
      }
      default: return null
    }
  }

  async record(state, signal) {
    const paths = this.paths
    const { baseline } = state
    if (paths === undefined || baseline === 'failed' || state.lastToolResultSeq < 0) return
    state.attemptedAfterSeq = state.lastToolResultSeq
    const root = baseline?.workspace.root ?? paths.cwd
    const listed = new Map()
    let snapshot
    if (baseline !== null) {
      const after = await snapshotTree(baseline.git, baseline.workspace, signal)
      snapshot = { before: baseline.tree, after }
      const repository = { git: baseline.git, workspace: baseline.workspace }
      for (const entry of await diffTrees(baseline.git, baseline.workspace, baseline.tree, after, signal)) {
        const absolute = resolve(root, entry.path)
        listed.set(absolute, {
          file: changedFile(paths, root, absolute, entry),
          sources: entry.binary ? { refusal: 'binary' } : {
            before: { kind: 'snapshot', repository, tree: baseline.tree, path: entry.oldPath ?? entry.path },
            after: { kind: 'snapshot', repository, tree: after, path: entry.path },
          },
        })
      }
    }
    const captured = [...state.captures.keys()].filter(absolute => !listed.has(absolute))
    const workTreePath = absolute => toPosix(relative(root, absolute))
    let inWorkspace = captured.filter(absolute => isInside(root, absolute))
    if (baseline !== null && inWorkspace.length > 0) {
      const gitlinks = await gitlinkPaths(baseline.git, baseline.workspace, signal)
      inWorkspace = inWorkspace.filter(absolute => ![...gitlinks].some(link => isInside(resolve(root, link), absolute)))
    }
    const uncoveredInWorkspace = baseline === null
      ? new Set(inWorkspace.map(workTreePath))
      : await ignoredPaths(baseline.git, baseline.workspace, inWorkspace.map(workTreePath), signal)
    for (const absolute of captured) {
      const uncovered = isInside(root, absolute)
        ? uncoveredInWorkspace.has(workTreePath(absolute))
        : !isTemporaryPath(absolute, paths.temporaryRoots)
      if (!uncovered) continue
      const before = state.captures.get(absolute)
      const after = await captureFile(absolute, join(await this.scratchDir(), 'captures'), this.env.maxFileBytes)
      if (after === undefined || sameCapture(before, after)) continue
      listed.set(absolute, await this.compared(paths, root, absolute, before, after))
    }
    const sorted = [...listed.values()].sort((a, b) => compareDisplay(a.file, b.file))
    if (sorted.length === 0 && state.recordedAfterSeq < 0) return
    const event = this.session.append('workspace/changes', { turn: state.turn }, { ignorable: true })
    const kept = sorted.slice(0, this.env.maxFiles)
    this.records.set(event.seq, {
      summary: {
        turn: state.turn,
        cwd: this.cwd,
        files: kept.map(entry => entry.file),
        total: sorted.length,
        added: sorted.reduce((sum, entry) => sum + entry.file.added, 0),
        deleted: sorted.reduce((sum, entry) => sum + entry.file.deleted, 0),
        ...snapshot === undefined ? {} : { snapshot },
      },
      sources: kept.map(entry => entry.sources),
    })
    state.recordedAfterSeq = event.seq
  }

  async compared(paths, root, absolute, before, after) {
    const list = (counts, sources) => ({ file: changedFile(paths, root, absolute, counts), sources })
    if (before.kind === 'oversized' || after.kind === 'oversized') {
      return list({ added: 0, deleted: 0, binary: false, oversized: true }, { refusal: 'oversized' })
    }
    if (isBinary(before) || isBinary(after)) return list({ added: 0, deleted: 0, binary: true }, { refusal: 'binary' })
    const text = side => side.kind === 'file' ? readFile(side.file, 'utf8') : null
    const { added, deleted } = compareText(await text(before), await text(after), this.env.diffTimeoutMs)
    return list({ added, deleted, binary: false }, { before, after })
  }
}

function isBinary(capture) {
  return capture.kind === 'file' && capture.binary
}

function changedFile({ cwd, home }, root, absolute, counts) {
  return {
    path: durablePathOf(absolute, cwd),
    display: displayPathOf(absolute, cwd, root, home),
    added: counts.added,
    deleted: counts.deleted,
    ...counts.binary ? { binary: true } : {},
    ...counts.oversized === true ? { oversized: true } : {},
  }
}
