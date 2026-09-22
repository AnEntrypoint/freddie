import { applyDiff, createElement as h } from '@freddie/webjsx'
import { defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './ArtifactsView.css.js'

function message(result) {
  return result?.error?.code ?? 'The artifact request was rejected.'
}

function kind(value) {
  return ['artifact', 'memory', 'decision', 'evidence', 'plan'].includes(value) ? value : 'artifact'
}

export class FreddieArtifactsView extends HTMLElement {
  #props = null
  #selected = null
  #draft = { name: '', kind: 'memory', content: '' }
  #loadedItems = []
  #error = null
  #busy = false

  setProps(props) { this.#props = props; this.#load(); this.#render() }
  connectedCallback() { this.#load(); this.#render() }

  async #load() {
    const list = this.#props?.list
    if (typeof list !== 'function') return
    try {
      const result = await list()
      if (result?.ok === true) {
        this.#loadedItems = result.value.items
        this.#render()
      }
    } catch { /* The projection remains the availability fallback. */ }
  }

  #artifacts() {
    const projection = this.#props?.useProjection?.('artifacts')
    return this.#loadedItems.length > 0 ? this.#loadedItems : projection?.items ?? []
  }

  #revision() {
    return this.#props?.useProjection?.('artifacts')?.revision ?? 0
  }

  #select(item) {
    this.#selected = item.id
    this.#draft = { name: item.name, kind: item.kind, content: item.content, shareTarget: '' }
    this.#error = null
    this.#render()
  }

  #patch(patch) { this.#draft = { ...this.#draft, ...patch }; this.#render() }

  async #run(work) {
    if (this.#busy) return
    this.#busy = true
    this.#error = null
    this.#render()
    try {
      const result = await work()
      if (result?.ok === false) this.#error = message(result)
      else {
        this.#loadedItems = result.value.items
        this.#draft = { name: '', kind: 'memory', content: '' }
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
    } finally {
      this.#busy = false
      this.#render()
    }
  }

  #editor() {
    const selected = this.#artifacts().find(item => item.id === this.#selected)
    const draft = selected === undefined
      ? this.#draft
      : { name: selected.name, kind: selected.kind, content: selected.content, id: selected.id, shareTarget: this.#draft.shareTarget ?? '' }
    const field = (label, tag, key, attrs = {}) => h('label', { class: css.field ?? '' },
      h('span', null, label),
      h(tag, { value: draft[key], oninput: event => this.#patch({ [key]: event.target.value }), ...attrs }),
    )
    return h('aside', { class: css.editor ?? '', 'aria-label': 'Artifact editor' },
      h('h2', null, selected === undefined ? 'New artifact' : `Edit ${selected.name}`),
      this.#error === null ? null : h('p', { class: css.error ?? '', role: 'alert' }, this.#error),
      field('Name', 'input', 'name'),
      h('label', { class: css.field ?? '' }, h('span', null, 'Type'), h('select', {
        value: kind(draft.kind), oninput: event => this.#patch({ kind: event.target.value }),
      }, ['artifact', 'memory', 'decision', 'evidence', 'plan'].map(value => h('option', { value }, value)))),
      field('Content', 'textarea', 'content'),
      h('div', { class: css.actions ?? '' },
        h('button', { type: 'button', disabled: this.#busy, onclick: () => void this.#run(() => this.#props.put({
          ...selected === undefined ? {} : { id: selected.id },
          name: this.#draft.name || draft.name,
          kind: this.#draft.kind || draft.kind,
          content: this.#draft.content || draft.content,
          ifRevision: this.#revision(),
        })) }, selected === undefined ? 'Save artifact' : 'Save revision'),
        selected === undefined ? null : h('button', { type: 'button', disabled: this.#busy, onclick: () => void this.#run(() => this.#props.remove({ id: selected.id, ifRevision: this.#revision() })) }, 'Delete'),
        selected === undefined ? null : h('input', { placeholder: 'Session ID to share with', value: draft.shareTarget, oninput: event => this.#patch({ shareTarget: event.target.value }) }),
        selected === undefined ? null : h('button', { type: 'button', disabled: this.#busy || draft.shareTarget.trim() === '', onclick: () => void this.#run(() => this.#props.share({ id: selected.id, targetSessionId: draft.shareTarget.trim(), grant: true, ifRevision: this.#revision() })) }, 'Share'),
        selected === undefined ? null : h('button', { type: 'button', disabled: this.#busy || draft.shareTarget.trim() === '', onclick: () => void this.#run(() => this.#props.share({ id: selected.id, targetSessionId: draft.shareTarget.trim(), grant: false, ifRevision: this.#revision() })) }, 'Revoke'),
      ),
    )
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const artifacts = this.#artifacts()
    const gm = props.useProjection?.('gmProgress')
    const workflow = props.useProjection?.('workflow')
    applyDiff(this, h('section', { class: css.root ?? '', 'data-artifacts-view': '', 'aria-labelledby': 'freddie-artifacts-title' },
      h('header', { class: css.header ?? '' },
        h('p', { class: css.eyebrow ?? '' }, 'Durable conversation folder'),
        h('h1', { id: 'freddie-artifacts-title' }, 'Artifacts & memory'),
        h('p', null, `${artifacts.length} stored item${artifacts.length === 1 ? '' : 's'} · revision ${this.#revision()} · GM ${gm?.phase ?? 'idle'} · workflow ${workflow?.runs?.length ?? 0}`),
      ),
      h('div', { class: css.workspace ?? '' },
        h('section', { class: css.list ?? '', 'aria-label': 'Conversation artifacts' },
          artifacts.length === 0 ? h('p', { class: css.empty ?? '' }, 'No artifacts yet. Save a memory, decision, plan, or evidence item for this conversation.') : artifacts.map(item => h('button', {
            type: 'button', key: item.id, class: css.item ?? '', 'data-selected': item.id === this.#selected ? '' : undefined,
            onclick: () => this.#select(item),
          }, h('strong', null, item.name), h('span', null, `${item.kind} · ${item.bytes} bytes · v${item.revision}`))),
        ),
        this.#editor(),
      ),
    ))
  }
}

defineElement('freddie-artifacts-view', FreddieArtifactsView)
