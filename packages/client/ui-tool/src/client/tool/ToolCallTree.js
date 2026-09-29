import { createElement as h, Fragment } from '@freddie/webjsx'
import { GenericToolCard } from './toolviews/GenericToolCard.js'
import css from './ToolCallTree.css.js'

function callName(node) {
  return 'kind' in node ? node.call?.name ?? '' : node.name
}

function ToolCall({
  renderSlot, callId, toolName, block, openFile, selected, cwd, home, inspectCall, t, children,
}) {
  const owner = {
    callId,
    toolName,
    block,
    openFile,
    cwd,
    home,
    inspect: () => { inspectCall(callId) },
  }
  return (
    h('div',
      {
        class: css.callRow ?? '',
        'data-chat-anchor-key': `call:${callId}`,
        'data-chat-call-id': callId,
        'data-selected': selected || undefined,
      },
      renderSlot('tool.call.toolview', owner, {
        entryKey: toolName,
        fallback: h(GenericToolCard, {...owner, t: t}),
      }),
      children,
    )
  )
}

function ToolCallBranch({
  renderSlot, block, selectedCallId, cwd, home, openFile, inspectCall, t,
}) {
  return (
    h(ToolCall,
      {
        renderSlot: renderSlot,
        callId: block.callId,
        toolName: callName(block),
        block: block,
        openFile: openFile,
        selected: block.callId === selectedCallId,
        cwd: cwd,
        home: home,
        inspectCall: inspectCall,
        t: t,
      },
      block.subCalls.length > 0 ? (
        h('div', {class: css.subCalls ?? '', 'data-subcalls': ''},
          block.subCalls.map(child => (
            h(ToolCallBranch, {
              key: child.callId,
              renderSlot: renderSlot,
              block: child,
              selectedCallId: selectedCallId,
              cwd: cwd,
              home: home,
              openFile: openFile,
              inspectCall: inspectCall,
              t: t,
            })
          ))
        )
      ) : null
    )
  )
}

export function ToolCallTree({
  renderSlot, node, selectedCallId, cwd, openFile, inspectCall, useHostDescription, t,
}) {
  const home = useHostDescription(description => description?.home)
  const block = node.data.root
  return (
    h(ToolCallBranch, {
      renderSlot: renderSlot,
      block: block,
      selectedCallId: selectedCallId,
      cwd: cwd,
      home: home,
      openFile: openFile,
      inspectCall: inspectCall,
      t: t,
    })
  )
}
