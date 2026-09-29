import { applyDiff, createElement as h } from '@freddie/webjsx'
import { MessageText, renderJsonBlock, StateDot, defineElement } from '@freddie/freddie-client-ui-primitives'
import { ReferenceIcon } from '../reference/ReferenceIcon.js'
import { CompactionItem } from './CompactionItem.js'
import { renderContextInjectionRow } from './ContextInjectionRow.js'
import { renderMessageIconActions } from './MessageIconActions.js'
import css from './MessageItem.css.js'

const cachedIconActions = new WeakMap()
function cachedMessageIconActions(identity, props) {
  const el = renderMessageIconActions(cachedIconActions.get(identity) ?? null, props)
  cachedIconActions.set(identity, el)
  return el
}

const cachedJsonBlocks = new WeakMap()
function cachedJsonBlockAt(identity, index, props) {
  let perIdentity = cachedJsonBlocks.get(identity)
  if (perIdentity === undefined) {
    perIdentity = new Map()
    cachedJsonBlocks.set(identity, perIdentity)
  }
  const el = renderJsonBlock(perIdentity.get(index) ?? null, props)
  perIdentity.set(index, el)
  return el
}

function contentParts(content) {
  const texts = []
  const images = []
  const rest = []
  for (const block of content) {
    const b = block
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
    else if (b.type === 'image' && b.attachment !== undefined) {
      images.push({ attachment: b.attachment })
    }
    else rest.push(block)
  }
  return { text: texts.join(''), images, rest }
}

function retrySeconds(milliseconds) {
  return Math.max(1, Math.ceil(milliseconds / 1_000))
}

const DEFAULT_RETRY_PROPS = {
  node: { delayMs: 0, seq: 0, mode: 'normal', maxRetries: 0, retry: 0, retryState: 'scheduled', failure: { message: '' } },
  active: false,
  t: (key) => key,
}

export class FreddieModelRetryItem extends HTMLElement {
  #props = DEFAULT_RETRY_PROPS
  #deadline = 0
  #deadlineKey = null
  #timer = null

  setProps(props) {
    const key = `${props.node.delayMs}:${props.node.seq}`
    this.#props = props
    if (key !== this.#deadlineKey) {
      this.#deadlineKey = key
      this.#deadline = Date.now() + props.node.delayMs
    }
    this.#syncTimer()
    this.#render()
  }

  connectedCallback() {
    this.#syncTimer()
    this.#render()
  }

  disconnectedCallback() {
    this.#clearTimer()
  }

  #clearTimer() {
    if (this.#timer !== null) {
      clearInterval(this.#timer)
      this.#timer = null
    }
  }

