// DetailsPanel: close button + the selected call's args and
// result — args as JSON, the result raw except for a terminal-card call, whose
// Output section is the command's terminal card. Reads the
// selection from the shared chat
// store (conversation writes, this panel reads — the cross-registration
// share the store seat exists for) and derives the call material from the
// session snapshot — no data of its own.

import { createElement as h } from 'webjsx'
import { renderCodeBlock } from '@freddie/freddie-client-ui-primitives'
import { shallowEqual } from '@freddie/freddie-client-runtime/client'
import { findToolCall } from '../chat/tool-node-reader.js'
import css from './DetailsPanel.css.js'

// CodeBlock's own one-shot factory recreates its freddie-code-block element
// (dropping its copy-feedback state) on every call; DetailsPanel is a plain
// function re-invoked on every store change while a call is selected. Only
// one call is ever selected at a time, so a size-1 cache (keyed by callId,
// evicted on selection change) is enough -- no per-session unbounded growth.
let cachedArgsCallId = null
let cachedArgsEl = null
function cachedArgsBlock(callId, props) {
  const el = renderCodeBlock(cachedArgsCallId === callId ? cachedArgsEl : null, props)
  cachedArgsCallId = callId
  cachedArgsEl = el
  return el
}

/** Material of a settled result node (native call or run_code sub-dispatch). */
function settledMaterial(node, callId) {
  return { name: node.call?.name ?? callId, argsRaw: node.call?.argsRaw ?? null, block: node }
}

/** Material of an in-flight call (native call or run_code sub-dispatch). */
function runningMaterial(call) {
  return { name: call.name, argsRaw: call.argsRaw, block: call }
}

function materialFor(s, callId) {
  const found = findToolCall(s, callId)
  if (found === undefined) return null
  return 'kind' in found ? settledMaterial(found, callId) : runningMaterial(found)
}

function pretty(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    // Not JSON (streaming fragment or plain text): show verbatim.
    return raw
  }
}

/** Flatten a settled result for the no-ui-tool fallback. */
function rawResultText(block) {
  if (!('kind' in block)) return ''
  const parts = block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  if (parts.length === 0 && block.error !== undefined) parts.push(`${block.error.name}: ${block.error.code}`)
  return parts.join('\n')
}

export function DetailsPanel(
  { useSession, useSessions, sessionId, useStore, renderSlot, closeDetails, t },
) {
  const selection = useStore(s => s.selection)
  // Session workspace root: an omitted or relative terminal cwd resolves
  // against it, which the pure presenter cannot see.
  const sessionCwd = useSessions(list => list.byId[sessionId]?.cwd)
  const callId = selection?.callId
  // materialFor builds a fresh wrapper; shallowEqual short-circuits on its
  // stable members (result node reference rides the snapshot's structural sharing).
  const material = useSession(
    s => (callId === undefined ? null : materialFor(s, callId)),
    (a, b) => shallowEqual(a, b))

  return h(
    'div',
    { class: css.root ?? '' },
    h(
      'div',
      { class: css.header ?? '' },
      h('div', { class: css.title ?? '' },
        selection === null ? t('details.title') : material?.name ?? selection.toolName ?? t('details.title')),
      h(
        'button',
        { type: 'button', class: css.close ?? '', 'aria-label': t('details.close'), onclick: () => { closeDetails() } },
        h('svg', { viewBox: '0 0 16 16', width: '14', height: '14', 'aria-hidden': true },
          h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round' })),
      ),
    ),
    h(
      'div',
      { class: css.body ?? '' },
      selection === null || callId === undefined
        ? h('div', { class: css.empty ?? '' }, t('details.empty'))
        : material === null
          ? h('div', { class: css.empty ?? '' }, t('details.notInWindow'))
          : [
            material.argsRaw !== null && h(
              'section',
              { class: css.section ?? '' },
              h('div', { class: css.sectionLabel ?? '' }, t('details.input')),
              cachedArgsBlock(callId, { code: pretty(material.argsRaw), lang: 'json', copyLabel: t('copy'), copiedLabel: t('copied') }),
            ),
            h(
              'section',
              { class: css.section ?? '' },
              h('div', { class: css.sectionLabel ?? '' }, t('details.output')),
              // Keyed by the selected call: the body owns per-call view
              // state (the terminal card's expand and copy), so the key
              // below forces a fresh render subtree on selection change
              // the way React's Fragment key formerly did.
              h(
                'div',
                { key: callId },
                renderSlot('conversation.details.tool', { block: material.block, cwd: sessionCwd }, {
                  fallback: 'kind' in material.block
                    ? h('pre', { class: css.code ?? '', 'data-error': material.block.isError || undefined },
                      rawResultText(material.block))
                    : h('div', { class: css.empty ?? '' }, t('details.running')),
                }),
              ),
            ),
          ],
    ),
  )
}
