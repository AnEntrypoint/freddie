import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { HarnessClient, isRecord, SdkProtocolError } from './client.js'

export class DeepSeekHarness {
  clientInstance
  launch
  cwd
  provider
  model
  maxTokens
  initialized
  closed = false

  constructor(options) {
    this.launch = options.launch
    this.clientInstance = new HarnessClient(options.launch)
    this.cwd = resolve(options.cwd ?? options.launch.cwd ?? process.cwd())
    this.provider = options.provider ?? 'deepseek-official'
    this.model = options.model ?? 'deepseek-v4-flash'
    this.maxTokens = options.maxTokens
  }

  get client() {
    return this.clientInstance
  }

  start() {
    this.initialized ??= (async () => {
      try {
        this.clientInstance.start()
        await this.clientInstance.initialize({
          cwd: this.cwd,
          provider: this.provider,
          model: this.model,
          ...this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens },
        })
      } catch (error) {
        this.initialized = undefined
        await this.clientInstance.close()
        if (!this.closed) this.clientInstance = new HarnessClient(this.launch)
        throw error
      }
    })()
    return this.initialized
  }

  session(sessionId) {
    return new HarnessSession(this, sessionId ?? `session-${randomUUID().replaceAll('-', '')}`)
  }

  run(input, options) {
    return this.session(options?.sessionId).run(input, options)
  }

  close() {
    this.closed = true
    return this.clientInstance.close()
  }

  [Symbol.asyncDispose]() {
    return this.close()
  }
}

export class HarnessSession {
  constructor(harness, id) {
    this.harness = harness
    this.id = id
  }

  async run(input, options) {
    await this.harness.start()
    const client = this.harness.client
    const contentBlocks = normalizeInput(input)
    const events = []
    const notifications = []

    const subscription = client.subscribeSessionTree(this.id)
    const collect = (notification) => {
      if (notification.method === 'session.event' && notification.params.sessionId === this.id) {
        const event = validatedSessionEvent(notification.params.event)
        notifications.push(notification)
        options?.onNotification?.(notification)
        events.push(event)
        return
      }
      notifications.push(notification)
      options?.onNotification?.(notification)
    }
    try {
      const messageId = await client.prompt(this.id, contentBlocks, {
        enabledTools: options?.enabledTools,
        disabledTools: options?.disabledTools,
        ...options !== undefined && 'turnContext' in options ? { turnContext: options.turnContext } : {},
      })
      let received = false
      while (true) {
        const notification = await subscription.next()
        if (!received) {
          if (notification.method !== 'session.event'
            || notification.params.sessionId !== this.id
            || !isInboxReceipt(notification.params.event, messageId)) continue
          received = true
        }
        collect(notification)
        if (notification.method === 'session.status'
          && notification.params.sessionId === this.id
          && notification.params.status === 'idle') break
      }
    } finally {
      subscription.close()
    }

    return {
      sessionId: this.id,
      finalResponse: finalResponse(events),
      events,
      notifications,
    }
  }
}

export function normalizeInput(input) {
  return typeof input === 'string' ? [{ type: 'text', text: input }] : input
}

function validatedSessionEvent(value) {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new SdkProtocolError(`session.event carried no event envelope: ${JSON.stringify(value)}`)
  }
  if (value.type === 'assistant/message') {
    const message = isRecord(value.data) ? value.data.message : undefined
    const content = isRecord(message) ? message.content : undefined
    if (!Array.isArray(content) || !content.every(block => isRecord(block) && typeof block.type === 'string')) {
      throw new SdkProtocolError(`assistant/message event carried malformed content: ${JSON.stringify(value)}`)
    }
  }
  return value
}

function isInboxReceipt(value, messageId) {
  if (!isRecord(value) || value.type !== 'agent/inbox/spliced' || !isRecord(value.data)) return false
  const inserted = value.data.inserted
  return Array.isArray(inserted) && inserted.some(message => isRecord(message) && message.id === messageId)
}

export function finalResponse(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event?.type !== 'assistant/message') continue
    return event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
  }
  return ''
}
