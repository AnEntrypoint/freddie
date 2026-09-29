import { applyDiff, createElement as h } from '@freddie/webjsx'
import { defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './WorkspaceFilesView.css.js'
import {
  IMAGE_WINDOW_BYTES, MAX_PREVIEW_LINES, base64ToBytes, compareEntries, describeFailure, formatBytes,
  imageMimeOf, isKnownBinary, joinPath,
} from './file-kinds.js'

const ROOT = ''
const TITLE_ID = 'freddie-workspace-files-title'
const PREVIEW_TITLE_ID = 'freddie-workspace-files-preview-title'

export class FreddieWorkspaceFilesView extends HTMLElement {
  #props = null
  #sessionId = null
  #epoch = 0
  #hostOnly = false
  #levels = new Map()
  #expanded = new Set()
  #nodes = new Map()
  #order = []
  #focusId = null
  #focusWanted = false
  #selected = null
  #preview = { status: 'idle' }
  #previewSeq = 0
  #imageUrl = null

  setProps(props) {
    const changedSession = this.#sessionId !== props.sessionId
    this.#props = props
    if (changedSession) {
      this.#reset()
      this.#sessionId = props.sessionId
    }
    this.#ensureRoot()
    this.#render()
  }

  connectedCallback() {
    this.#ensureRoot()
    this.#render()
  }

  disconnectedCallback() {
    this.#reset()
  }

  #reset() {
    this.#epoch += 1
    this.#previewSeq += 1
    this.#revokeImage()
    this.#hostOnly = false
    this.#levels = new Map()
    this.#expanded = new Set()
    this.#nodes = new Map()
    this.#order = []
    this.#focusId = null
    this.#selected = null
    this.#preview = { status: 'idle' }
  }

  #ensureRoot() {
    if (this.#props === null || typeof this.#props.list !== 'function') return
    if (this.#hostOnly || this.#levels.has(ROOT)) return
    void this.#loadLevel(ROOT)
  }

  async #call(work) {
    try {
      const answer = await work()
      return answer.ok && typeof answer.value?.ok === 'boolean' ? answer.value : answer
    } catch (error) {
      return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } }
    }
  }

  #latchHostOnly(failure) {
    if (failure.kind === 'host-only') this.#hostOnly = true
  }

  async #loadLevel(dir) {
    if (this.#hostOnly) return
    const epoch = this.#epoch
    const previous = this.#levels.get(dir)
    this.#levels.set(dir, { status: 'loading', entries: previous?.entries ?? [], truncated: previous?.truncated ?? false })
    this.#render()
    const result = await this.#call(() => this.#props.list(dir === ROOT ? {} : { path: dir }))
    if (epoch !== this.#epoch) return
    if (result.ok) {
      this.#levels.set(dir, {
        status: 'ready',
        entries: [...result.value.entries].sort(compareEntries),
        truncated: result.value.truncated,
      })
    } else {
      const failure = describeFailure(result.error)
      this.#latchHostOnly(failure)
      this.#levels.set(dir, { status: 'failed', entries: previous?.entries ?? [], truncated: false, failure })
    }
    this.#render()
  }

  #reload() {
    if (this.#hostOnly) return
    for (const dir of [ROOT, ...this.#expanded]) {
      if (this.#levels.has(dir)) void this.#loadLevel(dir)
    }
    if (this.#selected !== null) void this.#openFile(this.#selected)
  }

  #toggle(node) {
    if (node.expanded) {
      this.#expanded.delete(node.path)
      return
    }
    this.#expanded.add(node.path)
    void this.#loadLevel(node.path)
  }

  #activate(id) {
    const node = this.#nodes.get(id)
    if (node === undefined) return
    this.#focusId = id
    if (node.kind === 'status') {
      if (node.retry === true) void this.#loadLevel(node.path)
    } else if (node.type === 'directory') {
      this.#toggle(node)
    } else if (node.type !== 'other') {
      void this.#openFile({ path: node.path, name: node.name, size: node.size })
    }
    this.#render()
  }

  #statusNode(dir, state, level, parentId) {
    const base = { kind: 'status', id: `s:${dir}`, path: dir, level, parentId, expandable: false, expanded: false, children: [] }
    if (state.status === 'failed') {
      const advice = state.failure.retry ? ' Press Enter to try again.' : ''
      return { ...base, name: `${state.failure.message}${advice}`, retry: true }
    }
    if (state.status === 'loading' && state.entries.length === 0) return { ...base, name: 'Loading...' }
    if (state.status === 'ready' && state.entries.length === 0) return { ...base, name: 'This folder is empty.' }
    if (state.status === 'ready' && state.truncated) {
      return { ...base, name: `Listing truncated: showing the first ${String(state.entries.length)} entries. The host cut the rest.` }
    }
    return null
  }

  #buildLevel(dir, level, parentId) {
    const state = this.#levels.get(dir)
    if (state === undefined) return []
    const rows = state.entries.map((entry) => {
      const path = joinPath(dir, entry.name)
      const expandable = entry.type === 'directory'
      const expanded = expandable && this.#expanded.has(path)
      const id = `e:${path}`
      return {
        id, kind: 'entry', path, name: entry.name, type: entry.type, size: entry.size, level, parentId,
        expandable, expanded, children: expanded ? this.#buildLevel(path, level + 1, id) : [],
      }
    })
    const status = this.#statusNode(dir, state, level, parentId)
    if (status !== null) rows.push(status)
    return rows.map((node, index) => ({ ...node, position: index + 1, setSize: rows.length }))
  }

  #index(rows) {
    for (const node of rows) {
      this.#nodes.set(node.id, node)
      this.#order.push(node.id)
      this.#index(node.children)
    }
  }

  #focusNode(id) {
    this.#focusId = id
    this.#focusWanted = true
    this.#render()
  }

  #onKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const item = event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
    const node = item === null ? undefined : this.#nodes.get(item.getAttribute('data-id'))
    if (node === undefined) return
    const at = this.#order.indexOf(node.id)
    let target
    switch (event.key) {
      case 'ArrowDown':
        target = this.#order[at + 1]
        break
      case 'ArrowUp':
        target = this.#order[at - 1]
        break
      case 'Home':
        target = this.#order[0]
        break
      case 'End':
        target = this.#order[this.#order.length - 1]
        break
      case 'ArrowRight':
        if (node.expandable && !node.expanded) {
          event.preventDefault()
          this.#toggle(node)
          this.#render()
          return
        }
        target = node.expandable ? node.children[0]?.id : undefined
        break
      case 'ArrowLeft':
        if (node.expanded) {
          event.preventDefault()
          this.#toggle(node)
          this.#render()
          return
        }
        target = node.parentId ?? undefined
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.#activate(node.id)
        return
      default:
        return
    }
    event.preventDefault()
    if (target !== undefined) this.#focusNode(target)
  }

  #onFocusin(event) {
    const item = event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
    const id = item?.getAttribute('data-id')
    if (typeof id === 'string') this.#focusId = id
  }

  #revokeImage() {
    if (this.#imageUrl === null) return
    URL.revokeObjectURL(this.#imageUrl)
    this.#imageUrl = null
  }

  #current(seq, epoch) {
    return seq === this.#previewSeq && epoch === this.#epoch
  }

  #settlePreview(seq, epoch, preview) {
    if (!this.#current(seq, epoch)) return
    this.#preview = preview
    this.#render()
  }

  async #openFile(file) {
    const seq = this.#previewSeq + 1
    this.#previewSeq = seq
    const epoch = this.#epoch
    this.#revokeImage()
    this.#selected = file
    this.#preview = { status: 'loading' }
    this.#render()
    const mime = imageMimeOf(file.name)
    if (mime !== undefined) await this.#loadImage(file, mime, seq, epoch)
    else if (isKnownBinary(file.name)) await this.#settleBinary(file, seq, epoch)
    else await this.#loadText(file, 0, seq, epoch)
  }

  async #settleBinary(file, seq, epoch) {
    let size = file.size
    if (size === undefined) {
      const result = await this.#call(() => this.#props.stat({ path: file.path }))
      size = result.ok ? result.value.bytes : undefined
    }
    this.#settlePreview(seq, epoch, { status: 'binary', size })
  }

  async #loadText(file, loadedLines, seq, epoch) {
    const first = loadedLines === 0
    const result = await this.#call(() => this.#props.read(first ? { path: file.path } : { path: file.path, offset: loadedLines + 1 }))
    if (!this.#current(seq, epoch)) return
    if (result.ok) {
      const previous = this.#preview
      const value = result.value
      this.#preview = {
        status: 'text',
        text: first ? value.text : `${previous.text}\n${value.text}`,
        lines: (first ? 0 : previous.lines) + value.lines,
        eof: value.eof,
        bytes: value.bytes ?? file.size,
        loadingMore: false,
        moreFailure: null,
      }
      this.#render()
      return
    }
    const failure = describeFailure(result.error)
    this.#latchHostOnly(failure)
    if (!first && this.#preview.status === 'text') {
      this.#preview = { ...this.#preview, loadingMore: false, moreFailure: failure.message }
      this.#render()
    } else if (failure.kind === 'not-text') {
      await this.#settleBinary(file, seq, epoch)
    } else {
      this.#preview = { status: 'failed', kind: failure.kind, message: failure.message, retry: failure.retry }
      this.#render()
    }
  }

  #loadMore() {
    const current = this.#preview
    if (current.status !== 'text' || current.eof || current.loadingMore || current.lines >= MAX_PREVIEW_LINES) return
    this.#preview = { ...current, loadingMore: true, moreFailure: null }
    this.#render()
    void this.#loadText(this.#selected, current.lines, this.#previewSeq, this.#epoch)
  }

  async #loadImage(file, mime, seq, epoch) {
    if (typeof file.size === 'number' && file.size > IMAGE_WINDOW_BYTES) {
      this.#settlePreview(seq, epoch, { status: 'notice', kind: 'image-too-large', size: file.size })
      return
    }
    const result = await this.#call(() => this.#props.readBytes({ path: file.path, offset: 0, length: IMAGE_WINDOW_BYTES }))
    if (!this.#current(seq, epoch)) return
    if (!result.ok) {
      const failure = describeFailure(result.error)
      this.#latchHostOnly(failure)
      this.#settlePreview(seq, epoch, { status: 'failed', kind: failure.kind, message: failure.message, retry: failure.retry })
      return
    }
    if (!result.value.eof) {
      this.#settlePreview(seq, epoch, { status: 'notice', kind: 'image-too-large', size: result.value.bytes })
      return
    }
    const blob = new Blob([base64ToBytes(result.value.data)], { type: mime })
    this.#revokeImage()
    this.#imageUrl = URL.createObjectURL(blob)
    this.#preview = { status: 'image', url: this.#imageUrl, size: result.value.bytes ?? file.size, seq }
    this.#render()
  }

  #imageFailed(seq) {
    if (seq !== this.#previewSeq || this.#preview.status !== 'image') return
    this.#revokeImage()
    this.#preview = { status: 'notice', kind: 'image-undecodable' }
    this.#render()
  }

  #filesState() {
    if (this.#hostOnly) return 'host-only'
    const root = this.#levels.get(ROOT)
    if (root === undefined || (root.status === 'loading' && root.entries.length === 0)) return 'loading'
    if (root.status === 'failed' && root.entries.length === 0) return `failed-${root.failure.kind}`
    return 'ready'
  }

  #renderNode(node) {
    const isEntry = node.kind === 'entry'
    const selected = isEntry && this.#selected?.path === node.path
    const label = !isEntry ? node.name : node.type === 'directory' ? node.name : `${node.name}, ${formatBytes(node.size)}`
    const attributes = {
      key: node.id,
      role: 'treeitem',
      class: css.item ?? '',
      'data-id': node.id,
      'data-kind': node.kind,
      tabindex: node.id === this.#focusId ? '0' : '-1',
      'aria-level': String(node.level),
      'aria-setsize': String(node.setSize),
      'aria-posinset': String(node.position),
      'aria-label': label,
    }
    if (isEntry) attributes['aria-selected'] = selected ? 'true' : 'false'
    if (node.expandable) attributes['aria-expanded'] = node.expanded ? 'true' : 'false'
    if (isEntry && node.type === 'other') attributes['aria-disabled'] = 'true'
    const twist = node.expandable ? (node.expanded ? '▾' : '▸') : ''
    return h('li', attributes,
      h('div', {
        class: css.row ?? '',
        'data-type': node.type ?? 'status',
        style: `--level: ${String(node.level - 1)}`,
        onclick: () => this.#activate(node.id),
      },
      h('span', { class: css.twist ?? '', 'aria-hidden': 'true' }, twist),
      h('span', { class: isEntry ? css.name ?? '' : css.status ?? '' }, node.name),
      isEntry && node.type !== 'directory' ? h('span', { class: css.size ?? '' }, formatBytes(node.size)) : null,
      ),
      node.expanded && node.children.length > 0
        ? h('ul', { role: 'group', class: css.group ?? '' }, node.children.map(child => this.#renderNode(child)))
        : null,
    )
  }

  #renderPreviewBody() {
    const preview = this.#preview
    const retry = () => h('button', { type: 'button', class: css.button ?? '', onclick: () => { void this.#openFile(this.#selected) } }, 'Try again')
    switch (preview.status) {
      case 'idle':
        return h('p', { class: css.empty ?? '' }, 'Select a file to preview it. This view is read-only.')
      case 'loading':
        return h('p', { class: css.empty ?? '', role: 'status' }, 'Loading...')
      case 'text':
        return this.#renderText(preview)
      case 'image':
        return h('div', { class: css.imageFrame ?? '' },
          h('img', {
            class: css.image ?? '', src: preview.url, alt: this.#selected?.name ?? 'Image preview',
            onerror: () => this.#imageFailed(preview.seq),
          }))
      case 'binary':
        return h('p', { class: css.notice ?? '', role: 'status' }, `Binary file, ${formatBytes(preview.size)}. No preview is available.`)
      case 'notice':
        return h('p', { class: css.notice ?? '', role: 'status' }, this.#noticeText(preview))
      default:
        return h('div', { class: css.error ?? '', role: 'alert' },
          h('p', null, preview.message),
          preview.retry ? retry() : null)
    }
  }

  #noticeText(preview) {
    if (preview.kind === 'image-too-large') {
      return `This image is ${formatBytes(preview.size)}. Previews stop at ${formatBytes(IMAGE_WINDOW_BYTES)}, so it is not loaded.`
    }
    return 'The browser could not decode this image.'
  }

  #renderText(preview) {
    if (preview.text === '' && preview.eof) return h('p', { class: css.notice ?? '', role: 'status' }, 'This file is empty.')
    const capped = !preview.eof && preview.lines >= MAX_PREVIEW_LINES
    const shownLines = preview.eof && preview.text.endsWith('\n') ? preview.lines - 1 : preview.lines
    const summary = preview.eof
      ? `${shownLines.toLocaleString()} lines`
      : `Showing the first ${shownLines.toLocaleString()} lines of this file.`
    return h('div', { class: css.textBody ?? '' },
      h('pre', { class: css.code ?? '', tabindex: '0', role: 'region', 'aria-label': `Contents of ${this.#selected?.name ?? 'file'}` }, preview.text),
      h('p', { class: css.notice ?? '', role: 'status' },
        summary,
        capped ? ` Preview stops at ${MAX_PREVIEW_LINES.toLocaleString()} lines.` : null,
        preview.moreFailure === null ? null : ` More lines could not be loaded: ${preview.moreFailure}`),
      !preview.eof && !capped
        ? h('button', {
          type: 'button', class: css.button ?? '', disabled: preview.loadingMore,
          onclick: () => this.#loadMore(),
        }, preview.loadingMore ? 'Loading...' : 'Load more')
        : null)
  }

  #renderPreview() {
    const selected = this.#selected
    const state = this.#preview.kind ?? this.#preview.status
    return h('section', { class: css.preview ?? '', 'aria-labelledby': PREVIEW_TITLE_ID, 'data-preview-state': state },
      h('header', { class: css.previewHeader ?? '' },
        h('h2', { id: PREVIEW_TITLE_ID }, selected === null ? 'Preview' : selected.name),
        selected === null ? null : h('p', { class: css.meta ?? '' }, `${selected.path} - ${formatBytes(this.#previewSize())}`)),
      this.#renderPreviewBody())
  }

  #previewSize() {
    const preview = this.#preview
    const known = preview.status === 'text' ? preview.bytes : preview.size
    return typeof known === 'number' ? known : this.#selected?.size
  }

  #renderHostOnly() {
    return h('div', { class: css.notice ?? '', role: 'status', 'data-host-only': '' },
      h('h2', null, 'File browsing is available only on the host machine'),
      h('p', null, 'This host only answers file requests from a browser running on the same machine as the harness. Open freddie on that machine to browse this session\'s files.'))
  }

  #renderBody(rows, filesState) {
    if (filesState === 'host-only') return this.#renderHostOnly()
    if (filesState.startsWith('failed-')) {
      const root = this.#levels.get(ROOT)
      return h('div', { class: css.error ?? '', role: 'alert' },
        h('p', null, root.failure.message),
        root.failure.retry ? h('button', { type: 'button', class: css.button ?? '', onclick: () => { void this.#loadLevel(ROOT) } }, 'Try again') : null)
    }
    return h('div', { class: css.workspace ?? '' },
      h('div', { class: css.treePane ?? '' },
        h('ul', {
          class: css.tree ?? '', role: 'tree', 'aria-label': 'Workspace files',
          'aria-busy': filesState === 'loading' ? 'true' : 'false',
          onkeydown: event => this.#onKeydown(event),
          onfocusin: event => this.#onFocusin(event),
        }, rows.map(node => this.#renderNode(node)))),
      this.#renderPreview())
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const filesState = this.#filesState()
    this.#nodes = new Map()
    this.#order = []
    const rows = filesState === 'ready' || filesState === 'loading' ? this.#buildLevel(ROOT, 1, null) : []
    this.#index(rows)
    if (this.#focusId === null || !this.#nodes.has(this.#focusId)) this.#focusId = this.#order[0] ?? null
    const cwd = props.useSessions?.(list => list.byId?.[props.sessionId]?.cwd)
    applyDiff(this, h('section', {
      class: css.root ?? '',
      'data-workspace-files-view': '',
      'data-files-state': filesState,
      'aria-labelledby': TITLE_ID,
    },
    h('header', { class: css.header ?? '' },
      h('div', null,
        h('p', { class: css.eyebrow ?? '' }, 'Read-only'),
        h('h1', { id: TITLE_ID }, 'Workspace files'),
        typeof cwd === 'string' ? h('p', { class: css.meta ?? '', 'data-workspace-root': '' }, cwd) : null),
      filesState === 'host-only' ? null : h('button', { type: 'button', class: css.button ?? '', onclick: () => this.#reload() }, 'Reload')),
    this.#renderBody(rows, filesState)))
    if (this.#focusWanted) {
      this.#focusWanted = false
      const focusId = this.#focusId
      const target = [...this.querySelectorAll('[role="treeitem"]')].find(item => item.getAttribute('data-id') === focusId)
      target?.focus()
    }
  }
}

defineElement('freddie-workspace-files-view', FreddieWorkspaceFilesView)
