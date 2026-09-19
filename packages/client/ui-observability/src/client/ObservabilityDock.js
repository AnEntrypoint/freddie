import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './ObservabilityDock.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'
import {
  graphNodes,
  inspectGraph,
  layoutGraph,
  overlayWalk,
  walkingOf,
} from './graph-walk.js'

function connectionLabel(state) {
  switch (state) {
    case 'connected': return 'Realtime connected'
    case 'reconnecting': return 'Reconnecting live updates'
    case 'offline': return 'Realtime updates offline'
    default: return 'Connecting live updates'
  }
}

function phase(value) {
  if (value?.status === 'running') return value.phase === null ? `Running ${value.verb ?? 'GM'}` : value.phase
  if (value?.phase !== null && value?.phase !== undefined) return value.phase
  return 'Idle'
}

function isOpen(status) {
  return status !== 'completed' && status !== 'resolved' && status !== 'witnessed' && status !== 'parked' && status !== 'done'
}

function overlayItems(overlay, nodeId) {
  return overlay.byNode.get(nodeId) ?? []
}

export class FreddieObservabilityDock extends HTMLElement {
  #props = null
  #selectedNodeId = null
  #draft = null
  #editError = null
  #busy = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #select(nodeId) {
    this.#selectedNodeId = nodeId
    this.#draft = null
    this.#editError = null
    this.#render()
  }

  #nodeOf(gm, id) {
    return graphNodes(gm).find(node => node.id === id)
  }

  #draftOf(node) {
    if (this.#draft !== null && this.#draft.id === node.id) return this.#draft
    return {
      id: node.id,
      kind: node.kind,
      title: node.title ?? '',
      subject: node.subject ?? '',
      status: node.status ?? 'pending',
      obligationKind: node.obligationKind ?? '',
      prdId: node.prdId ?? '',
      routeFamily: node.routeFamily ?? '',
      witness: '',
    }
  }

  #patchDraft(node, patch) {
    this.#draft = { ...this.#draftOf(node), ...patch }
    this.#render()
  }

  async #run(action) {
    const props = this.#props
    if (props === null || this.#busy) return
    this.#busy = true
    this.#editError = null
    this.#render()
    try {
      const result = await action()
      if (result?.ok === false) {
        this.#editError = result.error?.message ?? 'GM edit was rejected'
      } else {
        this.#draft = null
      }
    } catch (error) {
      this.#editError = error instanceof Error ? error.message : String(error)
    } finally {
      this.#busy = false
      this.#render()
    }
  }

  #nodeCard(node, walking, overlay) {
    const walkingHere = walking?.nodeId === node.id
    const items = overlayItems(overlay, node.id)
    return h('article', {
      key: node.id,
      class: css.node ?? '',
      'data-gm-node': node.id,
      'data-kind': node.kind,
      'data-status': node.status,
      ...node.prdId === null || node.prdId === undefined ? {} : { 'data-from': node.prdId, 'data-to': node.id },
      ...walkingHere ? { 'data-walking': walking.verb ?? 'running' } : {},
      ...this.#selectedNodeId === node.id ? { 'data-selected': '' } : {},
      onclick: () => { this.#select(node.id) },
    },
      h('span', { class: css.label ?? '' }, node.kind === 'prd' ? 'PRD' : 'Mutable'),
      h('strong', { class: css.value ?? '' }, node.title ?? node.id),
      h('span', { class: css.detail ?? '' }, [
        node.status,
        node.obligationKind,
        walkingHere ? `walking ${walking.verb}` : undefined,
      ].filter(Boolean).join(' · ')),
      items.length === 0 ? null : items.map(item => h('span', {
        key: item.key,
        class: css.overlay ?? '',
        'data-overlay': item.kind,
      }, `${item.label}: ${item.detail}`)),
    )
  }

  #inspector(gm) {
    const props = this.#props
    const node = this.#selectedNodeId === null ? undefined : this.#nodeOf(gm, this.#selectedNodeId)
    if (node === undefined) {
      return h('aside', { class: css.inspector ?? '', 'data-gm-inspector': '' },
        h('h2', null, 'Node'),
        h('p', { class: css.empty ?? '' }, 'Select a PRD or mutable to inspect and edit it while GM walks the graph.'),
      )
    }
    const draft = this.#draftOf(node)
    const field = (label, key, multiline = false) => h('label', { class: css.field ?? '' },
      h('span', { class: css.label ?? '' }, label),
      h(multiline ? 'textarea' : 'input', {
        class: css.input ?? '',
        value: draft[key] ?? '',
        oninput: (event) => { this.#patchDraft(node, { [key]: event.target.value }) },
      }),
    )
    return h('aside', { class: css.inspector ?? '', 'data-gm-inspector': node.id },
      h('h2', null, node.kind === 'prd' ? `PRD ${node.id}` : `Mutable ${node.id}`),
      this.#editError === null ? null : h('p', { class: css.empty ?? '', 'data-tone': 'error' }, this.#editError),
      field('Title', 'title'),
      field('Subject', 'subject', true),
      node.kind === 'prd' ? field('Status', 'status') : field('Obligation', 'obligationKind'),
      node.kind === 'prd' ? field('Route family', 'routeFamily') : field('PRD id', 'prdId'),
      h('div', { class: css.controls ?? '' },
        h('button', {
          type: 'button',
          class: css.action ?? '',
          disabled: this.#busy,
          onclick: () => {
            void this.#run(() => node.kind === 'prd'
              ? props.prdAdd({
                id: node.id,
                title: draft.title,
                subject: draft.subject,
                status: draft.status,
                route_family: draft.routeFamily,
              })
              : props.mutableAdd({
                id: node.id,
                prd_id: draft.prdId,
                obligation_kind: draft.obligationKind,
                subject: draft.title,
                text: draft.subject,
              }))
          },
        }, this.#busy ? 'Saving' : 'Save'),
      ),
      isOpen(node.status) ? h('label', { class: css.field ?? '' },
        h('span', { class: css.label ?? '' }, 'Witness'),
        h('textarea', {
          class: css.input ?? '',
          value: draft.witness,
          oninput: (event) => { this.#patchDraft(node, { witness: event.target.value }) },
        }),
        h('button', {
          type: 'button',
          class: css.action ?? '',
          disabled: this.#busy || draft.witness.trim() === '',
          onclick: () => {
            void this.#run(() => node.kind === 'prd'
              ? props.prdResolve({ id: node.id, witness_evidence: draft.witness.trim() })
              : props.mutableResolve({ id: node.id, witness_text: draft.witness.trim() }))
          },
        }, 'Resolve'),
      ) : null,
    )
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const gm = props.useProjection('gmProgress')
    const connection = props.useConnection(state => state)
    const terminals = props.useTerminals(state => state)
    const sessionSnapshot = props.useSession(snapshot => snapshot)
    const chatNodes = [...sessionSnapshot.chat.nodes.values()]
    const walking = walkingOf(gm)
    const overlay = overlayWalk(chatNodes, terminals, walking?.nodeId ?? null)
    const nodes = graphNodes(gm)
    if (this.#selectedNodeId !== null && this.#nodeOf(gm, this.#selectedNodeId) === undefined) {
      this.#selectedNodeId = null
      this.#draft = null
    }
    const layout = layoutGraph(nodes)
    const inspect = inspectGraph(gm, overlay)
    const unmatched = overlay.unmatched
    applyDiff(this, h('section', {
      class: css.root ?? '',
      'data-observability-view': '',
      'data-gm-graph': JSON.stringify(inspect),
      role: 'region',
      'aria-labelledby': 'freddie-observability-title',
    },
      h('header', { class: css.bluf ?? '' },
        h('div', { class: css.connection ?? '', 'data-state': connection, role: 'status', 'aria-live': 'polite' },
          h('span', { class: css.connectionDot ?? '', 'aria-hidden': true }),
          connectionLabel(connection),
        ),
        h('h1', { id: 'freddie-observability-title' }, 'GM graph'),
        h('p', null, `${phase(gm)} · ${nodes.filter(node => isOpen(node.status)).length} open of ${nodes.length} nodes${walking?.verb === undefined || walking.verb === null ? '' : ` · walking ${walking.verb}`}`),
      ),
      h('div', { class: css.workspace ?? '' },
        h('section', { class: css.panel ?? '', 'data-observability-overview': '' },
          nodes.length === 0
            ? h('p', { class: css.empty ?? '' }, 'No PRD or mutable graph yet. GM instruction and add or resolve tools populate this view.')
            : h('div', { class: css.graph ?? '', 'data-gm-layout': 'columns' },
              layout.columns.map(column => h('div', {
                key: column.id,
                class: css.column ?? '',
                'data-gm-column': column.id,
              },
                this.#nodeCard(column.prd, walking, overlay),
                column.mutables.map(node => this.#nodeCard(node, walking, overlay)),
              )),
              layout.orphans.length === 0 ? null : h('div', {
                class: css.column ?? '',
                'data-gm-column': 'orphans',
              },
                h('span', { class: css.label ?? '' }, 'Unattached mutables'),
                layout.orphans.map(node => this.#nodeCard(node, walking, overlay)),
              ),
            ),
          unmatched.length === 0 ? null : h('section', { class: css.running ?? '', 'aria-label': 'Running work' },
            h('h2', null, 'Running work'),
            unmatched.map(item => h('p', { key: item.key, class: css.overlay ?? '', 'data-overlay': item.kind }, `${item.label}: ${item.detail}`)),
          ),
        ),
        this.#inspector(gm),
      ),
    ))
  }
}

defineElement('freddie-observability-dock', FreddieObservabilityDock)