  #syncTimer() {
    this.#clearTimer()
    if (!this.#props.active) return
    const tick = () => {
      const next = retrySeconds(this.#deadline - Date.now())
      this.#render()
      if (next === 1) this.#clearTimer()
    }
    if (retrySeconds(this.#deadline - Date.now()) === 1) return
    this.#timer = setInterval(tick, 250)
  }

  #render() {
    const { node, active, t } = this.#props
    const scheduledSeconds = retrySeconds(node.delayMs)
    const maximum = node.mode === 'normal' ? node.maxRetries : '∞'
    const remainingSeconds = retrySeconds(this.#deadline - Date.now())
    const label = active
      ? t('message.retry.active')
      : node.retryState === 'cancelled'
        ? t('message.retry.cancelled')
        : node.retryState === 'exhausted'
          ? t('message.retry.exhausted')
          : node.retryState === 'started'
            ? t('message.retry.started')
            : t('message.retry.scheduled')
    const seconds = active ? remainingSeconds : scheduledSeconds

    const vdom = h(
      'details',
      { class: css.retryRow ?? '', 'data-active': active || undefined },
      h(
        'summary',
        { class: css.retrySummary ?? '' },
        h('span', { class: css.retryText ?? '', role: 'status' },
          t('message.retry.status', { label, retry: node.retry, maximum, seconds })),
      ),
      h(
        'div',
        { class: css.retryDetails ?? '' },
        h('div', null,
          h('span', { class: css.retryDetailLabel ?? '' }, t('message.retry.delay')),
          `${Math.round(node.delayMs)}ms`,
        ),
        h('div', null,
          h('span', { class: css.retryDetailLabel ?? '' }, t('message.retry.failure')),
          node.failure.message,
        ),
      ),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-model-retry-item', FreddieModelRetryItem)

function renderModelRetryItem(el, props) {
  const target = el ?? document.createElement('freddie-model-retry-item')
  target.setProps(props)
  return target
}

function ModelRetryItem(props) {
  return renderModelRetryItem(null, props)
}

function TurnErrorItem({ node, t }) {
  return h(
    'div',
    { class: css.turnErrorRow ?? '', role: 'status' },
    h(StateDot, { state: 'error', className: css.turnErrorDot }),
    h(
      'div',
      { class: css.turnErrorCopy ?? '' },
      h('span', { class: css.turnErrorTitle ?? '' }, t('message.turnError')),
      h('span', { class: css.turnErrorMessage ?? '' }, node.message),
    ),
    node.code !== undefined && h('code', { class: css.turnErrorCode ?? '' }, node.code),
  )
}

function TurnMaxTokensItem({ t }) {
  return h(
    'div',
    { class: css.turnErrorRow ?? '', role: 'status' },
    h(StateDot, { state: 'warning', className: css.turnErrorDot }),
    h(
      'div',
      { class: css.turnErrorCopy ?? '' },
      h('span', { class: css.maxTokensTitle ?? '' }, t('message.maxTokens')),
      h('span', { class: css.turnErrorMessage ?? '' }, t('message.maxTokens.hint')),
    ),
  )
}

function projectUserText(text, sessionLabels) {
  const ranges = []
  for (const rawLabel of [...new Set(sessionLabels)].sort((a, b) => b.length - a.length)) {
    const label = `@${rawLabel}`
    let start = text.indexOf(label)
    while (start >= 0) {
      ranges.push({ start, end: start + label.length, label, kind: 'session' })
      start = text.indexOf(label, start + label.length)
    }
  }
  const re = /(^|\s)(\/[\w-]+|@"[^"\n]+"|@[^\s]+)/gu
  let m
  while ((m = re.exec(text)) !== null) {
    const tokenStart = m.index + (m[1]?.length ?? 0)
    const rawLabel = m[2] ?? ''
    const label = rawLabel.startsWith('@"')
      ? rawLabel
      : rawLabel.replace(/[.,;:!?\uff0c\u3002\uff1b\uff1a\uff01\uff1f]+$/gu, '')
    if (label.length <= 1) continue
    ranges.push({ start: tokenStart, end: tokenStart + label.length, label, kind: 'plain' })
  }
  ranges.sort((a, b) => a.start - b.start
    || (a.kind === b.kind ? b.end - a.end : a.kind === 'session' ? -1 : 1))
  const parts = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start < cursor) continue
    const { start: tokenStart, end, label, kind } = range
    if (tokenStart > cursor) parts.push(h(MessageText, { key: cursor, text: text.slice(cursor, tokenStart) }))
    const referenceKind = kind === 'session'
      ? 'session'
      : label.startsWith('@')
        ? label.endsWith('/') ? 'folder' : 'file'
        : undefined
    const displayLabel = referenceKind === undefined
      ? label
      : referenceKind === 'session'
        ? label.slice(1)
        : label.slice(1).replace(/^"|"$/gu, '').split(/[\\/]/u).filter(Boolean).at(-1) ?? label.slice(1)
    parts.push(
      h(
        'span',
        {
          key: tokenStart,
          class: css.refChip ?? '',
          'data-ref-chip': referenceKind ?? 'skill',
          title: label,
        },
        referenceKind !== undefined && (
          h(ReferenceIcon, { kind: referenceKind, size: 16, className: css.refIcon })
        ),
        displayLabel,
      ),
    )
    cursor = end
  }
  if (parts.length === 0) return h(MessageText, { text })
  if (cursor < text.length) parts.push(h(MessageText, { key: cursor, text: text.slice(cursor) }))
  return parts
}

function UserStyleBubble({
  identity, content, renderMessageImages, actions, pending = false, referenceLabels = [], t,
}) {
  const { text, images, rest } = contentParts(content)
  const truncated = (total) => t('json.truncated', { total })
  const showBubble = text !== '' || rest.length > 0
  return h(
    'div',
    { class: css.userRow ?? '', 'data-pending-steering': pending || undefined, 'data-time-hover-root': true },
    h(
      'div',
      { class: css.userStack ?? '' },
      renderMessageImages({ images, align: 'end' }),
      showBubble && h(
        'div',
        { class: css.bubble ?? '' },
        projectUserText(text, referenceLabels),
        rest.map((block, i) => cachedJsonBlockAt(identity, i, { label: t('message.extraBlock'), payload: block, truncatedLabel: truncated })),
      ),
      referenceLabels.length > 0 && (
        h('div', { class: css.referenceSummary ?? '' },
          t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) }))
      ),
    ),
    actions?.(text),
  )
}

export function PendingSteeringBubble({ identity, content, renderMessageImages, t }) {
  return h(UserStyleBubble, {
    identity,
    content,
    renderMessageImages,
    pending: true,
    t,
    actions: text => (
      cachedMessageIconActions(identity, {
        text,
        clock: 'start',
        className: css.actions,
        t,
      })
    ),
  })
}

export function UserMessageNodeView({
  node, renderMessageImages, t,
}) {
  const data = node.data
  return h(UserStyleBubble, {
    identity: node,
    content: data.content,
    renderMessageImages,
    ...data.referenceLabels === undefined ? {} : { referenceLabels: data.referenceLabels },
    t,
    actions: text => (
      cachedMessageIconActions(node, {
        text,
        time: data.time,
        clock: 'start',
        className: css.actions,
        t,
      })
    ),
  })
}

export function ContextMessageNodeView({ node, t }) {
  const data = node.data
  return h('freddie-context-injection-row', {
    ref: (el) => {
      renderContextInjectionRow(el, {
        content: data.content,
        source: data.source,
        provenance: data.provenance,
        form: data.form,
        t,
      })
    },
  })
}

export function CompactionNodeView({ node, t }) {
  return h(CompactionItem, { node: node.data, t })
}

export function RetryNodeView({ node, t }) {
  const data = node.data
  return h(ModelRetryItem, { node: data.current, active: data.current.retryState === 'scheduled', t })
}

export function TurnErrorNodeView({ node, t }) {
  return h(TurnErrorItem, { node: node.data, t })
}

export function TurnMaxTokensNodeView({ t }) {
  return h(TurnMaxTokensItem, { t })
}

export function UnknownNodeView({ node, t }) {
  const data = node.data
  return h(
    'div',
    { class: css.contextRow ?? '' },
    cachedJsonBlockAt(node, 0, {
      label: t('message.unknownSurface', { type: data.type }),
      payload: data.data,
      truncatedLabel: total => t('json.truncated', { total }),
    }),
  )
}
