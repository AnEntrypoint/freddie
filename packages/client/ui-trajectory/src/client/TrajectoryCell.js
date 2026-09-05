// Legacy standalone trajectory cell retained for direct consumers and specs.

import { createElement as h } from 'webjsx'
import {
  formatElapsedSeconds,
} from './trajectory-record.js'
import css from './TrajectoryCell.css.js'

export { formatElapsedSeconds }

/** Display label per kind (matches the design tags). */
const KIND_LABEL = {
  system: 'System',
  user: 'User',
  context: 'Context',
  compacted: 'Compacted',
  message: 'Message',
  tool: 'Tool',
  subtool: 'Sub',
}

const TAG_CLASS = {
  system: css.tagSystem,
  user: css.tagUser,
  context: css.tagContext,
  compacted: css.tagSystem,
  message: css.tagMessage,
  tool: css.tagTool,
  subtool: css.tagSubtool,
}

/**
 * Render one trajectory step cell.
 * @param props - index, kind, text, time, and optional Message metrics.
 * @returns the cell element.
 */
export function TrajectoryCell({
  index,
  kind,
  text,
  inputDetail: _inputDetail,
  promptDetail: _promptDetail,
  previousPromptDetail: _previousPromptDetail,
  outputDetail: _outputDetail,
  thinkingDetail: _thinkingDetail,
  sourceBlocks: _sourceBlocks,
  outputBlocks: _outputBlocks,
  schemaDetail: _schemaDetail,
  assistantMetrics: _assistantMetrics,
  result: _result,
  callId: _callId,
  isError: _isError,
  timeSeconds,
  startedAt: _startedAt,
  input,
  output,
  think,
  selected = false,
  className,
  ...rest
}) {
  const rootClass = [
    css.root,
    selected ? css.selected : undefined,
    className,
  ].filter((c) => c !== undefined).join(' ')
  const showMetrics = kind === 'message'
  return (
    h('div', {class: rootClass, 'data-kind': kind, 'data-selected': selected || undefined, ...rest},
      h('span', {class: css.index ?? ''}, '#', index),
      h('span', {class: css.tagSlot ?? ''},
        h('span', {class: [css.tag, TAG_CLASS[kind]].filter((c) => c !== undefined).join(' ')}, KIND_LABEL[kind]),
      ),
      h('span', {class: css.text ?? ''}, text),
      h('span', {class: css.trailing ?? ''},
        showMetrics ? [
          h('span', {class: css.metric ?? ''}, input ?? ''),
          h('span', {class: css.metric ?? ''}, output ?? ''),
          h('span', {class: css.metric ?? ''}, think ?? ''),
        ] : null,
        h('span', {class: css.time ?? ''}, formatElapsedSeconds(timeSeconds)),
      ),
    )
  )
}
