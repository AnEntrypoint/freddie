/**
 * The web-search card controller: one namespace's section plus one key that
 * never rides the wire.
 *
 * The endpoint and the per-request budget are ordinary settings fields. The key
 * is not: its literal is write-only, so the card learns only whether one is
 * configured and writes through the credentials domain under the reference the
 * section names. All three are staged by one form, so one save covers the card.
 */

import { StagedForm, budgetField, endpointField } from './card-form.js'

/** The settings namespace this card edits. */
export const WEB_SEARCH_NS = 'web-search-deepseek'
/** The write-only control's field name, which no section value answers. */
export const KEY_FIELD = 'apiKey'
/** The reference a section that names none falls back to. */
const DEFAULT_KEY_REF = 'DEEPSEEK_API_KEY'
/** Smallest per-request search budget the section's schema admits. */
const MIN_USES = 1

/** A key state that asserts nothing: not configured, and not writable until a describe says so. */
function deniedUntilDescribed(ref) {
  return { ref, configured: false, writable: false }
}

/**
 * Binds one web-search section and its key to one staged form.
 */
export class WebSearchCardController {
  /**
   * @param scope - the bound settings scope for `web-search-deepseek`.
   * @param api - the credentials workface this card writes the key through.
   */
  constructor(scope, api) {
    this.scope = scope
    this.api = api
    this.epoch = 0
    this.described = false
    this.credential = deniedUntilDescribed(DEFAULT_KEY_REF)
    this.form = new StagedForm(
      scope,
      [endpointField('baseURL'), budgetField('maxUses', MIN_USES)],
      [{ field: KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    scope.subscribe(() => { void this.syncReference() })
    void this.syncReference()
  }

  /**
   * Ask the Host whether the key this section names is configured and writable.
   * The answer carries no value — only presence, writability, and source.
   * @returns settlement after the state is republished.
   */
  async readCredential() {
    const ref = this.referenceOf()
    const epoch = (this.epoch += 1)
    let described = false
    let state
    try {
      const response = await this.api.credentials.describe({ refs: [ref] })
      described = response?.result?.ok === true
      state = described ? response.result.value?.credentials?.[ref] : undefined
    } catch {
      described = false
    }
    const supersededByLaterRead = epoch !== this.epoch
    if (supersededByLaterRead) return
    this.described = described
    const hostRecognisesNoRow = state === undefined
    this.credential = {
      ref,
      configured: described && state?.configured === true,
      writable: described && (hostRecognisesNoRow || state.writable !== false),
    }
    this.form.publish()
  }

  /**
   * Re-read after a pushed invalidation.
   * @param ref - the reference the Host says changed, or any reference when absent.
   * @returns settlement after the read.
   */
  refreshCredential(ref) {
    if (ref !== undefined && ref !== this.credential.ref) return undefined
    return this.readCredential()
  }

  /**
   * Write the key the user typed. The literal goes straight to the credentials
   * domain and is never mirrored, logged, or read back.
   * @param text - the key as typed.
   * @returns whether the Host accepted it.
   */
  async writeKey(text) {
    const ref = this.referenceOf()
    let accepted = false
    try {
      const response = await this.api.credentials.set({ ref, value: text })
      accepted = response?.result?.ok === true
    } catch {
      accepted = false
    }
    await this.readCredential()
    return accepted
  }

  /**
   * Keep the key's reference aligned with the section: a save that renames the
   * reference moves which key the card addresses, and the first successful read
   * is what marks the answer delivered.
   * @returns settlement after any read this transition needed.
   */
  async syncReference() {
    if (this.scope.getSnapshot().status !== 'ready') return
    if (this.described && this.referenceOf() === this.credential.ref) return
    await this.readCredential()
  }

  /** @returns the reference the section names, or the default when it names none. */
  referenceOf() {
    const named = this.form.sectionValue('apiKeyEnv')
    return typeof named === 'string' && named.trim() !== '' ? named.trim() : DEFAULT_KEY_REF
  }

  /** @returns the card's state: its shell, its key control, and its two fields. */
  projection() {
    const { ref, configured, writable } = this.credential
    return {
      ...this.form.shell(),
      key: { ...this.form.field(KEY_FIELD), ref, configured, writable },
      baseURL: this.form.field('baseURL'),
      maxUses: this.form.field('maxUses'),
    }
  }

  /** @returns the card's snapshot hook and its form actions. */
  inject() {
    return { hooks: { webSearchCard: this.store }, ...this.form.actions() }
  }
}
