/**
 * The Worker's Chrome DevTools Protocol hub.
 *
 * Every DevTools connection owns ONE V8 inspector session attached to the Host
 * main thread with `Session.prototype.connectToMainThread()`, which is what
 * makes Host Console evaluation, Sources, and breakpoints available while the
 * Inspector's own state lives in this Worker: a session created here would
 * otherwise attach to the Worker's own isolate. Network nodes come from the
 * Worker's retained fetch journal and Elements nodes from the Worker's Cordis
 * snapshot — neither is re-derived from live Host objects.
 * @module @freddie/freddie-inspector/cdp
 */

import { Session } from 'node:inspector'

/** Inspector methods forwarded verbatim to the Host main thread's V8 inspector. */
const FORWARDED_METHODS = new Set([
  'Runtime.enable', 'Runtime.disable', 'Runtime.getProperties',
  'Runtime.callFunctionOn', 'Runtime.releaseObject', 'Runtime.releaseObjectGroup',
  'Runtime.runIfWaitingForDebugger', 'Runtime.setCustomObjectFormatterEnabled',
  'Debugger.enable', 'Debugger.disable', 'Debugger.getScriptSource',
  'Debugger.setBreakpointByUrl', 'Debugger.setBreakpoint', 'Debugger.removeBreakpoint',
  'Debugger.setBreakpointsActive', 'Debugger.setSkipAllPauses',
  'Debugger.setPauseOnExceptions', 'Debugger.setAsyncCallStackDepth',
  'Debugger.setBlackboxPatterns', 'Debugger.getPossibleBreakpoints',
  'Debugger.pause', 'Debugger.resume', 'Debugger.stepInto', 'Debugger.stepOut',
  'Debugger.stepOver', 'Debugger.continueToLocation', 'Debugger.evaluateOnCallFrame',
  'Debugger.setVariableValue', 'Debugger.setReturnValue',
])

/** Inspector events relayed to the connected DevTools frontend. */
const FORWARDED_EVENTS = [
  'Runtime.executionContextCreated', 'Runtime.executionContextDestroyed',
  'Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Runtime.inspectRequested',
  'Debugger.scriptParsed', 'Debugger.paused', 'Debugger.resumed',
  'Debugger.breakpointResolved', 'Log.entryAdded',
]

/**
 * The only `Runtime.evaluate` parameters forwarded to V8; `#dispatch` drops every
 * other key, `contextId` included, so the expression always runs in the Host's
 * default context. `Runtime.evaluate` is deliberately absent from
 * {@link FORWARDED_METHODS}: listing it there would make the narrowing unreachable.
 */
const EVALUATE_PARAMETERS = [
  'expression', 'objectGroup', 'includeCommandLineAPI', 'silent', 'returnByValue',
  'generatePreview', 'userGesture', 'awaitPromise', 'throwOnSideEffect', 'timeout',
  'disableBreaks', 'replMode', 'allowUnsafeEvalBlockedByCSP', 'uniqueContextId',
]

const NODE_TYPE_ELEMENT = 1
const NODE_TYPE_DOCUMENT = 9

/**
 * One DevTools connection's CDP surface.
 */
export class CdpHub {
  #send
  #targetId
  #network
  #elements
  #inspector
  #close
  #unsubscribes = []

