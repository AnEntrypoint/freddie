import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { watch as chokidarWatch } from 'chokidar'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { Document, parseDocument } from 'yaml'
import { withFileLock, writeFileAtomic } from '@freddie/freddie-atomic-write'
import { canonicalizeWatchPath, resolveFreddieHome } from '@freddie/freddie-home-paths'
import { SettingsProvider, deepEqualJson } from '@freddie/freddie-settings'

const FORMATS = {
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
}

export function resolveSpec(config) {
  const filename = resolve(config.path ?? join(resolveFreddieHome(config.freddieHome), 'settings.yaml'))
  const format = FORMATS[extname(filename)]
  if (format === undefined) {
    throw new Error(`settings-file: extension "${extname(filename)}" is not supported (use .yaml, .yml, or .json)`)
  }
  return {
    filename,
    format,
    watch: config.watch ?? true,
    debounceMs: config.debounceMs ?? 100,
  }
}

function isMapLike(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function patchNode(document, path, current, next) {
  if (isMapLike(current) && isMapLike(next)) {
    for (const key of Object.keys(current)) {
      if (!(key in next)) document.deleteIn([...path, key])
    }
    for (const [key, value] of Object.entries(next)) {
      patchNode(document, [...path, key], current[key], value)
    }
    return
  }
  if (!deepEqualJson(current, next)) document.setIn([...path], next)
}

function isENOENT(error) {
  return (error)?.code === 'ENOENT'
}

function isEEXIST(error) {
  return (error)?.code === 'EEXIST'
}

export class FileSettingsProvider extends SettingsProvider {
  static Config = z.object({
    path: z.string(),
    freddieHome: z.string(),
    watch: z.boolean().default(true),
    debounceMs: z.number().min(0).default(100),
  })

  closed = false

  operations = Promise.resolve()

  isClosed() {
    return this.closed
  }

  constructor(ctx, config) {
    super(ctx)
    this.config = config
    this.spec = resolveSpec(config)
  }

  get writable() {
    return true
  }

  get documentPath() {
    return this.spec.filename
  }

  prepareDocument() {
    return this.enqueue(async () => {
      await mkdir(dirname(this.spec.filename), { recursive: true, mode: 0o700 })
      await withFileLock(this.spec.filename, async () => {
        try {
          await writeFile(this.spec.filename, '', { flag: 'wx', mode: 0o600 })
        } catch (error) {
          if (isEEXIST(error)) return
          throw error
        }
        this.text = ''
        if (!this.isClosed()) this.publish({})
      })
      return this.spec.filename
    })
  }

  async load() {
    let text
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
      this.text = undefined
      return {}
    }
    const doc = this.parse(text)
    this.text = text
    return doc
  }

  persist(ns, section) {
    return this.enqueue(() => this.persistSection(ns, section))
  }

  enqueue(operation) {
    const task = this.operations.then(operation)
    this.operations = task.then(() => undefined, () => undefined)
    return task
  }

  queueRefresh() {
    void this.enqueue(() => this.refresh()).catch((error) => {
      this.ctx.logger.error('settings-file: reload commit failed at %s', this.spec.filename)
      this.ctx.logger.error(error)
    })
  }

  async persistSection(ns, section) {
    await mkdir(dirname(this.spec.filename), { recursive: true, mode: 0o700 })
    await withFileLock(this.spec.filename, async () => {
      await this.reconcileFromDisk()
      const output = this.spec.format === 'yaml'
        ? this.renderYaml(ns, section)
        : this.renderJson(ns, section)
      await writeFileAtomic(this.spec.filename, output, { mode: 0o600, dirMode: 0o700 })
      this.text = output
    })
  }

  async* [Service.init]() {
    yield* super[Service.init]()
    const watcher = this.spec.watch
      ? chokidarWatch(await canonicalizeWatchPath(this.spec.filename), {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: this.spec.debounceMs,
          pollInterval: Math.max(1, Math.min(this.spec.debounceMs, 10)),
        },
      })
      : undefined
    if (watcher !== undefined) {
      watcher.on('all', () => {
        if (this.closed) return
        this.queueRefresh()
      })
      watcher.on('ready', () => {
        if (this.closed) return
        this.queueRefresh()
      })
      watcher.on('error', (error) => {
        this.ctx.logger.warn('settings-file: watcher error on %s', this.spec.filename)
        this.ctx.logger.warn(error)
      })
    }
    yield async () => {
      this.closed = true
      await watcher?.close()
      await this.operations
    }
  }

  parse(text) {
    let root
    if (this.spec.format === 'yaml') {
      const document = parseDocument(text, { prettyErrors: true })
      if (document.errors.length > 0) {
        throw new Error(`settings-file: invalid document at ${this.spec.filename}: ${
          document.errors.map((error) => {
            const at = error.linePos?.[0]
            return `${error.code}${at === undefined ? '' : ` at line ${String(at.line)}, column ${String(at.col)}`}`
          }).join('; ')}`)
      }
      root = document.toJS() ?? {}
    } else {
      root = text.trim().length === 0 ? {} : JSON.parse(text)
    }
    if (typeof root !== 'object' || root === null || Array.isArray(root)) {
      throw new TypeError(`settings-file: ${this.spec.filename} must be a map of namespace sections`)
    }
    return root
  }

  async refresh() {
    if (this.closed) return
    try {
      await this.reconcileFromDisk()
    } catch (error) {
      if ((error)?.code === 'INVARIANT') throw error
      this.ctx.logger.warn('settings-file: reload failed at %s; keeping the last good document', this.spec.filename)
      this.ctx.logger.warn(error)
    }
  }

  async reconcileFromDisk() {
    let text
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
      text = undefined
    }
    if (text === this.text || this.isClosed()) return
    if (text === undefined) {
      this.text = undefined
      this.publish({})
      return
    }
    const doc = this.parse(text)
    this.text = text
    this.publish(doc)
  }

  renderYaml(ns, section) {
    if (this.text === undefined) {
      return new Document({ [ns]: section }).toString()
    }
    const document = parseDocument(this.text)
    const root = document.toJS()
    patchNode(document, [ns], isMapLike(root) ? root[ns] : undefined, section)
    return document.toString()
  }

  renderJson(ns, section) {
    const root = this.text === undefined
      ? {}
      : this.parse(this.text)
    root[ns] = section
    return `${JSON.stringify(root, null, 2)}\n`
  }
}

export default FileSettingsProvider
