import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

const CLOSED = {
  open: false, command: null, status: 'pending', options: [], search: '', active: 0,
  submitting: false, confirming: null, acknowledged: false, error: null,
}

export function filterOptions(options, search) {
  const query = search.trim().toLowerCase()
  if (query === '') return options
  return options.filter(o => o.label.toLowerCase().includes(query) || (o.detail?.toLowerCase().includes(query) ?? false))
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

export class PopupSelectController {
  state = createSnapshotStore(CLOSED)
  binding = null

  constructor(deps) {
    this.deps = deps
  }

  open(command, spec, context, segment) {
    this.binding?.abort.abort()
    const binding = { command, spec, context, segment, abort: new AbortController() }
    this.binding = binding
    this.state.set({ ...CLOSED, open: true, command })
    this.load(binding)
  }

  load(binding) {
    binding.spec.options(binding.context, binding.abort.signal).then(
      (options) => {
        if (this.binding !== binding) return
        this.state.set({ ...this.state.getSnapshot(), status: 'ready', options, active: 0, error: null })
      },
      (error) => {
        if (this.binding !== binding) return
        console.error(`[ui-commands] popupSelect options failed for /${binding.command}:`, error)
        this.state.set({ ...this.state.getSnapshot(), status: 'failed', options: [], active: 0, error: errorText(error) })
      },
    )
  }

  retry() {
    const binding = this.binding
    const s = this.state.getSnapshot()
    if (binding === null || !s.open || s.status !== 'failed') return
    this.state.set({ ...s, status: 'pending', error: null })
    this.load(binding)
  }

  setSearch(search) {
    const s = this.state.getSnapshot()
    if (!s.open || s.submitting || s.confirming !== null || search === s.search) return
    this.state.set({ ...s, search, active: 0 })
  }

  move(dir) {
    const s = this.state.getSnapshot()
    if (!s.open || s.status !== 'ready' || s.submitting || s.confirming !== null) return
    const rows = filterOptions(s.options, s.search)
    if (rows.length === 0) return
    const active = (s.active + dir + rows.length) % rows.length
    this.state.set({ ...s, active })
  }

  highlight(index) {
    const s = this.state.getSnapshot()
    if (!s.open || s.status !== 'ready' || s.submitting || s.confirming !== null) return
    if (index < 0 || index >= filterOptions(s.options, s.search).length || index === s.active) return
    this.state.set({ ...s, active: index })
  }

  async select(index) {
    const binding = this.binding
    const s = this.state.getSnapshot()
    if (binding === null || !s.open || s.status !== 'ready' || s.submitting || s.confirming !== null) return
    const option = filterOptions(s.options, s.search)[index]
    if (option === undefined) return
    if (option.confirmation !== undefined) {
      this.state.set({ ...s, confirming: option, acknowledged: false, error: null })
      return
    }
    await this.settle(binding, option)
  }

  acknowledge(acknowledged) {
    const s = this.state.getSnapshot()
    if (!s.open || s.submitting || s.confirming === null || s.acknowledged === acknowledged) return
    this.state.set({ ...s, acknowledged })
  }

  cancelConfirmation() {
    const s = this.state.getSnapshot()
    if (!s.open || s.submitting || s.confirming === null) return
    this.state.set({ ...s, confirming: null, acknowledged: false })
  }

  async confirm() {
    const binding = this.binding
    const s = this.state.getSnapshot()
    if (binding === null || !s.open || s.submitting || s.confirming === null || !s.acknowledged) return
    await this.settle(binding, s.confirming)
  }

  async settle(binding, option) {
    const s = this.state.getSnapshot()
    if (this.binding !== binding || !s.open || s.submitting) return
    this.state.set({ ...s, submitting: true, confirming: null, acknowledged: false, error: null })
    try {
      await binding.spec.onSelect(option, binding.context)
    } catch (error) {
      console.error(`[ui-commands] popupSelect onSelect failed for /${binding.command}:`, error)
      if (this.binding !== binding) return
      this.state.set({ ...this.state.getSnapshot(), submitting: false, error: errorText(error) })
      return
    }
    if (this.binding !== binding) return
    this.deps.consume(binding.segment)
    this.binding = null
    this.state.set(CLOSED)
    this.deps.focusComposer()
  }

  dismiss(opts) {
    if (this.binding === null) return
    this.binding.abort.abort()
    this.binding = null
    this.state.set(CLOSED)
    if (opts?.focusComposer === true) this.deps.focusComposer()
  }

  dispose() {
    this.binding?.abort.abort()
    this.binding = null
    this.state.set(CLOSED)
  }
}
