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
    const snapshot = this.state.getSnapshot()
    if (binding === null || !snapshot.open || snapshot.status !== 'failed') return
    this.state.set({ ...snapshot, status: 'pending', error: null })
    this.load(binding)
  }

  setSearch(search) {
    const snapshot = this.state.getSnapshot()
    if (!snapshot.open || snapshot.submitting || snapshot.confirming !== null || search === snapshot.search) return
    this.state.set({ ...snapshot, search, active: 0 })
  }

  move(dir) {
    const snapshot = this.state.getSnapshot()
    if (!snapshot.open || snapshot.status !== 'ready' || snapshot.submitting || snapshot.confirming !== null) return
    const rows = filterOptions(snapshot.options, snapshot.search)
    if (rows.length === 0) return
    const active = (snapshot.active + dir + rows.length) % rows.length
    this.state.set({ ...snapshot, active })
  }

  highlight(index) {
    const snapshot = this.state.getSnapshot()
    if (!snapshot.open || snapshot.status !== 'ready' || snapshot.submitting || snapshot.confirming !== null) return
    if (index < 0 || index >= filterOptions(snapshot.options, snapshot.search).length || index === snapshot.active) return
    this.state.set({ ...snapshot, active: index })
  }

  async select(index) {
    const binding = this.binding
    const snapshot = this.state.getSnapshot()
    if (binding === null || !snapshot.open || snapshot.status !== 'ready' || snapshot.submitting || snapshot.confirming !== null) return
    const option = filterOptions(snapshot.options, snapshot.search)[index]
    if (option === undefined) return
    if (option.confirmation !== undefined) {
      this.state.set({ ...snapshot, confirming: option, acknowledged: false, error: null })
      return
    }
    await this.settle(binding, option)
  }

  acknowledge(acknowledged) {
    const snapshot = this.state.getSnapshot()
    if (!snapshot.open || snapshot.submitting || snapshot.confirming === null || snapshot.acknowledged === acknowledged) return
    this.state.set({ ...snapshot, acknowledged })
  }

  cancelConfirmation() {
    const snapshot = this.state.getSnapshot()
    if (!snapshot.open || snapshot.submitting || snapshot.confirming === null) return
    this.state.set({ ...snapshot, confirming: null, acknowledged: false })
  }

  async confirm() {
    const binding = this.binding
    const snapshot = this.state.getSnapshot()
    if (binding === null || !snapshot.open || snapshot.submitting || snapshot.confirming === null || !snapshot.acknowledged) return
    await this.settle(binding, snapshot.confirming)
  }

  async settle(binding, option) {
    const snapshot = this.state.getSnapshot()
    if (this.binding !== binding || !snapshot.open || snapshot.submitting) return
    this.state.set({ ...snapshot, submitting: true, confirming: null, acknowledged: false, error: null })
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
