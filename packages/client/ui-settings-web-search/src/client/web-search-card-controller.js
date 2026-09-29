import { StagedForm, budgetField, endpointField } from './card-form.js'

export const WEB_SEARCH_NS = 'web-search-deepseek'
export const KEY_FIELD = 'apiKey'
const DEFAULT_KEY_REF = 'DEEPSEEK_API_KEY'
const MIN_USES = 1

function deniedUntilDescribed(ref) {
  return { ref, configured: false, writable: false }
}

export class WebSearchCardController {
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

  refreshCredential(ref) {
    if (ref !== undefined && ref !== this.credential.ref) return undefined
    return this.readCredential()
  }

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

  async syncReference() {
    if (this.scope.getSnapshot().status !== 'ready') return
    if (this.described && this.referenceOf() === this.credential.ref) return
    await this.readCredential()
  }

  referenceOf() {
    const named = this.form.sectionValue('apiKeyEnv')
    return typeof named === 'string' && named.trim() !== '' ? named.trim() : DEFAULT_KEY_REF
  }

  projection() {
    const { ref, configured, writable } = this.credential
    return {
      ...this.form.shell(),
      key: { ...this.form.field(KEY_FIELD), ref, configured, writable },
      baseURL: this.form.field('baseURL'),
      maxUses: this.form.field('maxUses'),
    }
  }

  inject() {
    return { hooks: { webSearchCard: this.store }, ...this.form.actions() }
  }
}
