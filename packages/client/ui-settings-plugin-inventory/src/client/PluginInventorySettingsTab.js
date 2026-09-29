import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './PluginInventorySettingsTab.css.js'

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
}

const LOCK_KEYS = {
  'request-path': 'lockRequestPath',
  'host-dependents': 'lockHostDependents',
  'client-dependents': 'lockClientDependents',
  'not-addressable': 'lockNotAddressable',
}

const CONTROL_ABSENT = { kind: 'unavailable', locks: new Map() }

function phaseLabel(phase, t) {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

function moduleShortName(moduleName) {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^freddie-(?:host-|client-)?/, '')
}

function matches(entry, normalizedQuery) {
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

function controlOf(outcome) {
  if (outcome.kind === 'ok') {
    return { kind: 'ready', locks: new Map(outcome.value.entries.map(view => [view.entryId, view.lock])) }
  }
  if (outcome.kind === 'forbidden') return { kind: 'forbidden', locks: new Map() }
  return CONTROL_ABSENT
}

function noteOf(outcome) {
  if (outcome.kind === 'refused' && outcome.lock !== undefined) return { kind: 'locked', lock: outcome.lock }
  if (outcome.kind === 'refused' && outcome.code === 'plugin-manager/unknown-entry') return { kind: 'gone' }
  return { kind: 'failed' }
}

let nextCatalogId = 0

export class FreddiePluginInventorySettingsTab extends HTMLElement {
  #props = null
  #catalogId = `plugin-inventory-${nextCatalogId++}`
  #query = ''
  #expanded = null
  #state = { status: 'loading' }
  #fetchToken = 0
  #busy = new Set()
  #pendingSwitches = 0
  #notes = new Map()
  #refreshFailed = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#load()
    this.#render()
  }

  disconnectedCallback() {
    this.#fetchToken += 1
  }

  async #fetch() {
    const props = this.#props
    const [snapshot, outcome] = await Promise.all([
      Promise.resolve().then(() => props.list()),
      props.describe(),
    ])
    return { snapshot, control: controlOf(outcome) }
  }

  #load() {
    if (this.#props === null) return
    const token = ++this.#fetchToken
    this.#fetch().then(
      ({ snapshot, control }) => {
        if (token !== this.#fetchToken) return
        this.#state = { status: 'ready', snapshot, control }
        this.#syncExpanded()
        this.#render()
      },
      () => {
        if (token !== this.#fetchToken) return
        this.#state = { status: 'error' }
        this.#render()
      },
    )
  }

  async #refresh() {
    const token = ++this.#fetchToken
    try {
      const { snapshot, control } = await this.#fetch()
      if (token !== this.#fetchToken) return
      this.#state = { status: 'ready', snapshot, control }
      this.#refreshFailed = false
      this.#syncExpanded()
    } catch {
      if (token !== this.#fetchToken) return
      this.#refreshFailed = true
    }
  }

  #syncExpanded() {
    if (this.#state.status !== 'ready' || this.#expanded === null) return
    const normalizedQuery = this.#query.trim().toLocaleLowerCase()
    const filtered = this.#state.snapshot.entries.filter(entry => matches(entry, normalizedQuery))
    if (!filtered.some(entry => entry.entryId === this.#expanded)) this.#expanded = null
  }

  #retry = () => {
    this.#state = { status: 'loading' }
    this.#load()
    this.#render()
  }

  async #switch(entry) {
    const { entryId } = entry
    if (this.#busy.has(entryId)) return
    this.#busy.add(entryId)
    this.#pendingSwitches += 1
    this.#notes.delete(entryId)
    this.#render()
    const outcome = await this.#props.setDisabled({ id: entryId, disabled: entry.enabled })
    if (outcome.kind === 'forbidden') {
      this.#state = { ...this.#state, control: { kind: 'forbidden', locks: new Map() } }
    } else if (outcome.kind !== 'ok') {
      this.#notes.set(entryId, noteOf(outcome))
    }
    await this.#refresh()
    this.#pendingSwitches -= 1
    if (this.#pendingSwitches === 0) this.#busy.clear()
    this.#render()
  }

  #inertReason(entry, control, t) {
    if (control.kind === 'forbidden') return t('needsHost')
    if (control.kind === 'unavailable') return t('controlUnavailable')
    const lock = control.locks.get(entry.entryId)
    if (lock === undefined) return t('controlUnavailable')
    return lock === null ? undefined : t(LOCK_KEYS[lock])
  }

  #switchRow(entry, title, control, t) {
    const busy = this.#busy.has(entry.entryId)
    const note = this.#notes.get(entry.entryId)
    const reason = this.#inertReason(entry, control, t)
    const inert = busy || reason !== undefined
    const messageId = `${this.#catalogId}-switch-${encodeURIComponent(entry.entryId)}`
    let message = null
    if (busy) {
      message = h('span', { class: css.controlText ?? '', id: messageId, role: 'status' }, t('busy'))
    } else if (note !== undefined) {
      const text = note.kind === 'locked' ? t(LOCK_KEYS[note.lock]) : t(note.kind === 'gone' ? 'entryGone' : 'switchFailed')
      message = h('span', { class: css.controlText ?? '', id: messageId, role: 'alert', 'data-switch-failure': note.kind }, text)
    } else if (reason !== undefined) {
      message = h('span', { class: css.controlText ?? '', id: messageId, 'data-switch-reason': '' }, reason)
    }
    return h('div', { class: css.cardControl ?? '' },
      h('button', {
        class: css.switch ?? '',
        type: 'button',
        role: 'switch',
        'aria-checked': String(entry.enabled),
        'aria-label': t('toggleLabel', { name: title }),
        'aria-disabled': String(inert),
        'aria-busy': String(busy),
        'aria-describedby': message === null ? null : messageId,
        'data-plugin-toggle': entry.entryId,
        onclick: () => {
          if (!inert) void this.#switch(entry)
        },
      }, h('span', { class: css.switchThumb ?? '', 'aria-hidden': 'true' })),
      message,
    )
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { t } = props
    const state = this.#state
    const normalizedQuery = this.#query.trim().toLocaleLowerCase()
    const filteredEntries = state.status === 'ready'
      ? state.snapshot.entries.filter(entry => matches(entry, normalizedQuery))
      : []

    const vdom = h('div', { class: css.section ?? '', 'aria-busy': String(state.status === 'loading') },
      state.status === 'loading' ? h('p', { class: css.status ?? '' }, t('loading')) : null,
      state.status === 'error' ? (
        h('div', { class: css.failure ?? '' },
          h('p', { role: 'alert' }, t('error')),
          h('button', { type: 'button', onclick: this.#retry }, t('retry')),
        )
      ) : null,
      state.status === 'ready' && state.control.kind === 'forbidden'
        ? h('p', { class: css.status ?? '', role: 'status', 'data-needs-host': '' }, t('needsHostNotice'))
        : null,
      state.status === 'ready' && this.#refreshFailed
        ? h('p', { class: css.notice ?? '', role: 'alert', 'data-refresh-failed': '' }, t('refreshFailed'))
        : null,
      state.status === 'ready' ? (
        h('div', { class: css.catalog ?? '' },
          h('label', { class: css.search ?? '' },
            h(IconSearchOutline16, null),
            h('span', { class: css.visuallyHidden ?? '' }, t('search')),
            h('input', {
              type: 'search',
              value: this.#query,
              placeholder: t('search'),
              'aria-label': t('search'),
              oninput: (event) => {
                this.#query = (event.currentTarget).value
                this.#render()
              },
            }),
          ),
          h('div', { class: css.catalogHeading ?? '' },
            h('h3', null, t('catalog')),
            h('span', { 'data-plugin-count': String(filteredEntries.length) }, filteredEntries.length),
          ),
          state.snapshot.entries.length === 0 ? h('p', { class: css.status ?? '' }, t('empty')) : null,
          state.snapshot.entries.length > 0 && filteredEntries.length === 0
            ? h('p', { class: css.status ?? '' }, t('emptySearch'))
            : null,
          filteredEntries.length > 0 ? (
            h('ul', { class: css.cards ?? '' },
              filteredEntries.map((entry) => {
                const status = phaseLabel(entry.fiberPhase, t)
                const title = moduleShortName(entry.moduleName)
                const configuration = t(entry.enabled ? 'enabledTag' : 'disabledTag')
                const open = this.#expanded === entry.entryId
                const detailId = `${this.#catalogId}-details-${encodeURIComponent(entry.entryId)}`
                return (
                  h('li', {
                    class: css.card ?? '',
                    'data-plugin-entry': entry.entryId,
                    'data-open': open ? 'true' : null,
                  },
                    h('button', {
                      class: css.cardContent ?? '',
                      type: 'button',
                      'aria-expanded': String(open),
                      'aria-controls': detailId,
                      'aria-label': entry.enabled ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`,
                      onclick: () => {
                        this.#expanded = this.#expanded === entry.entryId ? null : entry.entryId
                        this.#render()
                      },
                    },
                      h('strong', { class: css.cardTitle ?? '', title: entry.moduleName }, title),
                      h('span', { class: css.cardTrailing ?? '' },
                        entry.enabled ? (
                          h('span', {
                            class: css.statusDot ?? '',
                            'data-phase': entry.fiberPhase ?? 'unobserved',
                            role: 'img',
                            'aria-label': status,
                            title: status,
                          })
                        ) : null,
                        h('span', { class: css.configTag ?? '', 'data-enabled': entry.enabled ? 'true' : 'false' },
                          configuration,
                        ),
                        h(IconChevronDownOutline14, { className: css.chevron, size: 12 }),
                      ),
                    ),
                    this.#switchRow(entry, title, state.control, t),
                    open ? (
                      h('div', { class: css.cardDetails ?? '', id: detailId },
                        h('code', { class: css.entryValue ?? '', 'data-loader-entry': '' }, entry.entryId),
                        h('dl', { class: css.details ?? '' },
                          h('div', null,
                            h('dt', null, t('configuration')),
                            h('dd', null, configuration),
                          ),
                          entry.enabled ? (
                            h('div', null,
                              h('dt', null, t('cordis')),
                              h('dd', null, status),
                            )
                          ) : null,
                        ),
                      )
                    ) : null,
                  )
                )
              }),
            )
          ) : null,
        )
      ) : null,
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-plugin-inventory-settings-tab', FreddiePluginInventorySettingsTab)
