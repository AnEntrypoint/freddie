const KEY_PREFIX = { approval: 'a', question: 'q' }

export class PendingWait {
  kind
  key
  sessionId
  payload
  #settled = false
  #rpcId
  #respond

  constructor(
    kind, rpcId, sessionId, payload,
    respond,
  ) {
    this.kind = kind
    this.key = `${KEY_PREFIX[kind]}:${rpcId}`
    this.sessionId = sessionId
    this.payload = payload
    this.#rpcId = rpcId
    this.#respond = respond
  }

  respond(result) {
    if (this.#settled) throw new Error(`pending wait ${this.key} is already settled`)
    return this.#respond({ type: 'client-response', rpcId: this.#rpcId, result })
  }

  markSettled() {
    this.#settled = true
  }
}
