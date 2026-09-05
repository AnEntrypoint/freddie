// Read-only Host plugin inventory registered into Web Settings.
//
// Converted from a React function component (useState/useEffect/useMemo/
// useId) to a webjsx custom element: instance fields replace state,
// connectedCallback/disconnectedCallback replace effect mount/cleanup, and a
// module-level counter replaces useId (stable per element instance).

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@freddie/freddie-client-ui-primitives'
import css from './PluginInventorySettingsTab.css.js'

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
}

/** Localized accessible label for one root Fiber phase. */
function phaseLabel(phase, t) {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName) {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^freddie-(?:host-|client-)?/, '')
}

/** Whether an inventory row matches the local catalog query. */
function matches(entry, normalizedQuery) {
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

let nextCatalogId = 0

/**
 * Read-only Loader inventory tab custom element. Registered as
 * `freddie-plugin-inventory-settings-tab` via `webjsxSlot` at the slot's register
 * call site (see index.ts).
 */
export class FreddiePluginInventorySettingsTab extends HTMLElement {
  #props = null
  #catalogId = `plugin-inventory-${nextCatalogId++}`
  #query = ''
  #expanded = null
  #state = { status: 'loading' }
  #request = 0
  #fetchToken = 0

  /** Set/replace props and re-render; called by the slot renderer's webjsx bridge. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#load()
    this.#render()
  }

  disconnectedCallback() {
    // Invalidate any in-flight load so a late resolution after unmount is a no-op.
    this.#fetchToken += 1
  }

  #load() {
    const props = this.#props
    if (props === null) return
    const token = ++this.#fetchToken
    void Promise.resolve().then(() => props.list()).then(
      (snapshot) => {
        if (token !== this.#fetchToken) return
        this.#state = { status: 'ready', snapshot }
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

  #syncExpanded() {
    if (this.#state.status !== 'ready' || this.#expanded === null) return
    const normalizedQuery = this.#query.trim().toLocaleLowerCase()
    const filtered = this.#state.snapshot.entries.filter(entry => matches(entry, normalizedQuery))
    if (!filtered.some(entry => entry.entryId === this.#expanded)) this.#expanded = null
  }

  #retry = () => {
    this.#state = { status: 'loading' }
    this.#request += 1
    this.#load()
    this.#render()
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-plugin-inventory-settings-tab') === undefined) {
  customElements.define('freddie-plugin-inventory-settings-tab', FreddiePluginInventorySettingsTab)
}
