import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export function limitField(field, minimum) {
  return {
    field,
    format: value => typeof value === 'number' ? String(value) : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      const parsed = Number(trimmed)
      if (!Number.isSafeInteger(parsed) || parsed < minimum || Object.is(parsed, -0)) return undefined
      return { kind: 'set', value: parsed }
    },
  }
}

export class StagedForm {
  constructor(scope, specs) {
    this.scope = scope
    this.specs = new Map(specs.map(spec => [spec.field, spec]))
    this.staged = new Map()
    this.listeners = new Set()
    this.saving = false
    this.failed = false
    scope.subscribe(() => { this.publish() })
  }

  bind(project) {
    const store = createSnapshotStore(project())
    this.listeners.add(() => { store.set(project()) })
    return store
  }

  shell() {
    const snapshot = this.scope.getSnapshot()
    const plan = this.plan()
    const sectionIsReadable = snapshot.status === 'ready'
    return {
      available: sectionIsReadable,
      writable: snapshot.writable,
      dirty: plan.length > 0,
      invalid: plan.some(item => item.run === undefined),
      saving: this.saving,
      failed: this.failed,
    }
  }

  field(field) {
    const staged = this.staged.get(field)
    const spec = this.spec(field)
    if (staged === undefined) {
      return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
    }
    const write = staged.clear ? { kind: 'clear' } : spec.parse(staged.text)
    return { text: staged.text, overridden: write?.kind === 'set', invalid: write === undefined }
  }

  actions() {
    return {
      edit: (field, text) => { this.stage(field, { text, clear: false }) },
      resetField: (field) => {
        this.stage(field, { text: this.spec(field).format(this.baseValue(field)), clear: true })
      },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.publish()
      },
    }
  }

  async save() {
    const plan = this.plan()
    const writes = plan.flatMap(item => item.run === undefined ? [] : [item.run])
    if (plan.length === 0 || this.saving || writes.length !== plan.length) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const write of writes) {
      landed = await write() && landed
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  plan() {
    const plan = []
    for (const [field, staged] of this.staged) {
      const spec = this.spec(field)
      if (staged.clear) {
        if (this.stored(field)) plan.push({ field, run: () => this.clear(field) })
        continue
      }
      if (staged.text === spec.format(this.sectionValue(field))) continue
      const write = spec.parse(staged.text)
      if (write === undefined) plan.push({ field, run: undefined })
      else if (write.kind === 'clear') plan.push({ field, run: () => this.clear(field) })
      else plan.push({ field, run: () => this.store(field, write.value) })
    }
    return plan
  }

  async clear(field) {
    await this.scope.unset(field)
    return !this.stored(field)
  }

  async store(field, value) {
    await this.scope.set(field, value)
    return this.userLayer()?.[field] === value
  }

  stage(field, edit) {
    this.staged.set(field, edit)
    this.failed = false
    this.publish()
  }

  spec(field) {
    const spec = this.specs.get(field)
    if (spec === undefined) throw new Error(`subagent card has no field ${field}`)
    return spec
  }

  sectionValue(field) {
    return this.scope.getSnapshot().value?.[field]
  }

  baseValue(field) {
    return this.scope.getSnapshot().base?.[field]
  }

  userLayer() {
    return this.scope.getSnapshot().user
  }

  stored(field) {
    const user = this.userLayer()
    return user !== undefined && Object.hasOwn(user, field)
  }

  publish() {
    for (const listener of this.listeners) listener()
  }
}
