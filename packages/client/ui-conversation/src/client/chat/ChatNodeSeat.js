import { createElement as h } from '@freddie/webjsx'
import { renderJsonBlock } from '@freddie/freddie-client-ui-primitives'
import css from './ChatView.css.js'

const cachedFallback = new WeakMap()
function cachedFallbackJsonBlock(identity, props) {
  const el = renderJsonBlock(cachedFallback.get(identity) ?? null, props)
  cachedFallback.set(identity, el)
  return el
}

export function ChatNodeSeat({
  key, nodeKey, selectedCallId, cwd, openFile, inspectCall, forkAt,
  renderMessageImages, fileMentions, useSession, renderSlot, t,
}) {
  const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey))
  const routedNode = node
  const owner = node === undefined
    ? null
    : {
      selectedCallId,
      cwd,
      openFile,
      inspectCall,
      forkAt,
      renderMessageImages,
      fileMentions,
    }
  if (routedNode === undefined || owner === null) return null
  const routedOwner = { ...owner, node: routedNode }
  return (
    h('div',
      {
        key: key ?? routedNode.key,
        class: css.flowItem ?? '',
        'data-chat-anchor-key': routedNode.key,
        'data-chat-flow-key': routedNode.key,
        'data-chat-flow-kind': routedNode.kind,
      },
      renderSlot('conversation.chat.node', routedOwner, {
        entryKey: routedNode.kind,
        hookContext: nodeKey,
            get fallback() {
              return cachedFallbackJsonBlock(routedNode, {
                label: t('message.unknownSurface', { type: routedNode.kind }),
                payload: routedNode.data,
                truncatedLabel: total => t('json.truncated', { total }),
              })
            },
      }),
    )
  )
}
