/**
 * Framework-free boot page and failure report. It remains available when a
 * client plugin fails because React arrives only with the UI renderer.
 * @module @freddie/freddie-client-web/src/boot-page
 */
import css from './boot-page.css.js'

/** Create a div with one module class and optional text. */
function div(className, text, tagName = 'div') {
  const el = document.createElement(tagName)
  el.className = className ?? ''
  if (text !== undefined) el.textContent = text
  return el
}

/** Kernel-owned page mounted below the application's root element. */
export class BootPage {
  root
  card
  wordmark
  spinner
  hint
  loadingDetail
  current
  progress
  statusGrid
  renderFrame
  states = new Map()
  active = new Set()
  total = 0
  failure

  /**
   * Build and attach the boot page.
   * @param container - Application mount point.
   */
  constructor(container) {
    this.root = div(css.boot)
    this.root.dataset.freddieBoot = ''
    this.card = div(css.card, undefined, 'main')
    this.wordmark = div(css.wordmark, 'FREDDIE', 'h1')
    this.spinner = div(css.spinner)
    this.spinner.dataset.freddieBootSpinner = ''
    this.hint = div(css.hint, 'Starting Freddie...')
    this.hint.setAttribute('role', 'status')
    this.hint.setAttribute('aria-live', 'polite')
    this.loadingDetail = div(css.loadingDetail)
    this.loadingDetail.setAttribute('aria-live', 'polite')
    this.statusGrid = div(css.statusGrid, undefined, 'section')
    this.statusGrid.setAttribute('aria-label', 'Freddie startup readiness')
    this.current = div(css.current)
    this.progress = document.createElement('progress')
    this.progress.className = css.progress
    this.progress.max = 1
    this.progress.value = 0
    this.progress.setAttribute('aria-label', 'Freddie startup progress')
    this.card.append(this.wordmark, this.spinner, this.hint, this.progress, this.statusGrid, this.loadingDetail, this.current)
    this.root.append(this.card)
    container.append(this.root)
    this.render()
  }

  /**
   * Set the number of loader entries represented by the progress arc.
   * @param total - Complete boot roster size.
   */
  setTotal(total) {
    this.total = total
    this.scheduleRender()
  }

  /**
   * Project one loader entry's fiber state.
   * @param id - Loader entry name.
   * @param state - Projected fiber state.
   */
  setState(id, state) {
    this.states.set(id, state)
    if (state === 'active') this.active.add(id)
    else this.active.delete(id)
    this.scheduleRender()
  }

  /** Name the entry currently being prepared by the loader. */
  setCurrent(id) {
    this.current.textContent = id === undefined ? '' : `Preparing ${id}`
  }

  /** Coalesce synchronous Loader status bursts into one visual update. */
  scheduleRender() {
    if (this.renderFrame !== undefined) return
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = undefined
      this.render()
    })
  }

  /** Run one recovery action from the failure report. */
  action(label, onClick) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = css.action
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  /**
   * Display the boot failure report.
   * @param message - Failure report text.
   */
  fail(message) {
    this.failure = message
    this.render()
  }

  /** Detach the page before or after the UI renderer takes the mount point. */
  dispose() {
    if (this.renderFrame !== undefined) cancelAnimationFrame(this.renderFrame)
    this.root.remove()
  }

  /** Redraw the state-dependent content below the wordmark. */
  render() {
    this.updateProgress()
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    if (this.failure === undefined && failed.length === 0) {
      if (this.spinner.parentElement !== this.card) {
        this.card.replaceChildren(this.wordmark, this.spinner, this.hint, this.progress, this.statusGrid, this.loadingDetail, this.current)
      }
      return
    }
    const report = div(css.failed)
    report.append(div(css.failedTitle, 'Could not start Freddie'))
    for (const id of failed) report.append(div(css.failedItem, id))
    if (this.failure !== undefined) report.append(div(css.failedItem, this.failure))
    const actions = div(css.actions)
    actions.append(
      this.action('Retry', () => { globalThis.location.reload() }),
      this.action('Copy details', () => { void globalThis.navigator.clipboard?.writeText(this.failure ?? failed.join('\n')) }),
    )
    report.append(actions)
    this.card.replaceChildren(this.wordmark, report)
  }

  /** Grow the rotating arc and derive readiness from the Loader state map. */
  updateProgress() {
    const ratio = this.total === 0 ? 0 : Math.min(this.active.size / this.total, 1)
    const pending = [...this.states].filter(([, state]) => state === 'pending').map(([id]) => id)
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    const loading = [...this.states].filter(([, state]) => state === 'loading').map(([id]) => id)
    this.spinner.style.setProperty('--freddie-boot-arc', `${String(Math.round(72 + ratio * 216))}deg`)
    this.progress.value = ratio
    this.hint.textContent = this.total === 0
      ? 'Starting Freddie...'
      : `${String(this.active.size)} of ${String(this.total)} services ready`
    this.loadingDetail.textContent = failed.length > 0
      ? `Startup is blocked by ${String(failed.length)} service${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`
      : pending.length > 0
        ? `Waiting for ${String(pending.length)} ${pending.length === 1 ? 'dependency' : 'dependencies'} to become available`
        : this.active.size === 0 && this.total > 0
          ? 'Building the service graph...'
          : this.active.size === this.total && this.total > 0
            ? 'Preparing your workspace...'
            : ''
    this.statusGrid.replaceChildren(
      this.statusItem('Ready', this.active.size, this.total === 0 ? 'Discovering services' : `${String(this.total)} total`, 'ready'),
      this.statusItem('Loading', loading.length, loading.length === 0 ? 'No active imports' : 'Importing client capability', 'loading'),
      this.statusItem('Waiting', pending.length, pending.length === 0 ? 'Dependencies available' : 'Needs a provider', 'waiting'),
      this.statusItem('Issues', failed.length, failed.length === 0 ? 'No startup failures' : 'Review details below', failed.length === 0 ? 'ready' : 'failed'),
    )
  }

  /** Build one compact readiness cell from Loader-derived facts. */
  statusItem(label, value, detail, state) {
    const item = div(css.statusItem)
    item.dataset.state = state
    item.append(
      div(css.statusValue, String(value)),
      div(css.statusLabel, label),
      div(css.statusMeta, detail),
    )
    return item
  }
}
