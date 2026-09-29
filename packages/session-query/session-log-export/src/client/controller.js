import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

const INITIAL = { bySession: {} }

export function sessionLogZipFilename(sessionId) {
  return `freddie-session-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.zip`
}

export function downloadUrl(url, filename) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

function hostBase() {
  const origin = globalThis.location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://freddie.internal'
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export class SessionLogDownloadController {
  store = createSnapshotStore(INITIAL)

  active = new Map()
  disposed = false

  constructor(
    fetcher = (input, init) => fetch(input, init),
    save = downloadUrl,
  ) {
    this.fetcher = fetcher
    this.save = save
  }

  download(sessionId) {
    const existing = this.active.get(sessionId)
    if (existing !== undefined) return existing.done
    if (this.disposed) return Promise.resolve()
    const abort = new AbortController()
    const done = this.run(sessionId, abort.signal).finally(() => {
      this.active.delete(sessionId)
    })
    this.active.set(sessionId, { abort, done })
    return done
  }

  dismiss(sessionId) {
    const current = this.store.getSnapshot().bySession[String(sessionId)]
    if (current === undefined || !current.open) return
    this.publish(sessionId, { ...current, open: false })
  }

  async dispose() {
    this.disposed = true
    const active = [...this.active.values()]
    for (const operation of active) operation.abort.abort()
    await Promise.allSettled(active.map(operation => operation.done))
  }

  async run(sessionId, signal) {
    this.publish(sessionId, { open: true, status: 'downloading', error: null })
    try {
      const url = new URL('/api/session.export', hostBase())
      url.searchParams.set('sessionId', sessionId)
      url.searchParams.set('includeDescendants', 'true')
      const response = await this.fetcher(url, { method: 'HEAD', signal })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Export failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`)
      }
      this.save(url.toString(), sessionLogZipFilename(sessionId))
      const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true
      this.publish(sessionId, { open, status: 'success', error: null })
    } catch (error) {
      if (signal.aborted) return
      const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true
      this.publish(sessionId, { open, status: 'error', error: messageOf(error) })
    }
  }

  publish(sessionId, entry) {
    this.store.update((state) => {
      state.bySession = { ...state.bySession, [String(sessionId)]: entry }
    })
  }
}
