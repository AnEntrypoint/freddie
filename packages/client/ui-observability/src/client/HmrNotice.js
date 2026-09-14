import { applyDiff, createElement as h } from '@freddie/webjsx'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const NOTICE_MS = 4000

/** `window` event the client-hmr browser half dispatches per journal row. */
const JOURNAL_EVENT = 'freddie:hmr'

function pluginList(plugins) {
  const names = plugins.map(path => path.split('/').filter(part => part !== 'src' && part !== 'index.js').slice(-2).join('/'))
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
}

/**
 * Notice text for one journal row, or undefined for rows a developer does
 * not act on (channel open/close, sequence bookkeeping).
 */
function noticeFor(row) {
  switch (row.kind) {
    case 'host-reloaded':
      switch (row.hostKind) {
        case 'reload': return { tone: 'ok', text: `Server reloaded ${pluginList(row.plugins)}` }
        case 'deferred': return { tone: 'wait', text: `Server reload deferred: ${row.reason ?? 'work in flight'}` }
        case 'failed': return { tone: 'error', text: `Server reload failed: ${row.reason ?? pluginList(row.plugins)}` }
        default: return undefined
      }
    case 'plugin-rebuilt':
      return { tone: 'ok', text: `Reloaded ${row.id.replace('@freddie/freddie-', '')}` }
    case 'plugin-reload-failed':
      return { tone: 'error', text: `Reload of ${row.id.replace('@freddie/freddie-', '')} failed` }
    case 'css-rebuilt':
      return { tone: 'ok', text: 'Styles updated' }
    case 'css-swap-failed':
      return { tone: 'error', text: 'Stylesheet swap failed' }
    case 'shell-rebuilt':
      return { tone: 'ok', text: 'Shell remounting' }
    default:
      return undefined
  }
}

export class FreddieHmrNotice extends HTMLElement {
  #notice = undefined
  #timer = undefined
  #onJournal = (event) => {
    const notice = noticeFor(event.detail)
    if (notice === undefined) return
    this.#notice = notice
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#notice = undefined
      this.#render()
    }, NOTICE_MS)
    this.#render()
  }

  setProps() {}

  connectedCallback() {
    globalThis.addEventListener(JOURNAL_EVENT, this.#onJournal)
    this.#render()
  }

  disconnectedCallback() {
    globalThis.removeEventListener(JOURNAL_EVENT, this.#onJournal)
    clearTimeout(this.#timer)
  }

  #render() {
    const notice = this.#notice
    applyDiff(this, notice === undefined
      ? h('span', { 'data-hmr-notice': '', hidden: true })
      : h('span', { 'data-hmr-notice': '', 'data-tone': notice.tone, role: 'status', 'aria-live': 'polite' }, notice.text))
  }
}

defineElement('freddie-hmr-notice', FreddieHmrNotice)
