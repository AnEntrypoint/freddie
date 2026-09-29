/**
 * The web-search form: what the user typed, written only on save.
 *
 * Two of the three controls are ordinary section fields. The third — the key —
 * is a write-only control: its literal never rides a response, so the card
 * learns only whether one is configured and addresses it through the
 * credentials domain rather than the settings document. It is still staged with
 * the rest of the form, so one save covers everything the card shows.
 *
 * A card owns this model rather than importing the Plugins section's because
 * the client bundle-purity gate forbids a value import across plugins.
 */

import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

/**
 * A free-text field. An empty draft clears the field, so emptying the control
 * and saving is the same gesture as resetting it.
 * @param field - field name inside the namespace section.
 * @returns the field's conversion spec.
 */
export function textField(field) {
  return {
    field,
    format: value => typeof value === 'string' ? value : '',
    parse: (text) => {
      const trimmed = text.trim()
      return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed }
    },
  }
}

/**
 * An endpoint URL field.
 *
 * The endpoint is where the provider sends a credentialed request, so the
 * control admits only an absolute `http(s)` URL and blocks the save on anything
 * else — a relative path, or a non-web scheme such as `file:` or `data:`, is
 * refused here rather than reaching the Host. That narrows the scheme, not the
 * host: an operator naming a different host is the entire point of the field,
 * and only the Host can judge whether that host should be trusted.
 * @param field - field name inside the namespace section.
 * @returns the field's conversion spec.
 */
export function endpointField(field) {
  return {
    field,
    format: value => typeof value === 'string' ? value : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      let parsed
      try {
        parsed = new URL(trimmed)
      } catch {
        return undefined
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
      return { kind: 'set', value: parsed.href }
    },
  }
}

/**
 * A whole-number field with a floor. An empty draft clears the field; any other
 * draft that is not a finite safe integer at or above the floor blocks the save.
 * @param field - field name inside the namespace section.
 * @param minimum - smallest whole number the field accepts.
 * @returns the field's conversion spec.
 */
export function budgetField(field, minimum) {
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

/**
 * Stages one card's edits over one settings namespace and writes them on save.
 *
 * The form publishes through a snapshot store because slot components read
 * through a snapshot selector while the scope, the local drafts, and the
 * credential answer change underneath; every projection is rebuilt from them.
 */
export class StagedForm {
  /**
   * @param scope - the bound settings scope for this card's namespace.
   * @param specs - the section fields this card edits.
   * @param secrets - the card's write-only controls, written outside the section.
   */
  constructor(scope, specs, secrets = []) {
    this.scope = scope
    this.specs = new Map(specs.map(spec => [spec.field, spec]))
    this.secretSpecs = new Map(secrets.map(spec => [spec.field, spec]))
    this.staged = new Map()
    this.listeners = new Set()
    this.saving = false
    this.failed = false
    scope.subscribe(() => { this.publish() })
  }

  /**
   * Publish a projection of this form, rebuilt whenever an input changes.
   * @param project - build the card's state from the form's current reads.
   * @returns the store the card's component reads through its bound selector.
   */
  bind(project) {
    const store = createSnapshotStore(project())
    this.listeners.add(() => { store.set(project()) })
    return store
  }

  /**
   * Read the card-level state: what the Host serves, and what a save would do.
   * @returns the form state every card shares.
   */
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

  /**
   * Read one control's state. A secret control reports no override and no
   * invalidity: it holds no stored value to compare against, and a blank draft
   * simply writes nothing.
   * @param field - field name of a section field or of a write-only control.
   * @returns the draft text, whether a save would leave an override, and whether it is invalid.
   */
  field(field) {
    const staged = this.staged.get(field)
    if (this.secretSpecs.has(field)) return { text: staged?.text ?? '', overridden: false, invalid: false }
    const spec = this.spec(field)
    if (staged === undefined) {
      return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
    }
    const write = staged.clear ? { kind: 'clear' } : spec.parse(staged.text)
    return { text: staged.text, overridden: write?.kind === 'set', invalid: write === undefined }
  }

  /**
   * Build the edit, reset, save, and discard actions bound to this form.
   * @returns the actions a card's slot entry injects.
   */
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

  /**
   * Write every staged edit, then re-seed from what the Host accepted.
   *
   * The Host is the only authority on whether a value was accepted, so the
   * outcome is read back from the section rather than predicted here. A save
   * that did not land keeps its drafts so the user can correct them.
   * @returns settlement after every write and the read-back.
   */
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

  /**
   * Every staged edit a save would write. An entry whose draft is not a value
   * its field accepts carries no write: the form stays dirty and the save
   * refuses rather than dropping the edit. A blank secret writes nothing, which
   * keeps the stored key rather than clearing it.
   * @returns the planned writes, in the order the fields were staged.
   */
  plan() {
    const plan = []
    for (const [field, staged] of this.staged) {
      const secret = this.secretSpecs.get(field)
      if (secret !== undefined) {
        if (staged.text.trim() !== '') plan.push({ field, run: () => secret.write(staged.text.trim()) })
        continue
      }
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

  /** @returns whether the Host reports the clear landed. */
  async clear(field) {
    await this.scope.unset(field)
    return !this.stored(field)
  }

  /** @returns whether the Host now reports the stored value. */
  async store(field, value) {
    await this.scope.set(field, value)
    return this.userLayer()?.[field] === value
  }

  /** Stage one edit and republish. */
  stage(field, edit) {
    this.staged.set(field, edit)
    this.failed = false
    this.publish()
  }

  /** @returns the field's conversion spec, throwing on an undeclared field. */
  spec(field) {
    const spec = this.specs.get(field)
    if (spec === undefined) throw new Error(`web-search card has no field ${field}`)
    return spec
  }

  /** @returns the current resolved section value. */
  sectionValue(field) {
    return this.scope.getSnapshot().value?.[field]
  }

  /** @returns the composition-layer value a reset re-inherits. */
  baseValue(field) {
    return this.scope.getSnapshot().base?.[field]
  }

  /** @returns the raw user layer, whose key presence marks an override. */
  userLayer() {
    return this.scope.getSnapshot().user
  }

  /** @returns whether the raw user layer carries this field. */
  stored(field) {
    const user = this.userLayer()
    return user !== undefined && Object.hasOwn(user, field)
  }

  /** Republish every bound projection. */
  publish() {
    for (const listener of this.listeners) listener()
  }
}
