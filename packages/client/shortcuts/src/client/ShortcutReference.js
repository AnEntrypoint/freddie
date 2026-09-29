
import { defineElement, renderModal } from '@freddie/freddie-client-ui-primitives'
import { createElement as h, Fragment } from '@freddie/webjsx'
import { KeyRecorder } from './recorder.js'
import { overrideCount, rankRows, referenceRows } from './search.js'
import { SHORTCUT_STORAGE_KEY } from './storage.js'
import css from './ShortcutReference.css.js'

const SAVE_STATUS = {
  'stale': 'stale',
  'not-ready': 'not-ready',
  'unreadable': 'unreadable',
  'write-failed': 'save-failed',
  'conflict': 'conflict',
}

const MODAL_OWNER_ATTRIBUTE = 'data-shortcut-modal'

const MODAL_ID = 'shortcuts'

export class FreddieShortcutReference extends HTMLElement {
  #props = null
  #modal = null
  #editing = null
  #status = null
  #confirmReset = false
  #recorder = null
  #wasOpen = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#stopRecording()
    this.#modal?.remove()
    this.#modal = null
    this.#wasOpen = false
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const t = props.t ?? (key => key)
    const reference = props.useReference?.(state => state) ?? { open: false, query: '' }
    if (!reference.open) {
      this.#stopRecording()
      this.#editing = null
      this.#status = null
      this.#confirmReset = false
      if (this.#modal !== null) {
        renderModal(this.#modal, { open: false, title: '', onClose: () => {} })
        this.#wasOpen = false
      }
      return
    }
    const catalog = props.useCatalog?.(rows => rows) ?? []
    const fixedCatalog = props.useFixedCatalog?.(rows => rows) ?? []
    const config = props.useConfig?.(state => state)
    const platform = props.platform ?? 'linux'
    const modified = overrideCount(config?.document ?? { profiles: {} }, `web:${platform}`)
    const writable = config?.status === 'ready'
    const matches = rankRows(referenceRows(catalog, fixedCatalog), reference.query)

    this.#modal = renderModal(this.#modal, {
      open: true,
      title: t('title'),
      headless: true,
      className: css.dialog,
      onClose: () => { props.onClose?.() },
      children: h(
        'div',
        { class: css.contents },
        h(
          'div',
          { class: css.header },
          h('h2', { class: css.title }, t('title')),
          h('button', { type: 'button', class: css.close, 'aria-label': t('close'), onclick: () => { props.onClose?.() } }, '×'),
        ),
        h(
          'div',
          { class: css.searchRow },
          h('input', {
            class: css.search,
            type: 'search',
            value: reference.query,
            placeholder: t('search'),
            'aria-label': t('search'),
            autocomplete: 'off',
            oninput: event => { props.onSearch?.(event.target.value) },
          }),
        ),
        this.#renderList(t, matches, writable),
        this.#renderFooter(t, modified, writable),
      ),
    })
    this.#modal.querySelector('[role="dialog"]')?.setAttribute(MODAL_OWNER_ATTRIBUTE, MODAL_ID)
    if (!this.#wasOpen) {
      this.#wasOpen = true
      this.#modal.querySelector(`.${css.search}`)?.focus()
    }
  }

  #renderList(t, rows, writable) {
    if (rows.length === 0) return h('p', { class: css.hint }, t('empty'))
    const groups = []
    for (const row of rows) {
      const last = groups[groups.length - 1]
      if (last === undefined || last.group !== row.group) groups.push({ group: row.group, rows: [row] })
      else last.rows.push(row)
    }
    return h(
      'div',
      { class: css.list },
      ...groups.map(entry => h(
        Fragment,
        null,
        h('div', { class: css.group }, t(`group.${entry.group}`)),
        h('ul', { class: css.rows }, ...entry.rows.map(row => this.#renderRow(t, row, writable))),
      )),
    )
  }

  #renderRow(t, row, writable) {
    if (row.bindings !== undefined) {
      return h(
        'li',
        { class: `${css.row} ${css.rowFixed}` },
        h('span', { class: css.label }, row.label),
        h('span', { class: css.fixedKey }, row.keys.join(' ')),
      )
    }
    const editing = this.#editing === row.id
    return h(
      'li',
      {
        class: css.row,
        onclick: () => { if (writable && !editing) this.#startEditing(row.id) },
      },
      h('span', { class: css.label }, row.label),
      editing
        ? h(
          'span',
          { class: css.editor },
          h('span', { class: css.recorder }, t('record-help')),
          h('button', { type: 'button', class: css.action, onclick: () => { this.#cancelEditing() } }, t('cancel')),
        )
        : h(
          'span',
          { class: css.editor },
          this.#renderBinding(t, row),
          row.modified && writable
            ? h('button', {
              type: 'button',
              class: css.action,
              onclick: () => { this.#save({ type: 'reset', id: row.id }, t) },
            }, t('reset'))
            : null,
        ),
    )
  }

  #renderBinding(t, row) {
    if (row.binding === null) return h('span', { class: css.unbound }, t('unbound'))
    const broken = row.issue !== null || row.conflicts.length > 0
    return h(
      'span',
      { class: broken ? `${css.binding} ${css.recorderInvalid}` : css.binding },
      ...row.keys.map(key => h('kbd', { class: css.keyBadge }, key)),
    )
  }

  #renderFooter(t, modified, writable) {
    const status = this.#status
    const unreadable = !writable && this.#props?.useConfig?.(state => state)?.status === 'unreadable'
    const message = status !== null
      ? status.params === undefined ? t(status.key) : t(status.key, status.params)
      : unreadable ? t('unreadable', { key: SHORTCUT_STORAGE_KEY })
        : modified > 0 ? t('modified-count', { count: modified }) : ''
    const footer = h(
      'div',
      { class: css.footer },
      h('span', { class: status?.error === true || unreadable ? `${css.status} ${css.statusError}` : css.status }, message),
      modified > 0 && writable
        ? (this.#confirmReset
          ? h(
            Fragment,
            null,
            h('button', { type: 'button', class: css.action, onclick: () => { this.#confirmReset = false; this.#render() } }, t('cancel')),
            h('button', { type: 'button', class: css.action, onclick: () => { this.#save({ type: 'reset-all' }, t) } }, t('confirm')),
          )
          : h('button', {
            type: 'button',
            class: css.action,
            'aria-label': t('reset-title'),
            onclick: () => { this.#confirmReset = true; this.#render() },
          }, t('reset-all')))
        : null,
    )
    if (!this.#confirmReset) return footer
    return h(
      Fragment,
      null,
      h('p', { class: css.hint }, t('reset-description')),
      footer,
    )
  }

  #startEditing(id) {
    this.#stopRecording()
    this.#editing = id
    this.#status = null
    this.#confirmReset = false
    const recorder = new KeyRecorder({
      onCapture: binding => { this.#capture(binding) },
      onCancel: () => { this.#cancelEditing() },
    })
    this.#recorder = recorder
    this.#render()
    recorder.start({ document: this.ownerDocument, window: this.ownerDocument?.defaultView })
  }

  #stopRecording() {
    this.#recorder?.stop()
    this.#recorder = null
  }

  #cancelEditing() {
    this.#stopRecording()
    this.#editing = null
    this.#render()
  }

  #capture(binding) {
    const props = this.#props
    const id = this.#editing
    if (props === null || id === null) return
    const t = props.t ?? (key => key)
    const described = props.describeBinding?.(binding) ?? { binding: null, keys: [], issue: null, conflicts: [] }
    if (described.issue !== null) {
      this.#status = { key: described.issue, error: true }
      this.#editing = null
      this.#render()
      return
    }
    const conflicts = described.conflicts.filter(other => other !== id)
    if (conflicts.length > 0) {
      this.#status = { key: 'conflict', params: { commands: this.#labels(conflicts).join(', ') }, error: true }
      this.#render()
      return
    }
    this.#save({ type: 'set', id, binding: described.binding }, t)
  }

  #labels(ids) {
    const catalog = this.#props?.useCatalog?.(rows => rows) ?? []
    const fixedCatalog = this.#props?.useFixedCatalog?.(rows => rows) ?? []
    return ids.map(id => [...catalog, ...fixedCatalog].find(row => row.id === id)?.label ?? id)
  }

  async #save(edit, t) {
    const props = this.#props
    if (props === null) return
    const revision = props.useConfig?.(state => state)?.revision
    const result = await props.onEdit?.(edit, revision)
    if (result === undefined || result === null) return
    if (!this.isConnected) return
    this.#stopRecording()
    this.#editing = null
    this.#confirmReset = false
    if (result.status === 'saved') {
      this.#status = { key: edit.type === 'reset-all' ? 'reset-saved' : 'saved', error: false }
    } else if (result.status === 'conflict') {
      const conflicts = result.conflicts ?? []
      this.#status = result.issue !== undefined && result.issue !== null
        ? { key: result.issue, error: true }
        : { key: 'conflict', params: { commands: this.#labels(conflicts).join(', ') }, error: true }
    } else {
      this.#status = {
        key: SAVE_STATUS[result.status] ?? 'save-failed',
        params: result.status === 'unreadable' ? { key: SHORTCUT_STORAGE_KEY } : undefined,
        error: true,
      }
    }
    this.#render()
  }
}

defineElement('freddie-shortcut-reference', FreddieShortcutReference)