  /**
   * @param {object} args - hub inputs.
   * @param {(payload: object) => void} args.send - write one CDP envelope.
   * @param {() => void} args.close - drop the connection.
   * @param {string} args.targetId - the single Host target id.
   * @param {{ list: () => object[], get: (requestId: string) => object | undefined }} args.network -
   *   the Worker's retained fetch journal.
   * @param {{ snapshot: () => object | undefined, subscribe: (listener: () => void) => () => void }} args.elements -
   *   the Worker's Cordis snapshot store.
   */
  constructor({ send, close, targetId, network, elements }) {
    this.#send = send
    this.#targetId = targetId
    this.#network = network
    this.#elements = elements
    this.#inspector = new Session()
    this.#close = close
    this.#inspector.connectToMainThread()
    for (const name of FORWARDED_EVENTS) {
      const listener = (params) => { this.event(name, params ?? {}) }
      this.#inspector.on(name, listener)
      this.#unsubscribes.push(() => { this.#inspector.off(name, listener) })
    }
    this.#unsubscribes.push(elements.subscribe(() => {
      this.event('DOM.documentUpdated', {})
    }))
  }

  /** Send one CDP event. */
  event(method, params) {
    this.#send({ method, params })
  }

  /** Drop the underlying connection. */
  close() {
    this.#close()
  }

  /**
   * Handle one decoded CDP request frame.
   * @param {unknown} message - parsed JSON envelope.
   * @returns {Promise<void>} settles once the response has been written.
   */
  async receive(message) {
    if (message === null || typeof message !== 'object') return
    const id = typeof message.id === 'number' ? message.id : undefined
    const method = typeof message.method === 'string' ? message.method : ''
    if (method === '') {
      if (id !== undefined) this.#error(id, -32600, 'CDP frames must carry a method')
      return
    }
    try {
      const result = await this.#dispatch(method, message.params ?? {})
      if (id !== undefined) this.#send({ id, result: result ?? {} })
    } catch (error) {
      if (id !== undefined) {
        this.#error(id, -32000, error instanceof Error ? error.message : String(error))
      }
    }
  }

  /** Release the V8 session and every subscription. */
  dispose() {
    for (const unsubscribe of this.#unsubscribes.splice(0)) {
      try {
        unsubscribe()
      } catch (_oneFailedListenerTeardownMustNotStrandTheRest) {
      }
    }
    try {
      this.#inspector.disconnect()
    } catch (_sessionAlreadyDetached) {
    }
  }

  #error(id, code, message) {
    this.#send({ id, error: { code, message } })
  }

  async #dispatch(method, params) {
    if (FORWARDED_METHODS.has(method)) {
      return this.#forward(method, params)
    }
    switch (method) {
      case 'Runtime.evaluate': {
        const narrowed = {}
        for (const key of EVALUATE_PARAMETERS) {
          if (params[key] !== undefined) narrowed[key] = params[key]
        }
        return this.#forward(method, narrowed)
      }
      case 'Network.enable':
        for (const record of this.#network.list()) this.#replayNetwork(record)
        return {}
      case 'Network.disable':
      case 'Network.setCacheDisabled':
      case 'Network.setMonitoringXHREnabled':
      case 'Network.clearBrowserCache':
      case 'Log.enable':
      case 'Log.disable':
      case 'Log.clear':
      case 'Inspector.enable':
      case 'Inspector.disable':
      case 'Page.enable':
      case 'Page.disable':
      case 'Target.setAutoAttach':
      case 'Target.setDiscoverTargets':
        return {}
      case 'Network.getResponseBody':
        return { body: this.#network.get(String(params.requestId))?.responseBody ?? '', base64Encoded: false }
      case 'Network.getRequestPostData':
        return { postData: this.#network.get(String(params.requestId))?.requestBody ?? '' }
      case 'Target.getTargetInfo':
        return { targetInfo: this.#targetInfo() }
      case 'Target.getTargets':
        return { targetInfos: [this.#targetInfo()] }
      case 'Target.attachToTarget':
        return { sessionId: 'host' }
      case 'Page.getResourceTree':
        return { frameTree: { frame: { id: 'host', url: 'freddie://host', securityOrigin: 'freddie://host', mimeType: 'text/html' }, resources: [] } }
      case 'DOM.getDocument':
        return { root: this.#elements.document(typeof params.depth === 'number' ? params.depth : 3) }
      case 'DOM.requestChildNodes': {
        const nodes = this.#elements.children(Number(params.nodeId))
        if (nodes !== undefined) this.event('DOM.setChildNodes', { parentId: Number(params.nodeId), nodes })
        return {}
      }
      case 'DOM.getOuterHTML':
        return { outerHTML: this.#elements.outerHtml(Number(params.nodeId)) }
      default:
        throw new Error(`inspector: ${method} is not implemented by this Host target`)
    }
  }

  #forward(method, params) {
    return new Promise((resolve, reject) => {
      this.#inspector.post(method, params, (error, response) => {
        if (error) reject(error instanceof Error ? error : new Error(String(error)))
        else resolve(response ?? {})
      })
    })
  }

  #replayNetwork(record) {
    const { requestId } = record
    this.event('Network.requestWillBeSent', {
      requestId,
      loaderId: 'freddie-host',
      documentURL: 'freddie://host',
      request: { url: record.url, method: record.method, headers: record.headers ?? {} },
      timestamp: (record.wallTimeMs ?? Date.now()) / 1000,
      wallTime: (record.wallTimeMs ?? Date.now()) / 1000,
      initiator: { type: 'other' },
    })
    if (record.status !== undefined) {
      this.event('Network.responseReceived', {
        requestId,
        loaderId: 'freddie-host',
        timestamp: Date.now() / 1000,
        type: 'Other',
        response: {
          url: record.url,
          status: record.status,
          statusText: record.statusText ?? '',
          headers: record.responseHeaders ?? {},
          mimeType: record.mimeType ?? '',
        },
      })
      this.event('Network.loadingFinished', { requestId, timestamp: Date.now() / 1000 })
    }
    if (record.error !== undefined) {
      this.event('Network.loadingFailed', {
        requestId,
        timestamp: Date.now() / 1000,
        type: 'Other',
        errorText: record.error,
        canceled: Boolean(record.canceled),
      })
    }
  }

  #targetInfo() {
    return {
      targetId: this.#targetId,
      type: 'page',
      title: 'Freddie Host',
      url: 'freddie://host',
      attached: true,
      canAccessOpener: false,
    }
  }
}

/**
 * The Elements projection of the Cordis snapshot: a fixed `<inspector>`
 * document holding `<host>` and `<clients>`, one `<client>` per Client realm
 * once one exists.
 *
 * Node ids are per-connection; backend ids are derived from the node path so a
 * rebuilt snapshot keeps stable identities. A changed snapshot emits
 * `DOM.documentUpdated` and DevTools re-reads the document, which is coarser
 * than upstream's node-level diffing and is documented as deferred work.
 */
export class ElementsBackend {
  #snapshot
  #rendered = ''
  #listeners = new Set()
  #nodes = new Map()
  #ids = new Map()

  constructor(read) {
    this.#read = read
  }

  #read

  /** Install the latest snapshot, notifying subscribers only when it changed. */
  refresh() {
    const snapshot = this.#read()
    this.#snapshot = snapshot
    const rendered = snapshot === undefined ? '' : JSON.stringify(snapshot)
    if (rendered === this.#rendered) return
    this.#rendered = rendered
    for (const listener of this.#listeners) listener()
  }

  /**
   * Subscribe to snapshot replacement.
   * @param {() => void} listener - called after every refresh.
   * @returns {() => void} disposer.
   */
  subscribe(listener) {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Latest snapshot, or `undefined` before the Host publishes one. */
  snapshot() {
    return this.#snapshot
  }

  /**
   * Build the Elements document to the requested depth.
   * @param {number} depth - levels to expand; `-1` expands everything.
   * @returns {object} the `#document` CDP node.
   */
  document(depth) {
    this.#nodes = new Map()
    const host = this.#element('host', this.#snapshot?.nodes ?? [], depth, 2)
    const clients = { nodeId: this.#id('clients'), backendNodeId: 0, nodeType: NODE_TYPE_ELEMENT, nodeName: 'clients', nodeValue: '', childNodeCount: 0 }
    const inspector = { nodeId: this.#id('inspector'), backendNodeId: 0, nodeType: NODE_TYPE_ELEMENT, nodeName: 'inspector', nodeValue: '', childNodeCount: 2, children: [host, clients] }
    return {
      nodeId: 1,
      backendNodeId: 0,
      nodeType: NODE_TYPE_DOCUMENT,
      nodeName: '#document',
      nodeValue: '',
      childNodeCount: 1,
      children: [inspector],
    }
  }

  /**
   * Children of an already-built node, for `DOM.requestChildNodes`.
   * @param {number} nodeId - connection-local node id.
   * @returns {object[] | undefined} children, or `undefined` for an unknown id.
   */
  children(nodeId) {
    const node = this.#nodes.get(nodeId)
    return node === undefined ? undefined : (node.children ?? [])
  }

  /**
   * Render one node as HTML for `DOM.getOuterHTML`.
   * @param {number} nodeId - connection-local node id.
   * @returns {string} the element's opening tag, or an empty string.
   */
  outerHtml(nodeId) {
    const node = this.#nodes.get(nodeId)
    if (node === undefined) return ''
    const attributes = (node.attributes ?? []).map((value, index) => (index % 2 === 0 ? ` ${value}=""` : ''))
    return `<${node.nodeName}${attributes.join('')}>`
  }

  #element(name, cordisNodes, depth, nextId) {
    const nodeId = this.#id(`${name}:${nextId}`)
    if (depth === 0 && cordisNodes.length > 0) {
      const withheld = { nodeId, backendNodeId: nextId, nodeType: NODE_TYPE_ELEMENT, nodeName: name, nodeValue: '', childNodeCount: cordisNodes.length }
      this.#nodes.set(nodeId, withheld)
      return withheld
    }
    const children = cordisNodes.map((cordisNode, index) => this.#cordis(cordisNode, depth - 1, `${nextId}.${index}`))
    const node = { nodeId, backendNodeId: nextId, nodeType: NODE_TYPE_ELEMENT, nodeName: name, nodeValue: '', childNodeCount: children.length, children }
    this.#nodes.set(nodeId, node)
    return node
  }

  #cordis(cordisNode, depth, path) {
    const nodeId = this.#id(path)
    const attributes = cordisNode.kind === 'fiber'
      ? ['uid', String(cordisNode.uid), 'name', String(cordisNode.name), 'state', String(cordisNode.state)]
      : []
    if (depth === 0 && cordisNode.children.length > 0) {
      const withheld = { nodeId, backendNodeId: hashPath(path), nodeType: NODE_TYPE_ELEMENT, nodeName: `cordis-${cordisNode.kind}`, nodeValue: '', attributes, childNodeCount: cordisNode.children.length }
      this.#nodes.set(nodeId, withheld)
      return withheld
    }
    const children = cordisNode.children.map((child, index) => this.#cordis(child, depth - 1, `${path}.${index}`))
    const node = {
      nodeId,
      backendNodeId: hashPath(path),
      nodeType: NODE_TYPE_ELEMENT,
      nodeName: `cordis-${cordisNode.kind}`,
      nodeValue: '',
      attributes,
      childNodeCount: children.length,
      children,
    }
    this.#nodes.set(nodeId, node)
    return node
  }

  #id(key) {
    let id = this.#ids.get(key)
    if (id === undefined) {
      id = this.#ids.size + 2
      this.#ids.set(key, id)
    }
    return id
  }
}

/** Stable 31-bit backend id for a snapshot path. */
function hashPath(path) {
  let hash = 2166136261
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 1) + 1
}
