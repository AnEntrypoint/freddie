import { applyDiff } from '@freddie/webjsx'
import { defineElement, renderJsonBlock } from '@freddie/freddie-client-ui-primitives'
import css from './ChatView.css.js'

const cachedFallback = new WeakMap()
function cachedFallbackJsonBlock(identity, props) {
  const el = renderJsonBlock(cachedFallback.get(identity) ?? null, props)
  cachedFallback.set(identity, el)
  return el
}

const seatOptions = new WeakMap()
function seatOptionsOf(routedNode, nodeKey, t) {
  const cached = seatOptions.get(routedNode)
  if (cached !== undefined && cached.nodeKey === nodeKey && cached.t === t) return cached.opts
  const opts = {
    entryKey: routedNode.kind,
    hookContext: nodeKey,
    get fallback() {
      return cachedFallbackJsonBlock(routedNode, {
        label: t('message.unknownSurface', { type: routedNode.kind }),
        payload: routedNode.data,
        truncatedLabel: total => t('json.truncated', { total }),
      })
    },
  }
  seatOptions.set(routedNode, { nodeKey, t, opts })
  return opts
}

const SEAT_PROPS = [
  'nodeKey', 'selectedCallId', 'cwd', 'openFile', 'inspectCall', 'forkAt',
  'renderMessageImages', 'fileMentions', 'renderSlot', 't', 'useSession',
]

function sameSeatProps(left, right) {
  return SEAT_PROPS.every(name => Object.is(left[name], right[name]))
}

const FLOW_DATA_ATTRIBUTES = ['chatAnchorKey', 'chatFlowKey', 'chatFlowKind']

function nodeOf(props) {
  return props.useSession.peek(snapshot => snapshot.chat.nodes.get(props.nodeKey))
}

function depthOf(element) {
  let depth = 0
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) depth++
  return depth
}

export class FreddieChatNodeSeat extends HTMLElement {
  #props = null
  #node = undefined
  #rendered = false
  #unsubscribe = null

  setProps(props) {
    const previous = this.#props
    const node = nodeOf(props)
    const unchanged = this.#rendered && node === this.#node && sameSeatProps(props, previous)
    this.#props = props
    this.#node = node
    if (this.isConnected && previous?.useSession !== props.useSession) this.#bind()
    if (unchanged) return
    this.#render()
  }

  connectedCallback() {
    if (this.#props !== null) this.#bind()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  #bind() {
    this.#unsubscribe?.()
    this.#unsubscribe = this.#props.useSession.subscribe(() => { this.#sync() }, () => depthOf(this))
  }

  #sync() {
    const node = nodeOf(this.#props)
    if (node === this.#node) return
    this.#node = node
    this.#render()
  }

  #render() {
    const { nodeKey, selectedCallId, cwd, openFile, inspectCall, forkAt, renderMessageImages, fileMentions, renderSlot, t } = this.#props
    const node = this.#node
    this.#rendered = true
    this.style.display = 'block'
    this.className = css.flowItem ?? ''
    if (node === undefined) {
      for (const name of FLOW_DATA_ATTRIBUTES) delete this.dataset[name]
      applyDiff(this, [])
      return
    }
    this.dataset.chatAnchorKey = node.key
    this.dataset.chatFlowKey = node.key
    this.dataset.chatFlowKind = node.kind
    const owner = { selectedCallId, cwd, openFile, inspectCall, forkAt, renderMessageImages, fileMentions, node }
    applyDiff(this, renderSlot('conversation.chat.node', owner, seatOptionsOf(node, nodeKey, t)))
  }
}

defineElement('freddie-chat-node-seat', FreddieChatNodeSeat)
