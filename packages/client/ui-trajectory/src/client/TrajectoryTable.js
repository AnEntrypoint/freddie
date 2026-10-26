
import { applyDiff, createElement as h } from '@freddie/webjsx'
import { Virtualizer } from '@tanstack/virtual-core'
import {
  IconChevronRightOutline14,
  JsonTree,
  MarkdownText,
  Tooltip,
  defineElement,
  resolveElementTag,
} from '@freddie/freddie-client-ui-primitives'
import { formatElapsedSeconds, trajectoryRecordId } from './trajectory-record.js'
import {
  groupTrajectoryVirtualRows, trajectoryVirtualRecordKey,
} from './trajectory-virtual-rows.js'
import { trajectoryPreviewText } from './trajectory-preview.js'
import css from './TrajectoryTable.css.js'
import { kindIcon } from './TrajectoryIcons.js'
import { AssistantTimingPanel, StartedAtValue, formatDurationMs } from './TrajectoryFormatting.js'
import {
  assistantToolCalls,
  collapseAssistantRecords,
  collapseTurnRecords,
  filterRecords,
  flattenRecords,
  indexRequestBoundaries,
  indexRequestBoundaryRuns,
  indexRequestNumbers,
  requestKey,
  sectionLabel,
  stateOf,
  statusLabel,
} from './TrajectoryRecordGroups.js'
import { RequestOptions, RequestUsagePanel, TokenRows, UsageRows } from './TrajectoryUsage.js'
import { SystemPromptDiff } from './TrajectoryPromptDiff.js'
import { RecordSchema, parseJsonContainer } from './TrajectorySchema.js'

const BOTTOM_FOLLOW_THRESHOLD_PX = 2
const OLDER_LOAD_THRESHOLD_PX = 48
const FOCUS_INSPECTOR_FRAMES = 30
const HISTORY_LOAD_ROW_HEIGHT_PX = 30
const VIRTUALIZATION_THRESHOLD = 100
const VIRTUAL_OVERSCAN_ROWS = 12
const VIRTUAL_INITIAL_VIEWPORT_HEIGHT_PX = 600

const KIND_LABEL = {
  system: 'SYSTEM',
  user: 'USER',
  context: 'CONTEXT',
  compacted: 'COMPACTED',
  message: 'ASSISTANT',
  tool: 'TOOL',
  subtool: 'SUBTOOL',
}

function stableVirtualRowStructure(
  rows,
  cache,
) {
  if (cache.rows === rows) return cache.structure
  const structure = cache.structure.length === rows.length
    && rows.every((row, index) => {
      const previous = cache.structure[index]
      return previous?.key === row.key && previous.height === row.height
    })
    ? cache.structure
    : rows.map(row => ({ key: row.key, height: row.height }))
  cache.rows = rows
  cache.structure = structure
  return structure
}

const DETAILS_MIN_WIDTH = 320
const DETAILS_MAX_WIDTH = 720
const TABLE_MIN_WIDTH = 280
const DETAILS_RESIZE_STEP = 16
const TOOL_REQUEST_SHARE = 0.58
const TOOL_REQUEST_MIN_WIDTH = 180
const TOOL_REQUEST_MAX_WIDTH = 480
const DEFAULT_TOOL_REQUEST_SHARE = 0.36
const DEFAULT_TOOL_REQUEST_OFFSET = 56
const SYSTEM_PROMPT_TABS = [
  { id: 'system-prompt', label: 'System Prompt' },
  { id: 'tools', label: 'Tools' },
]
const SYSTEM_UPDATE_TABS = [
  { id: 'diff', label: 'Diff' },
  ...SYSTEM_PROMPT_TABS,
]
const REQUEST_TABS = [
  { id: 'overview', label: 'Summary' },
  { id: 'options', label: 'Options' },
  { id: 'usage', label: 'Usage' },
  { id: 'timing', label: 'Timing' },
]

function clampDetailsWidth(width, splitWidth) {
  const maxWidth = Math.max(
    DETAILS_MIN_WIDTH,
    Math.min(DETAILS_MAX_WIDTH, splitWidth - TABLE_MIN_WIDTH),
  )
  return Math.round(Math.min(Math.max(width, DETAILS_MIN_WIDTH), maxWidth))
}

function defaultToolRequestWidth(splitWidth) {
  return Math.min(
    Math.max(
      splitWidth * DEFAULT_TOOL_REQUEST_SHARE - DEFAULT_TOOL_REQUEST_OFFSET,
      TOOL_REQUEST_MIN_WIDTH,
    ),
    TOOL_REQUEST_MAX_WIDTH,
  )
}

function messageSourceLabel(source) {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return 'Unknown'
  }
  const properties = source
  const kind = properties.kind
  if (kind === 'user') return 'User'
  if (kind === 'plugin') {
    const plugin = properties.plugin
    return typeof plugin === 'string' && plugin !== ''
      ? `Plugin · ${plugin}`
      : 'Plugin'
  }
  if (kind === 'goal') {
    const round = properties.round
    return typeof round === 'number' && round > 0
      ? `Goal · Round ${round}`
      : 'Goal'
  }
  if (typeof kind !== 'string' || kind === '') return 'Unknown'
  return `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)}`
}

function MessageSource({ record }) {
  const source = record.cell.messageSource
  if (source === undefined) return h('p', {class: css.noPayload ?? ''}, 'Source not recorded')
  const data = typeof source === 'object' && source !== null
    ? source
    : { value: source }
  return (
    h(JsonTree, {
      data: data,
      label: 'Message source JSON',
      className: css.jsonPayload,
    })
  )
}

function isMarkdownRecord(record) {
  return record.cell.kind === 'user'
    || record.cell.kind === 'context'
    || record.cell.kind === 'message'
}

function parentRecords(
  records,
  record,
) {
  if (record.cell.kind !== 'tool' && record.cell.kind !== 'subtool') return {}
  const at = records.findIndex(candidate => candidate.cell.index === record.cell.index)
  if (at === -1) return {}
  let tool
  if (record.cell.kind === 'subtool') {
    for (let i = at - 1; i >= 0; i--) {
      const candidate = records[i]
      if (
        candidate === undefined
        || candidate.turn !== record.turn
        || candidate.group !== record.group
      ) break
      if (candidate.cell.kind === 'tool') {
        tool = candidate
        break
      }
    }
  }
  const parentCallId = tool?.cell.callId ?? record.cell.callId
  let message
  if (parentCallId !== undefined) {
    message = records.find(candidate =>
      candidate.turn === record.turn
      && candidate.cell.kind === 'message'
      && candidate.cell.sourceBlocks?.some(block => block.callId === parentCallId) === true,
    )
  }
  return { ...(message === undefined ? {} : { message }), ...(tool === undefined ? {} : { tool }) }
}

function markdownSource(record) {
  if (record.cell.kind === 'user' || record.cell.kind === 'context') {
    return record.cell.inputDetail
  }
  if (record.cell.kind === 'message' || record.cell.kind === 'compacted') {
    return record.cell.outputDetail
  }
  return undefined
}

function detailTabs(record) {
  if (record.cell.kind === 'system') {
    return record.cell.previousPromptDetail === undefined
      ? SYSTEM_PROMPT_TABS
      : SYSTEM_UPDATE_TABS
  }
  if (record.cell.kind === 'compacted') {
    return [
      { id: 'overview', label: 'Summary' },
      { id: 'raw', label: 'Raw Output' },
    ]
  }
  if (isMarkdownRecord(record)) {
    return [
      { id: 'overview', label: 'Summary' },
      { id: 'rendered', label: 'Preview' },
      { id: 'raw', label: 'Raw' },
      ...(record.cell.messageSource === undefined
        ? []
        : [{ id: 'source', label: 'Source' }]),
    ]
  }
  return [
    { id: 'overview', label: 'Summary' },
    ...(record.cell.inputDetail ? [{ id: 'input', label: 'Payload' }] : []),
    ...(record.cell.outputDetail ? [{ id: 'output', label: 'Result' }] : []),
    { id: 'schema', label: 'Schema' },
    { id: 'timing', label: 'Timing' },
  ]
}

function recordDisplayText(cell) {
  if (isToolCallOnly(cell)) return ''
  if (cell.previewMarkdown !== undefined) {
    const preview = trajectoryPreviewText(cell.previewMarkdown)
    if (cell.text === '') return preview
    return preview === '' ? cell.text : `${cell.text} · ${preview}`
  }
  if (cell.text !== '') return cell.text
  const markdown = cell.kind === 'user' || cell.kind === 'context'
    ? cell.inputDetail
    : cell.kind === 'message'
      ? cell.outputDetail ?? cell.thinkingDetail
      : undefined
  return markdown === undefined ? '' : trajectoryPreviewText(markdown)
}

function recordResultText(cell) {
  return cell.resultPreviewMarkdown === undefined
    ? cell.result
    : trajectoryPreviewText(cell.resultPreviewMarkdown)
}

function toolCallTextParts(
  kind,
  text,
) {
  if (kind !== 'tool' && kind !== 'subtool') return undefined
  const separator = text.indexOf(' · ')
  if (separator === -1) return { name: text }
  return {
    name: text.slice(0, separator),
    args: text.slice(separator + 3),
  }
}

function isToolCallOnly(cell) {
  return cell.kind === 'message'
    && !cell.outputDetail
    && !cell.thinkingDetail
    && cell.text === 'Tool call only'
}

function recordPresentation(cell) {
  const displayText = recordDisplayText(cell)
  const resultText = recordResultText(cell)
  const toolCallOnly = isToolCallOnly(cell)
  const toolCallText = toolCallTextParts(cell.kind, displayText)
  const listDisplayText = toolCallOnly
    ? '(tool call only)'
    : toolCallText === undefined
      ? displayText
      : [toolCallText.name, toolCallText.args].filter(Boolean).join(' ')
  return {
    displayText,
    listDisplayText,
    resultText,
    toolCallOnly,
    toolCallText,
  }
}

function RecordListText({
  displayText,
  toolCallOnly,
  toolCallText,
}) {
  if (toolCallOnly) {
    return h('span', {class: css.toolCallOnly ?? ''}, '(tool call only)')
  }
  if (toolCallText === undefined) return displayText || '—'
  return [
    h('span', {class: css.toolCallNameTypeface ?? ''},
      toolCallText.name || '—',
    ),
    toolCallText.args !== undefined
      ? (
        h('span', {class: css.toolCallPayload ?? ''},
          toolCallText.args,
        )
      )
      : null,
  ]
}

function MarkdownFragment({
  text,
  rendered,
  preview,
}) {
  if (rendered) {
    return (
      h('div', {class: (preview ? css.markdownPreview : css.markdownPayload) ?? ''},
        h(MarkdownText, {text: text}),
      )
    )
  }
  return (
    h('pre', {class: `${css.payload ?? ''} ${preview ? css.payloadPreview ?? '' : ''}`},
      text,
    )
  )
}

function SourceBlocks({
  blocks,
  onOpenCall,
}) {
  return (
    h('div', {class: css.sourceBlocks ?? ''},
      blocks.map((block, index) => (
        h('section', {class: css.sourceBlock ?? '', key: index},
          block.callId !== undefined
            ? (
              h('button', {
                type: 'button',
                class: css.sourceBlockJumpTarget ?? '',
                'aria-label': `Open Block #${index + 1} tool call summary`,
                title: 'Open tool call summary',
                onclick: () => {
                  if (block.callId !== undefined) onOpenCall(block.callId)
                },
              },
                h('span', {class: css.sourceBlockLabel ?? ''},
                  `Block #${index + 1} ${block.type}`,
                ),
                h(IconChevronRightOutline14, {className: css.sourceBlockJumpIcon, size: 12}),
              )
            )
            : (
              h('div', {class: css.sourceBlockHeader ?? ''},
                h('span', {class: css.sourceBlockLabel ?? ''},
                  `Block #${index + 1} ${block.type}`,
                ),
              )
            ),
          block.imageSrc !== undefined
            ? h(PanelImage, {block: block})
            : h('pre', {class: css.sourceBlockContent ?? ''}, block.content),
        )
      )),
    )
  )
}

function PanelImage({
  block,
  preview = false,
}) {
  if (block.imageSrc === undefined) return null
  return (
    h('a', {
      class: (preview ? `${css.panelImageLink ?? ''} ${css.panelImageLinkPreview ?? ''}` : css.panelImageLink) ?? '',
      href: block.imageSrc,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: 'Open image',
    },
      h('img', {
        class: css.panelImage ?? '',
        src: block.imageSrc,
        alt: block.imageAlt ?? '',
      }),
    )
  )
}

function MessageImages({
  blocks,
  preview,
}) {
  const images = blocks?.filter(block => block.imageSrc !== undefined) ?? []
  if (images.length === 0) return null
  return (
    h('div', {class: (preview ? `${css.messageImages ?? ''} ${css.messageImagesPreview ?? ''}` : css.messageImages) ?? ''},
      images.map((block, index) => h(PanelImage, {block: block, preview: preview, key: index})),
    )
  )
}

function AssistantToolCalls({
  blocks,
  preview,
  onOpenCall,
}) {
  const calls = blocks?.filter(block => block.type === 'tool-call') ?? []
  if (calls.length === 0) return null
  return (
    h('ul', {class: (preview
      ? `${css.assistantToolCalls ?? ''} ${css.assistantToolCallsPreview ?? ''}`
      : css.assistantToolCalls) ?? ''},
      calls.map((call, index) => (
        h('li', {key: call.callId ?? index},
          h('button', {
            type: 'button',
            class: css.assistantToolCallButton ?? '',
            title: 'Open tool call summary',
            onclick: () => {
              if (call.callId !== undefined) onOpenCall(call.callId)
            },
          },
            h('svg', {
              class: css.assistantToolCallIcon ?? '',
              width: '12',
              height: '12',
              viewBox: '0 0 24 24',
              fill: 'none',
              'aria-hidden': 'true',
            },
              h('path', {
                d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z',
                stroke: 'currentColor',
                'stroke-width': '1.8',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              }),
            ),
            h('span', {class: css.assistantToolCallText ?? ''},
              h('span', {class: css.assistantToolCallName ?? ''},
                call.toolName ?? 'tool-call',
              ),
              call.content !== '' && (
                h('span', {class: css.assistantToolCallArgs ?? ''}, call.content)
              ),
            ),
          ),
        )
      )),
    )
  )
}

function ToolGlyph() {
  return (
    h('svg', {
      class: css.toolCatalogIcon ?? '',
      width: '12',
      height: '12',
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
    },
      h('path', {
        d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    )
  )
}

function ToolCatalog({ tools }) {
  if (tools.length === 0) return h('p', {class: css.noPayload ?? ''}, 'No tools in this request')
  return (
    h('div', {class: css.toolCatalog ?? ''},
      tools.map((tool, index) => (
        h('details', {class: css.toolCatalogItem ?? '', key: `${tool.name}:${index}`},
          h('summary', {class: css.toolCatalogSummary ?? ''},
            h(IconChevronRightOutline14, {className: css.toolCatalogChevron, size: 12}),
            h(ToolGlyph, null),
            h('span', {class: css.toolCatalogName ?? ''}, tool.name),
            h('span', {class: css.toolCatalogDescription ?? ''}, tool.description),
          ),
          h('div', {class: css.toolCatalogDefinition ?? ''},
            tool.description !== '' && (
              h('p', {class: css.toolCatalogFullDescription ?? ''}, tool.description)
            ),
            h(JsonTree, {
              data: tool.parameters,
              label: `${tool.name} parameters JSON`,
              className: css.toolCatalogTree,
            }),
          ),
        )
      )),
    )
  )
}

function ToolOutputBlocks({
  blocks,
  error,
  preview,
}) {
  return (
    h('div', {class: [
      css.resultBlocks,
      preview ? css.resultBlocksPreview : undefined,
      error ? css.errorPayload : undefined,
    ].filter((value) => value !== undefined).join(' ')},
      blocks.map((block, index) => (
        block.imageSrc !== undefined
          ? h(PanelImage, {block: block, preview: preview, key: index})
          : block.content !== ''
            ? h('pre', {class: css.resultBlockText ?? '', key: index}, block.content)
            : null
      )),
    )
  )
}

function MarkdownRecordContent({
  record,
  rendered,
  preview = false,
  thinkingExpanded,
  onThinkingExpandedChange,
  onOpenCall,
}) {
  if (!rendered && record.cell.sourceBlocks && record.cell.sourceBlocks.length > 0) {
    return h(SourceBlocks, {blocks: record.cell.sourceBlocks, onOpenCall: onOpenCall})
  }
  if (record.cell.thinkingDetail) {
    if (!rendered) {
      const source = [
        record.cell.thinkingDetail,
        record.cell.outputDetail,
      ].filter((value) => value !== undefined && value !== '').join('\n\n')
      return h(MarkdownFragment, {text: source, rendered: false, preview: preview})
    }
    return (
      h('div', {class: `${css.assistantContent ?? ''} ${css.assistantContentRendered ?? ''}`},
        h('div', {class:
          (preview && !record.cell.outputDetail
            ? `${css.thinkingQuote ?? ''} ${css.thinkingQuoteOnlyPreview ?? ''}`
            : css.thinkingQuote) ?? ''
        },
          h('button', {
            type: 'button',
            class: css.thinkingToggle ?? '',
            'aria-expanded': thinkingExpanded,
            onclick: () => { onThinkingExpandedChange(!thinkingExpanded) },
          },
            'Thinking',
            h(IconChevronRightOutline14, {className: css.thinkingChevron, size: 12}),
          ),
          thinkingExpanded && (
            h(MarkdownFragment, {
              text: record.cell.thinkingDetail,
              rendered: rendered,
              preview: preview,
            })
          ),
        ),
        record.cell.outputDetail && (
          h('div', {class: css.assistantOutput ?? ''},
            h(MarkdownFragment, {
              text: record.cell.outputDetail,
              rendered: rendered,
              preview: preview,
            }),
          )
        ),
        h(AssistantToolCalls, {
          blocks: record.cell.sourceBlocks,
          preview: preview,
          onOpenCall: onOpenCall,
        }),
        h(MessageImages, {
          blocks: record.cell.sourceBlocks,
          preview: preview,
        }),
      )
    )
  }
  const source = markdownSource(record)
  const hasImages = record.cell.sourceBlocks?.some(block => block.imageSrc !== undefined) === true
  const hasToolCalls = record.cell.kind === 'message'
    && record.cell.sourceBlocks?.some(block => block.type === 'tool-call') === true
  if (!source && !hasImages && !hasToolCalls) {
    const emptyLabel = isToolCallOnly(record.cell)
      ? 'Tool call only'
      : record.cell.text || 'No content'
    return h('p', {class: css.noPayload ?? ''}, emptyLabel)
  }
  if (!rendered || (!hasImages && !hasToolCalls)) {
    return h(MarkdownFragment, {text: source ?? '', rendered: rendered, preview: preview})
  }
  return (
    h('div', null,
      source && h(MarkdownFragment, {text: source, rendered: true, preview: preview}),
      record.cell.kind === 'message' && (
        h(AssistantToolCalls, {
          blocks: record.cell.sourceBlocks,
          preview: preview,
          onOpenCall: onOpenCall,
        })
      ),
      h(MessageImages, {blocks: record.cell.sourceBlocks, preview: preview}),
    )
  )
}

function RecordTiming({
  record,
  showUnix,
  onToggleUnix,
}) {
  return record.cell.kind === 'message' && record.cell.assistantMetrics !== undefined
    ? h(AssistantTimingPanel, {metrics: record.cell.assistantMetrics, showUnix: showUnix, onToggleUnix: onToggleUnix})
    : (
      h('dl', {class: css.overview ?? ''},
        h('div', null, h('dt', null, 'Started'), h(StartedAtValue, {timestamp: record.cell.startedAt ?? null, showUnix: showUnix, onToggle: onToggleUnix})),
        h('div', null, h('dt', null, 'Duration'), h('dd', null, formatElapsedSeconds(record.cell.timeSeconds))),
        h('div', null, h('dt', null, 'Timing source'), h('dd', null, record.cell.timeSeconds === null ? 'Not available' : 'Session timestamps')),
      )
    )
}

function RequestTiming({
  assistant,
  anchor,
  request,
  showUnix,
  onToggleUnix,
}) {
  if (assistant !== undefined) return h(RecordTiming, {record: assistant, showUnix: showUnix, onToggleUnix: onToggleUnix})
  if (request?.startedAt !== undefined) {
    const duration = request.completedAt === null || request.completedAt === undefined
      ? null
      : Math.max(0, (request.completedAt - request.startedAt) / 1000)
    return (
      h('dl', {class: css.overview ?? ''},
        h('div', null, h('dt', null, 'Started'), h(StartedAtValue, {timestamp: request.startedAt, showUnix: showUnix, onToggle: onToggleUnix})),
        h('div', null, h('dt', null, 'Duration'), h('dd', null, formatElapsedSeconds(duration))),
        h('div', null,
          h('dt', null, 'Timing source'),
          h('dd', null, duration === null ? 'Session timestamps (running)' : 'Session timestamps'),
        ),
      )
    )
  }
  return (
    h('dl', {class: css.overview ?? ''},
      h('div', null,
        h('dt', null, 'Started'),
        h(StartedAtValue, {timestamp: anchor?.cell.startedAt ?? null, showUnix: showUnix, onToggle: onToggleUnix}),
      ),
      h('div', null, h('dt', null, 'Duration'), h('dd', null, formatElapsedSeconds(null))),
    )
  )
}

function RecordPayload({
  record,
  direction,
  preview = false,
}) {
  const value = direction === 'input' ? record.cell.inputDetail : record.cell.outputDetail
  const missing = direction === 'input'
    ? 'No payload captured'
    : 'No result captured'
  if (!value) return h('p', {class: css.noPayload ?? ''}, missing)
  const error = direction === 'output' && record.cell.isError === true
  const payloadClass = preview ? css.jsonPreview : css.jsonPayload
  const payloadClassName = error ? `${payloadClass ?? ''} ${css.errorPayload ?? ''}` : payloadClass

  const json = parseJsonContainer(value)
  const singleTextResult = direction === 'output'
    && record.cell.outputBlocks?.length === 1
    && record.cell.outputBlocks[0]?.type === 'text'
  if (singleTextResult && json !== undefined) {
    return (
      h(JsonTree, {
        data: json,
        label: 'Result JSON',
        className: payloadClassName,
      })
    )
  }

  if (
    direction === 'output'
    && record.cell.outputBlocks?.some(block =>
      block.imageSrc !== undefined || block.content !== '') === true
  ) {
    return (
      h(ToolOutputBlocks, {
        blocks: record.cell.outputBlocks,
        error: error,
        preview: preview,
      })
    )
  }

  const markdown = (
    direction === 'input'
    && (record.cell.kind === 'user' || record.cell.kind === 'context')
  ) || (
    direction === 'output' && record.cell.kind === 'message'
  )
  if (markdown) {
    return (
      h('div', {class: [
        preview ? css.markdownPreview : css.markdownPayload,
        error ? css.errorPayload : undefined,
      ].filter((className) => className !== undefined).join(' ')},
        h(MarkdownText, {text: value}),
      )
    )
  }
  if (json !== undefined) {
    return (
      h(JsonTree, {
        data: json,
        label: `${direction === 'input' ? 'Payload' : 'Result'} JSON`,
        className: payloadClassName,
      })
    )
  }
  return (
    h('pre', {class: [
      css.payload,
      preview ? css.payloadPreview : undefined,
      error ? css.errorPayload : undefined,
      value === 'No output' ? css.noOutputText : undefined,
    ].filter((value) => value !== undefined).join(' ')},
      value,
    )
  )
}

function OverviewSection({
  label,
  onOpen,
  children,
}) {
  return (
    h('section', {class: css.overviewSection ?? ''},
      h('h3', {class: css.overviewHeading ?? ''},
        h('button', {
          type: 'button',
          class: css.overviewTitle ?? '',
          onclick: onOpen,
        },
          h('span', null, label),
          h(IconChevronRightOutline14, {className: css.overviewTitleIcon, size: 12}),
        ),
      ),
      h('div', {
        class: `${css.overviewPreview ?? ''} ${css.summaryScrollRegion ?? ''}`,
        'data-summary-scroll-region': '',
      },
        children,
      ),
    )
  )
}

export class FreddieTrajectoryTable extends HTMLElement {
  #props = {
    turns: [], collapsedTurns: new Set(), onToggleTurn: () => {},
    collapsedAssistants: new Set(), onToggleAssistant: () => {},
  }

  #selectedRecordId = null
  #selectedRequest = null
  #activeTab = 'overview'
  #thinkingExpanded = false
  #detailsWidth = null
  #toolRequestOffset = null
  #detailsResizeDrag = null
  #appliedRecordSelection = null
  #appliedRecordFocus = null
  #tabHistory = new Set(['overview'])
  #followsTableTail = false
  #tableScrollInitialized = false
  #tableScrollReady = false
  #pendingScrollRecordId = null
  #pendingInspectFocus = false
  #loadingOlder = false
  #olderLoading = false
  #olderLoadAnchor = null
  #showUnix = false

  #tablePaneEl = null
  #virtual = { virtualizer: null, cleanup: null, structureCache: { rows: [], structure: [] } }
  #virtualRenderQueued = false
  #resizeObserver = null

  setProps(props) {
    this.#props = props
    this.#syncInspectRequest()
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#destroyVirtualizer()
    if (this.#resizeObserver !== null) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }
  }

  #destroyVirtualizer() {
    this.#virtual.cleanup?.()
    this.#virtual.cleanup = null
    this.#virtual.virtualizer = null
    this.#virtualRenderQueued = false
  }

  #scheduleVirtualRender() {
    if (this.#virtualRenderQueued) return
    this.#virtualRenderQueued = true
    queueMicrotask(() => {
      this.#virtualRenderQueued = false
      if (this.isConnected) this.#render()
    })
  }

  #allRecords() {
    return flattenRecords(this.#props.turns)
  }

  #streamingCellsByIndex() {
    return new Map((this.#props.streamingCells ?? []).map(cell => [cell.index, cell]))
  }

  #currentRecord(record, byIndex) {
    const cell = byIndex.get(record.cell.index)
    return cell === undefined ? record : { ...record, cell }
  }

  #records(allRecords) {
    const { searchMatchIndexes = null, collapsedTurns, collapsedAssistants } = this.#props
    if (searchMatchIndexes !== null) return filterRecords(allRecords, searchMatchIndexes)
    const turnRecords = collapsedTurns.size === 0
      ? allRecords
      : collapseTurnRecords(allRecords, collapsedTurns)
    return collapsedAssistants.size === 0
      ? turnRecords
      : collapseAssistantRecords(turnRecords, collapsedAssistants)
  }

  #activateTab(tab) {
    this.#tabHistory.delete(tab)
    this.#tabHistory.add(tab)
    this.#activeTab = tab
    this.#render()
  }

  #clearInspectorSelection() {
    this.#selectedRecordId = null
    this.#selectedRequest = null
    this.#render()
  }

  #clearAllSelections() {
    this.#selectedRecordId = null
    this.#selectedRequest = null
    this.#props.onClearSelection?.()
    this.#render()
  }

  #selectRecord(index) {
    const allRecords = this.#allRecords()
    const record = allRecords.find(candidate => candidate.cell.index === index)
    this.#props.onRecordSelect?.(index)
    this.#selectedRequest = null
    this.#selectedRecordId = record === undefined ? null : trajectoryRecordId(record.cell)
    if (record !== undefined) {
      const tabs = detailTabs(record)
      const available = new Set(tabs.map(tab => tab.id))
      const recent = [...this.#tabHistory].reverse().find(tab => available.has(tab))
      this.#activeTab = recent ?? tabs[0]?.id ?? 'overview'
    }
    this.#render()
  }

  #selectRequest(request, tab = 'overview') {
    this.#selectedRecordId = null
    this.#selectedRequest = request
    this.#activateTab(tab)
  }

  #openRecordSummary(target) {
    const { collapsedTurns, onToggleTurn, collapsedAssistants, onToggleAssistant } = this.#props
    const allRecords = this.#allRecords()
    const targetAt = allRecords.findIndex(record => record.cell.index === target.cell.index)
    if (target.turn !== null && collapsedTurns.has(target.turn)) onToggleTurn(target.turn)
    if (target.cell.kind === 'tool' || target.cell.kind === 'subtool') {
      for (let i = targetAt - 1; i >= 0; i--) {
        const candidate = allRecords[i]
        if (candidate === undefined || candidate.turn !== target.turn) break
        if (candidate.cell.kind !== 'message') continue
        const assistantId = trajectoryRecordId(candidate.cell)
        if (collapsedAssistants.has(assistantId)) onToggleAssistant(assistantId)
        break
      }
    }
    this.#selectedRequest = null
    this.#selectedRecordId = trajectoryRecordId(target.cell)
    this.#activateTab('overview')
  }

  #openCallSummary(callId) {
    const target = this.#allRecords().find(record => record.cell.callId === callId)
    if (target !== undefined) this.#openRecordSummary(target)
  }

  #syncInspectRequest() {
    const { inspectCallId = null, onInspectApplied, recordSelection = null, recordFocus = null } = this.#props
    if (inspectCallId !== null) {
      const target = flattenRecords(this.#props.turns).find(record => record.cell.callId === inspectCallId)
      if (target !== undefined) {
        this.#openRecordSummary(target)
        this.#pendingScrollRecordId = trajectoryRecordId(target.cell)
        this.#pendingInspectFocus = true
        onInspectApplied?.()
      }
    }
    if (recordSelection !== null && this.#appliedRecordSelection !== recordSelection) {
      this.#appliedRecordSelection = recordSelection
      this.#selectRecord(recordSelection.index)
      const record = this.#allRecords().find(candidate => candidate.cell.index === recordSelection.index)
      this.#pendingScrollRecordId = record === undefined ? null : trajectoryRecordId(record.cell)
    }
    if (recordFocus !== null && this.#appliedRecordFocus !== recordFocus) {
      this.#appliedRecordFocus = recordFocus
      const record = this.#allRecords().find(candidate => candidate.cell.index === recordFocus.index)
      this.#pendingScrollRecordId = record === undefined ? null : trajectoryRecordId(record.cell)
    }
  }

  #requestOlder(pane, requireTop) {
    const { hasOlderRecords = false, onLoadOlder, olderHistoryLoading = false, historyStartSeq } = this.#props
    if (
      !hasOlderRecords
      || onLoadOlder === undefined
      || this.#loadingOlder
      || olderHistoryLoading
      || (requireTop && pane.scrollTop > OLDER_LOAD_THRESHOLD_PX)
    ) return
    this.#loadingOlder = true
    this.#olderLoading = true
    this.#olderLoadAnchor = {
      historyStartSeq,
      scrollHeight: pane.scrollHeight,
      scrollTop: pane.scrollTop,
    }
    this.#render()
    void onLoadOlder().then((advanced) => {
      if (!advanced) this.#olderLoadAnchor = null
    }).finally(() => {
      this.#loadingOlder = false
      this.#olderLoading = false
      this.#render()
    })
  }

  #syncTableTailFollow(pane) {
    this.#followsTableTail =
      pane.scrollHeight - pane.clientHeight - pane.scrollTop <= BOTTOM_FOLLOW_THRESHOLD_PX
  }

  #ensureVirtualizer(
    virtualizationEnabled,
    count,
    estimateSize,
    getItemKey,
    scrollMargin,
  ) {
    if (!this.isConnected) return null
    const pane = this.#tablePaneEl
    if (pane === null) return null
    const options = {
      count: virtualizationEnabled ? count : 0,
      enabled: virtualizationEnabled,
      estimateSize,
      getItemKey,
      getScrollElement: () => this.#tablePaneEl,
      scrollToFn: (offset, scrollOptions, instance) => {
        const target = instance.scrollElement
        if (target === null) return
        target.scrollTo(
          scrollOptions.behavior === undefined
            ? { top: offset }
            : { top: offset, behavior: scrollOptions.behavior },
        )
      },
      observeElementRect: (instance, cb) => {
        const element = instance.scrollElement
        if (element === null) return undefined
        const notify = () => cb({ width: element.clientWidth, height: element.clientHeight })
        notify()
        const observer = new ResizeObserver(notify)
        observer.observe(element)
        return () => { observer.disconnect() }
      },
      observeElementOffset: (instance, cb) => {
        const element = instance.scrollElement
        if (element === null) return undefined
        const notify = () => {
          this.#syncTableTailFollow(element)
          cb(element.scrollTop, false)
        }
        notify()
        element.addEventListener('scroll', notify, { passive: true })
        return () => { element.removeEventListener('scroll', notify) }
      },
      initialRect: { width: 0, height: VIRTUAL_INITIAL_VIEWPORT_HEIGHT_PX },
      anchorTo: 'end',
      overscan: VIRTUAL_OVERSCAN_ROWS,
      scrollMargin,
      scrollEndThreshold: BOTTOM_FOLLOW_THRESHOLD_PX,
    }
    if (this.#virtual.virtualizer === null) {
      const virtualizer = new Virtualizer(options)
      const cleanup = virtualizer._didMount()
      this.#virtual.virtualizer = virtualizer
      this.#virtual.cleanup = cleanup
      virtualizer.setOptions({
        ...options,
        onChange: () => { this.#scheduleVirtualRender() },
      })
      virtualizer._willUpdate()
      virtualizer.measure()
    } else {
      this.#virtual.virtualizer.setOptions({
        ...options,
        onChange: () => { this.#scheduleVirtualRender() },
      })
      this.#virtual.virtualizer._willUpdate()
    }
    return this.#virtual.virtualizer
  }

  #render() {
    const {
      requestNumbers: sessionRequestNumbers,
      timelineFocusIndexes = null,
      onSelectedIndexChange,
      historyLoading = false,
      olderHistoryLoading = false,
      hasOlderRecords = false,
      onLoadOlder,
      collapsedTurns,
      onToggleTurn,
      onToggleAssistant,
    } = this.#props

    const allRecords = this.#allRecords()
    const streamingCellsByIndex = this.#streamingCellsByIndex()
    const currentRecord = (record) => this.#currentRecord(record, streamingCellsByIndex)
    const selectedTemplate = this.#selectedRecordId === null
      ? undefined
      : allRecords.find(record => trajectoryRecordId(record.cell) === this.#selectedRecordId)
    const selected = selectedTemplate === undefined ? undefined : currentRecord(selectedTemplate)
    const selectedIndex = selected?.cell.index ?? null
    onSelectedIndexChange?.(selectedIndex)

    const requestBoundaries = indexRequestBoundaries(allRecords)
    const requestNumbers = indexRequestNumbers(allRecords, sessionRequestNumbers, requestBoundaries)
    const records = this.#records(allRecords)
    const projectedVirtualRows = groupTrajectoryVirtualRows(records)
    const virtualRowStructure = stableVirtualRowStructure(projectedVirtualRows, this.#virtual.structureCache)
    const virtualizationEnabled = hasOlderRecords || records.length > VIRTUALIZATION_THRESHOLD
    const virtualScrollMargin = hasOlderRecords ? HISTORY_LOAD_ROW_HEIGHT_PX : 0
    const estimateVirtualRowSize = (index) => virtualRowStructure[index]?.height ?? 30
    const getVirtualRowKey = (index) => virtualRowStructure[index]?.key ?? index

    let rowVirtualizer = null
    if (virtualizationEnabled) {
      rowVirtualizer = this.#ensureVirtualizer(
        true, virtualRowStructure.length, estimateVirtualRowSize, getVirtualRowKey, virtualScrollMargin,
      )
    } else if (this.#virtual.virtualizer !== null) {
      this.#destroyVirtualizer()
    }

    const virtualIndexByRecordId = new Map()
    for (const [virtualIndex, row] of projectedVirtualRows.entries()) {
      for (const entry of row.entries) {
        if (entry.record.collapsedSummary === undefined) {
          virtualIndexByRecordId.set(trajectoryRecordId(entry.record.cell), virtualIndex)
        }
      }
    }

    const virtualItems = rowVirtualizer !== null ? rowVirtualizer.getVirtualItems() : []
    const virtualTop = Math.max(0, (virtualItems[0]?.start ?? 0) - virtualScrollMargin)
    const virtualBottom = virtualItems.length === 0 || rowVirtualizer === null
      ? 0
      : Math.max(
        0,
        rowVirtualizer.getTotalSize()
          + virtualScrollMargin
          - (virtualItems.at(-1)?.end ?? 0),
      )
    const renderedRecords = virtualizationEnabled
      ? virtualItems.flatMap((item) => {
        const row = projectedVirtualRows[item.index]
        if (row === undefined) return []
        return row.entries.map((entry, entryIndex) => ({
          record: currentRecord(entry.record),
          position: entry.logicalIndex,
          terminalRequestBoundary:
            entry.record.cell.requestOnly === true
            && row.entries.at(-1)?.record.cell.requestOnly === true
            && entryIndex === row.entries.length - 1,
        }))
      })
      : records.map((record, position) => ({
        record: currentRecord(record),
        position,
        terminalRequestBoundary:
          record.cell.requestOnly === true && position === records.length - 1,
      }))
    const requestBoundaryRuns = indexRequestBoundaryRuns(records)
    const selectedPrompt = selected?.cell.kind === 'system' ? selected.cell.promptDetail : undefined
    const selectedPreviousPrompt = selected?.cell.kind === 'system' ? selected.cell.previousPromptDetail : undefined
    const promptSelected = selectedPrompt !== undefined
    const selectedState = selected === undefined ? undefined : stateOf(selected)
    const selectedRequest = this.#selectedRequest
    const selectedRequestRecordTemplates = selectedRequest === null
      ? []
      : allRecords.filter(record =>
        record.turn === selectedRequest.turn && record.group === selectedRequest.group)
    const selectedRequestRecords = selectedRequestRecordTemplates.map(currentRecord)
    const selectedRequestAssistant = selectedRequestRecords.find(record => record.cell.kind === 'message')
    const selectedRequestAnchor = selectedRequestAssistant ?? selectedRequestRecords[0]
    const selectedRequestNumber = selectedRequest === null
      ? undefined
      : requestNumbers.get(requestKey(selectedRequest.turn, selectedRequest.group))
    const selectedRequestInfo = selectedRequest === null
      ? undefined
      : sessionRequestNumbers?.find(request => selectedRequest.seq === undefined
        ? request.turn === selectedRequest.turn && request.group === selectedRequest.group
        : request.seq === selectedRequest.seq)
    const selectedRequestState = selectedRequest === null
      ? undefined
      : selectedRequestInfo?.status
        ?? (selectedRequestAssistant?.cell.assistantMetrics?.completedTime === null
          ? 'running'
          : selectedRequestAssistant === undefined
            && selectedRequestRecords.some(record => stateOf(record) === 'running')
            ? 'running'
            : 'complete')
    const selectedRequestToolCalls = selectedRequestRecords.filter(record => record.cell.kind === 'tool').length
    const selectedRequestSubtoolCalls = selectedRequestRecords.filter(record => record.cell.kind === 'subtool').length
    const selectedRequestResultTemplate = selectedRequestInfo?.resultSeq === undefined
      ? selectedRequestAssistant
      : allRecords.find(record => record.cell.sourceSeq === selectedRequestInfo.resultSeq)
    const selectedRequestResult = selectedRequestResultTemplate === undefined
      ? undefined
      : currentRecord(selectedRequestResultTemplate)
    const selectedRequestUsage = selectedRequestInfo?.usage ?? (
      selectedRequestAssistant === undefined
        ? undefined
        : {
          ...(selectedRequestAssistant.cell.input === undefined ? {} : { input: selectedRequestAssistant.cell.input }),
          ...(selectedRequestAssistant.cell.cacheRead === undefined ? {} : { cacheRead: selectedRequestAssistant.cell.cacheRead }),
          ...(selectedRequestAssistant.cell.cacheWrite === undefined ? {} : { cacheWrite: selectedRequestAssistant.cell.cacheWrite }),
          ...(selectedRequestAssistant.cell.output === undefined ? {} : { output: selectedRequestAssistant.cell.output }),
          ...(selectedRequestAssistant.cell.think === undefined ? {} : { reasoning: selectedRequestAssistant.cell.think }),
        }
    )
    const selectedRequestCumulativeUsage = selectedRequestInfo?.cumulativeUsage ?? selectedRequestUsage
    const selectedRequestOptions = selectedRequestInfo?.requestConfig
    const activeTurn = selectedRequest === null ? selected?.turn : selectedRequest.turn
    const activeSection = selectedRequest === null ? selected?.section : selectedRequestRecords[0]?.section
    const selectedTabs = selectedRequest !== null
      ? REQUEST_TABS.filter(tab => tab.id !== 'options' || selectedRequestOptions !== undefined)
      : selected === undefined ? [] : detailTabs(selected)
    const selectedParents = selected === undefined ? {} : parentRecords(allRecords, selected)
    const selectedParentMessage = selectedParents.message
    const selectedParentTool = selectedParents.tool
    const selectedAssistantRequest = selected?.cell.kind === 'message'
      ? requestNumbers.get(requestKey(selected.turn, selected.group))
      : undefined
    const selectedAssistantRequestInfo = selectedAssistantRequest === undefined
      ? undefined
      : sessionRequestNumbers?.find(request => request.number === selectedAssistantRequest)
    const selectedAssistantRequestTarget =
      selected !== undefined && selectedAssistantRequest !== undefined
        ? {
          turn: selected.turn,
          group: selected.group,
          ...(selectedAssistantRequestInfo?.seq === undefined ? {} : { seq: selectedAssistantRequestInfo.seq }),
        }
        : undefined
    const hasSelectedHierarchy = selectedAssistantRequestTarget !== undefined
      || selectedParents.message !== undefined
      || selectedParents.tool !== undefined
    const splitStyle = this.#toolRequestOffset === null
      ? ''
      : `--trajectory-tool-request-width: calc(58cqw - ${this.#toolRequestOffset}px)`

    const toggleUnix = () => { this.#showUnix = !this.#showUnix; this.#render() }

    queueMicrotask(() => {
      this.#applyPendingScroll(records, virtualizationEnabled, virtualIndexByRecordId, rowVirtualizer)
      this.#applyTimelineFocus(
        records, projectedVirtualRows, virtualizationEnabled, virtualIndexByRecordId, rowVirtualizer, timelineFocusIndexes,
      )
      this.#syncScrollInit(historyLoading, virtualizationEnabled, rowVirtualizer)
    })

    const olderBusy = olderHistoryLoading || this.#olderLoading
    const showInitialLoading = historyLoading || !this.#tableScrollReady
    const historyRowOffset = hasOlderRecords ? 1 : 0

    const vdom = (
      h('div', {class: css.split ?? '', style: splitStyle},
        h('div', {
          class: css.tablePane ?? '',
          'data-trajectory-scroll': '',
          onscroll: (event) => {
            const pane = event.currentTarget
            this.#syncTableTailFollow(pane)
            this.#requestOlder(pane, true)
          },
          onclick: (event) => {
            if (event.target === event.currentTarget) this.#clearAllSelections()
          },
        },
          showInitialLoading && (
            h('div', {class: css.historyLoading ?? '', role: 'status', 'aria-live': 'polite'},
              h('span', {class: css.historyLoadingBar ?? ''},
                h('span', {class: css.historyLoadingSpinner ?? '', 'aria-hidden': 'true'}),
                'Loading trajectory…',
              ),
            )
          ),
          h('table', {
            class: css.table ?? '',
            'data-scroll-ready': this.#tableScrollReady || undefined,
            'aria-rowcount': records.length + historyRowOffset,
          },
            h('colgroup', null,
              h('col', {class: css.eventColumn ?? ''}),
              h('col', {class: css.contentColumn ?? ''}),
            ),
            h('tbody', null,
              hasOlderRecords && (
                h('tr', {class: css.historyLoadRow ?? '', 'data-history-load': '', 'aria-rowindex': 1},
                  h('td', {colSpan: 2},
                    h('button', {
                      type: 'button',
                      class: css.historyLoadButton ?? '',
                      disabled: olderBusy || onLoadOlder === undefined,
                      'aria-label': olderBusy ? 'Loading earlier history…' : 'Load earlier history',
                      onclick: () => {
                        const pane = this.#tablePaneEl
                        if (pane !== null) this.#requestOlder(pane, false)
                      },
                    },
                      olderBusy && h('span', {class: css.historyLoadingSpinner ?? '', 'aria-hidden': 'true'}),
                      h('span', {'aria-hidden': 'true'},
                        olderBusy ? 'Loading earlier history…' : 'Load earlier history',
                      ),
                      h('span', {class: css.visuallyHidden ?? '', role: 'status', 'aria-live': 'polite'},
                        olderBusy ? 'Loading earlier history…' : '',
                      ),
                    ),
                  ),
                )
              ),
              virtualTop > 0 && (
                h('tr', {class: css.virtualSpacer ?? '', 'data-virtual-spacer': 'top', 'aria-hidden': 'true'},
                  h('td', {colSpan: 2, style: `--trajectory-virtual-spacer-height: ${virtualTop}px`}),
                )
              ),
              renderedRecords.map(({ record, position, terminalRequestBoundary }) => {
                const { displayText, listDisplayText, resultText, toolCallOnly, toolCallText } = recordPresentation(record.cell)
                const isCollapsedSummary = record.collapsedSummary !== undefined
                const isRequestOnly = record.cell.requestOnly === true
                const isInitialSystem = record.cell.kind === 'system'
                  && record.cell.index === allRecords[0]?.cell.index
                const key = requestKey(record.turn, record.group)
                const request = requestBoundaries.get(key) === record.cell.index
                  && !isCollapsedSummary
                  && (record.turn === null || !collapsedTurns.has(record.turn))
                  ? requestNumbers.get(key)
                  : undefined
                const requestInfo = request === undefined
                  ? undefined
                  : sessionRequestNumbers?.find(candidate => candidate.number === request)
                const requestStatus = requestInfo?.status ?? (record.cell.isError === true ? 'error' : undefined)
                const requestRunIndex = requestBoundaryRuns.get(record.cell.index) ?? 0
                const requestBoundaryStyle = `--request-boundary-offset: ${requestRunIndex * 8}px`
                const requestLabel = request === undefined
                  ? undefined
                  : `Request #${request}${requestInfo?.purpose === 'compaction' ? ' · Compaction' : ''}`
                const requestSelected = request !== undefined
                  && selectedRequest?.turn === record.turn
                  && selectedRequest.group === record.group
                const sectionActive = record.turn === null
                  ? activeSection === record.section
                  : activeTurn === record.turn

                return (
                  h('tr', {
                    tabIndex: isRequestOnly ? -1 : 0,
                    'aria-rowindex': position + 1 + historyRowOffset,
                    'aria-label': isCollapsedSummary
                      ? `Collapsed ${record.collapsedSummaryKind} summary, ${record.collapsedSummary}`
                      : isRequestOnly
                        ? `Request ${request ?? ''}, compaction`
                        : `${request === undefined ? '' : `Request ${request}, `}${KIND_LABEL[record.cell.kind]}, ${listDisplayText || 'no content'}`,
                    'aria-selected': !isCollapsedSummary && !isRequestOnly && selectedIndex === record.cell.index,
                    'data-kind': record.cell.kind,
                    'data-trajectory-row-key': trajectoryVirtualRecordKey(record),
                    'data-virtual-position': virtualizationEnabled ? position : undefined,
                    'data-record-index': !isCollapsedSummary && !isRequestOnly ? record.cell.index : undefined,
                    'data-request-only': isRequestOnly || undefined,
                    'data-terminal-request-boundary': terminalRequestBoundary || undefined,
                    'data-group-start': record.groupStart || undefined,
                    'data-turn-start': record.turnStart || undefined,
                    'data-error': record.cell.isError || undefined,
                    'data-running': stateOf(record) === 'running' || undefined,
                    'data-turn-end': record.turnEnd || undefined,
                    'data-collapsed-summary': record.collapsedSummaryKind,
                    'data-selected': !isCollapsedSummary && selectedIndex === record.cell.index || undefined,
                    'data-timeline-focus': isCollapsedSummary || timelineFocusIndexes === null
                      ? undefined
                      : timelineFocusIndexes.has(record.cell.index) ? 'inside' : 'outside',
                    onclick: isRequestOnly
                      ? null
                      : isCollapsedSummary
                        ? () => {
                          if (record.collapsedSummaryKind === 'turn' && record.turn !== null) {
                            onToggleTurn(record.turn)
                          } else onToggleAssistant(trajectoryRecordId(record.cell))
                        }
                        : () => { this.#selectRecord(record.cell.index) },
                    ondblclick: (event) => {
                      if (isCollapsedSummary || isRequestOnly) return
                      if (record.turn !== null && collapsedTurns.has(record.turn)) {
                        event.preventDefault()
                        onToggleTurn(record.turn)
                        return
                      }
                      if (
                        record.cell.kind === 'message'
                        && assistantToolCalls(allRecords, record.cell.index).length > 0
                      ) {
                        event.preventDefault()
                        onToggleAssistant(trajectoryRecordId(record.cell))
                        return
                      }
                      if (!record.turnStart) return
                      if (record.turn === null) return
                      if (allRecords.filter(candidate =>
                        candidate.turn === record.turn
                        && candidate.cell.requestOnly !== true
                        && candidate.cell.kind !== 'system').length <= 1) return
                      event.preventDefault()
                      onToggleTurn(record.turn)
                    },
                    onkeydown: (event) => {
                      if (isRequestOnly) return
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      if (isCollapsedSummary) {
                        if (record.collapsedSummaryKind === 'turn' && record.turn !== null) {
                          onToggleTurn(record.turn)
                        } else onToggleAssistant(trajectoryRecordId(record.cell))
                        return
                      }
                      this.#selectRecord(record.cell.index)
                    },
                  },
                    h('td', {class: css.event ?? ''},
                      request !== undefined && (
                        h('button', {
                          type: 'button',
                          class: (requestSelected
                            ? `${css.requestBoundaryControl ?? ''} ${css.requestBoundaryControlActive ?? ''}`
                            : css.requestBoundaryControl) ?? '',
                          'aria-label': requestLabel,
                          'aria-pressed': requestSelected,
                          'data-label': requestLabel,
                          'data-request-run-index': requestRunIndex,
                          'data-request-status': requestStatus,
                          style: requestBoundaryStyle,
                          onclick: (event) => {
                            event.stopPropagation()
                            this.#selectRequest({
                              turn: record.turn,
                              group: record.group,
                              ...(requestInfo?.seq === undefined ? {} : { seq: requestInfo.seq }),
                            })
                          },
                          ondblclick: (event) => { event.stopPropagation() },
                        })
                      ),
                      record.turn !== null && activeTurn === record.turn && !isInitialSystem && (
                        h('span', {class: css.turnRail ?? '', 'aria-hidden': 'true'})
                      ),
                      !isCollapsedSummary && selectedIndex === record.cell.index && (
                        h('span', {class: css.selectionRail ?? '', 'aria-hidden': 'true'})
                      ),
                      !isCollapsedSummary && !isRequestOnly && record.turnStart && (
                        h('span', {
                          class: (sectionActive
                            ? `${css.turnLabel ?? ''} ${css.turnLabelActive ?? ''}`
                            : css.turnLabel) ?? '',
                          role: 'img',
                          'aria-label': sectionLabel(record.turn),
                        },
                          record.turn === null
                            ? sectionLabel(record.turn)
                            : [
                              h('span', {class: css.turnLabelFull ?? '', 'aria-hidden': 'true'},
                                sectionLabel(record.turn),
                              ),
                              h('span', {class: css.turnLabelCompact ?? '', 'aria-hidden': 'true'},
                                '#', record.turn,
                              ),
                            ],
                        )
                      ),
                      h('div', {class: css.eventInner ?? ''},
                        !isCollapsedSummary && !isRequestOnly && (
                          h('span', {class: css.kindSlot ?? ''},
                            h('span', {
                              class: `${css.kindTag ?? ''} ${
                                (record.cell.kind === 'system'
                                  ? css.systemNeutral
                                  : record.cell.kind === 'context'
                                    ? css.contextGreen
                                    : record.cell.kind === 'compacted'
                                      ? css.compacted
                                      : record.cell.kind === 'tool'
                                        ? css.toolAmber
                                        : record.cell.kind === 'message'
                                          ? css.assistantVioletBright
                                          : record.cell.kind === 'subtool'
                                            ? css.subtoolAmber
                                            : css[record.cell.kind]) ?? ''
                              }`,
                              'data-role-kind': record.cell.kind,
                            },
                              h(Tooltip, {label: KIND_LABEL[record.cell.kind], side: 'right'},
                                h('span', {class: css.kindTagIcon ?? '', 'aria-hidden': 'true'},
                                  kindIcon(record.cell.kind),
                                ),
                              ),
                              h('span', {class: css.kindTagLabel ?? ''},
                                KIND_LABEL[record.cell.kind],
                              ),
                            ),
                          )
                        ),
                      ),
                    ),
                    h('td', {class: css.content ?? ''},
                      isRequestOnly
                        ? null
                        : record.collapsedSummary !== undefined
                          ? (
                            h('span', {class: css.collapsedTurnContent ?? '', title: record.collapsedSummary},
                              h('span', {class: css.collapsedTurnEllipsis ?? ''}, '…'),
                              h('span', {class: css.collapsedTurnText ?? ''}, record.collapsedSummary),
                            )
                          )
                          : (
                            h('span', {
                              class: (resultText === undefined ? css.contentText : css.resultPreview) ?? '',
                              title: resultText === undefined ? listDisplayText : `${listDisplayText} → ${resultText}`,
                            },
                              h('span', {class: (resultText === undefined ? undefined : css.resultRequest) ?? ''},
                                RecordListText({
                                  displayText,
                                  toolCallOnly,
                                  toolCallText,
                                }),
                              ),
                              resultText !== undefined && (
                                h('span', {class: (record.cell.isError ? `${css.inlineResult ?? ''} ${css.error ?? ''}` : css.inlineResult) ?? ''},
                                  h('span', {class: css.arrow ?? ''}, '→'),
                                  h('span', {class: (resultText === 'No output'
                                    ? `${css.inlineResultText ?? ''} ${css.noOutputText ?? ''}`
                                    : css.inlineResultText) ?? ''},
                                    resultText,
                                  ),
                                )
                              ),
                            )
                          ),
                    ),
                  )
                )
              }),
              virtualBottom > 0 && (
                h('tr', {class: css.virtualSpacer ?? '', 'data-virtual-spacer': 'bottom', 'aria-hidden': 'true'},
                  h('td', {colSpan: 2, style: `--trajectory-virtual-spacer-height: ${virtualBottom}px`}),
                )
              ),
            ),
          ),
        ),
        (selectedRequest !== null
          || promptSelected
          || (selected !== undefined && selectedState !== undefined)) && (
          h('aside', {
            class: css.details ?? '',
            'aria-label': 'Event details',
            tabIndex: -1,
            style: this.#detailsWidth === null ? '' : `width: ${this.#detailsWidth}px`,
          },
            h('div', {
              class: css.detailsResizeHandle ?? '',
              role: 'separator',
              'aria-label': 'Resize event details',
              'aria-controls': 'trajectory-detail-panel',
              'aria-orientation': 'vertical',
              tabIndex: 0,
              title: 'Drag to resize. Double-click to reset.',
              ondblclick: () => {
                this.#detailsWidth = null
                this.#toolRequestOffset = null
                this.#render()
              },
              onpointerdown: (event) => {
                if (event.button !== 0) return
                const details = (event.currentTarget).parentElement
                if (details === null) return
                const split = details.parentElement
                if (split === null) return
                const splitWidth = split.getBoundingClientRect().width
                this.#detailsResizeDrag = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startWidth: details.getBoundingClientRect().width,
                  splitWidth,
                  startToolRequestOffset: this.#toolRequestOffset ?? (
                    splitWidth * TOOL_REQUEST_SHARE - defaultToolRequestWidth(splitWidth)
                  ),
                }
                ;(event.currentTarget).setPointerCapture(event.pointerId)
                event.preventDefault()
              },
              onpointermove: (event) => {
                const drag = this.#detailsResizeDrag
                if (drag === null || drag.pointerId !== event.pointerId) return
                const nextDetailsWidth = clampDetailsWidth(
                  drag.startWidth + drag.startX - event.clientX,
                  drag.splitWidth,
                )
                this.#detailsWidth = nextDetailsWidth
                this.#toolRequestOffset = drag.startToolRequestOffset
                  + (nextDetailsWidth - drag.startWidth) * TOOL_REQUEST_SHARE
                this.#render()
              },
              onpointerup: (event) => {
                if (this.#detailsResizeDrag?.pointerId !== event.pointerId) return
                this.#detailsResizeDrag = null
                ;(event.currentTarget).releasePointerCapture(event.pointerId)
              },
              onpointercancel: () => {
                this.#detailsResizeDrag = null
              },
              onkeydown: (event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                const details = (event.currentTarget).parentElement
                if (details === null) return
                const split = details.parentElement
                if (split === null) return
                const direction = event.key === 'ArrowLeft' ? 1 : -1
                const currentDetailsWidth = details.getBoundingClientRect().width
                const splitWidth = split.getBoundingClientRect().width
                const nextDetailsWidth = clampDetailsWidth(
                  currentDetailsWidth + direction * DETAILS_RESIZE_STEP,
                  splitWidth,
                )
                const currentToolRequestOffset = this.#toolRequestOffset ?? (
                  splitWidth * TOOL_REQUEST_SHARE - defaultToolRequestWidth(splitWidth)
                )
                this.#detailsWidth = nextDetailsWidth
                this.#toolRequestOffset = currentToolRequestOffset
                  + (nextDetailsWidth - currentDetailsWidth) * TOOL_REQUEST_SHARE
                this.#render()
                event.preventDefault()
              },
            }),
            h('div', {class: css.detailsHeader ?? ''},
              h('div', {class: css.detailsTitle ?? ''},
                selectedRequest !== null
                  ? [
                    h('span', {class: css.requestDetailsDot ?? '', 'aria-hidden': 'true'}),
                    h('span', {class: css.requestDetailsName ?? ''},
                      'Request #', selectedRequestNumber ?? '—',
                    ),
                    h('span', {class: css.detailsLocation ?? ''},
                      selectedRequestInfo?.purpose === 'compaction'
                        ? `Compaction · ${sectionLabel(selectedRequest.turn)}`
                        : sectionLabel(selectedRequest.turn),
                    ),
                  ]
                  : promptSelected
                    ? [
                      h('span', {class: `${css.kindTag ?? ''} ${css.systemNeutral ?? ''}`}, 'SYSTEM'),
                      h('span', {class: css.detailsLocation ?? ''}, selected?.cell.text),
                    ]
                    : selected !== undefined
                      ? [
                        h('span', {
                          class: `${css.kindTag ?? ''} ${
                            (selected.cell.kind === 'context'
                              ? css.contextGreen
                              : selected.cell.kind === 'compacted'
                                ? css.compacted
                                : selected.cell.kind === 'tool'
                                  ? css.toolAmber
                                  : selected.cell.kind === 'message'
                                    ? css.assistantVioletBright
                                    : selected.cell.kind === 'subtool'
                                      ? css.subtoolAmber
                                      : css[selected.cell.kind]) ?? ''
                          }`,
                        },
                          KIND_LABEL[selected.cell.kind],
                        ),
                        h('span', {class: css.detailsLocation ?? ''},
                          selected.cell.kind === 'compacted'
                            ? sectionLabel(selected.turn)
                            : `${sectionLabel(selected.turn)} · ${selected.group}`,
                        ),
                      ]
                      : null,
              ),
              h('button', {
                type: 'button',
                class: css.close ?? '',
                'aria-label': 'Close details',
                onclick: () => { this.#clearInspectorSelection() },
              },
                h('span', {'aria-hidden': 'true'}, '×'),
              ),
            ),
            h('div', {class: css.detailTabs ?? '', role: 'tablist', 'aria-label': 'Event details'},
              selectedTabs.map(tab => (
                h('button', {
                  key: tab.id,
                  id: `trajectory-detail-${tab.id}`,
                  type: 'button',
                  role: 'tab',
                  'aria-controls': 'trajectory-detail-panel',
                  'aria-selected': this.#activeTab === tab.id,
                  class: (this.#activeTab === tab.id ? `${css.detailTab ?? ''} ${css.detailTabActive ?? ''}` : css.detailTab) ?? '',
                  onclick: () => { this.#activateTab(tab.id) },
                },
                  tab.label,
                )
              )),
            ),
            h('div', {
              id: 'trajectory-detail-panel',
              class: (this.#activeTab === 'overview' ? `${css.detailBody ?? ''} ${css.detailBodySummary ?? ''}` : css.detailBody) ?? '',
              role: 'tabpanel',
              'aria-labelledby': `trajectory-detail-${this.#activeTab}`,
            },
              selectedRequest !== null && selectedRequestState !== undefined && this.#activeTab === 'overview' && [
                h('dl', {class: `${css.overview ?? ''} ${css.summaryScrollRegion ?? ''}`, 'data-summary-scroll-region': ''},
                  h('div', null,
                    h('dt', null, 'Status'),
                    h('dd', {class: (selectedRequestState === 'error' ? css.error : undefined) ?? ''},
                      statusLabel(selectedRequestState),
                    ),
                  ),
                  selectedRequestInfo?.purpose === 'compaction' && (
                    h('div', null,
                      h('dt', null, 'Purpose'),
                      h('dd', null, 'Compaction'),
                    )
                  ),
                  (selectedRequestInfo?.provider ?? selectedRequestInfo?.requestConfig?.provider) !== undefined && (
                    h('div', null,
                      h('dt', null, 'Provider'),
                      h('dd', null, selectedRequestInfo?.provider ?? selectedRequestInfo?.requestConfig?.provider),
                    )
                  ),
                  (selectedRequestInfo?.model ?? selectedRequestInfo?.requestConfig?.model) !== undefined && (
                    h('div', null,
                      h('dt', null, 'Model'),
                      h('dd', null, selectedRequestInfo?.model ?? selectedRequestInfo?.requestConfig?.model),
                    )
                  ),
                  h('div', null,
                    h('dt', null, 'Tool calls'),
                    h('dd', null, selectedRequestToolCalls),
                  ),
                  selectedRequestSubtoolCalls > 0 && (
                    h('div', null,
                      h('dt', null, 'Subtool calls'),
                      h('dd', null, selectedRequestSubtoolCalls),
                    )
                  ),
                  selectedRequestInfo?.error !== undefined && (
                    h('div', null,
                      h('dt', null, 'Error'),
                      h('dd', {class: css.error ?? ''}, selectedRequestInfo.error),
                    )
                  ),
                  selectedRequestInfo?.retry !== undefined && (
                    h('div', null,
                      h('dt', null, 'Retry'),
                      h('dd', null,
                        'Scheduled ', selectedRequestInfo.retry,
                        selectedRequestInfo.maxRetries === undefined ? '' : ` of ${selectedRequestInfo.maxRetries}`,
                      ),
                    )
                  ),
                  selectedRequestInfo?.retryDelayMs !== undefined && (
                    h('div', null,
                      h('dt', null, 'Retry delay'),
                      h('dd', null, formatDurationMs(selectedRequestInfo.retryDelayMs)),
                    )
                  ),
                  selectedRequestResult !== undefined && (
                    h('div', null,
                      h('dt', null, 'Result'),
                      h('dd', {class: css.overviewParentLinks ?? ''},
                        h('button', {
                          type: 'button',
                          class: css.overviewHierarchyNavLink ?? '',
                          onclick: () => { this.#openRecordSummary(selectedRequestResult) },
                        },
                          h('span', null,
                            selectedRequestInfo?.purpose === 'compaction' ? 'Compacted' : 'Assistant Message',
                          ),
                          h(IconChevronRightOutline14, {className: css.overviewHierarchyJumpIconTight, size: 11}),
                        ),
                      ),
                    )
                  ),
                ),
                h('div', {class: css.overviewSections ?? ''},
                  selectedRequestOptions !== undefined && (
                    h(OverviewSection, {label: 'Options', onOpen: () => { this.#activateTab('options') }},
                      h(RequestOptions, {options: selectedRequestOptions, preview: true}),
                    )
                  ),
                  h(OverviewSection, {label: 'Usage', onOpen: () => { this.#activateTab('usage') }},
                    h(UsageRows, {usage: selectedRequestUsage}),
                  ),
                  h(OverviewSection, {label: 'Timing', onOpen: () => { this.#activateTab('timing') }},
                    h(RequestTiming, {
                      assistant: selectedRequestAssistant,
                      anchor: selectedRequestAnchor,
                      request: selectedRequestInfo,
                      showUnix: this.#showUnix,
                      onToggleUnix: toggleUnix,
                    }),
                  ),
                ),
              ],
              selectedRequest !== null && this.#activeTab === 'options' && (
                h(RequestOptions, {options: selectedRequestOptions})
              ),
              selectedRequest !== null && this.#activeTab === 'usage' && (
                h(RequestUsagePanel, {usage: selectedRequestUsage, cumulative: selectedRequestCumulativeUsage})
              ),
              selectedRequest !== null && this.#activeTab === 'timing' && (
                h(RequestTiming, {
                  assistant: selectedRequestAssistant,
                  anchor: selectedRequestAnchor,
                  request: selectedRequestInfo,
                  showUnix: this.#showUnix,
                  onToggleUnix: toggleUnix,
                })
              ),
              promptSelected && selectedPreviousPrompt !== undefined && this.#activeTab === 'diff' && (
                h(SystemPromptDiff, {before: selectedPreviousPrompt, after: selectedPrompt})
              ),
              promptSelected && this.#activeTab === 'system-prompt' && (
                selectedPrompt.system === ''
                  ? h('p', {class: css.noPayload ?? ''}, 'No system prompt in this request')
                  : (
                    h('div', {class: `${css.markdownPayload ?? ''} ${css.systemPrompt ?? ''}`},
                      h(MarkdownText, {text: selectedPrompt.system}),
                    )
                  )
              ),
              promptSelected && this.#activeTab === 'tools' && (
                h(ToolCatalog, {tools: selectedPrompt.tools})
              ),
              !promptSelected
                && selected?.cell.kind === 'compacted'
                && selectedState !== undefined
                && this.#activeTab === 'overview' && [
                h('dl', {class: `${css.overview ?? ''} ${css.summaryScrollRegion ?? ''}`, 'data-summary-scroll-region': ''},
                  h('div', null,
                    h('dt', null, 'Status'),
                    h('dd', {class: (selectedState === 'error' ? css.error : undefined) ?? ''},
                      statusLabel(selectedState),
                    ),
                  ),
                  h('div', null,
                    h('dt', null, 'Duration'),
                    h('dd', null, formatElapsedSeconds(selected.cell.timeSeconds)),
                  ),
                  h('div', null,
                    h('dt', null, 'Tokens'),
                    h('dd', null, '—'),
                  ),
                ),
                selected.cell.outputDetail !== undefined
                  ? (
                    h('div', {class: `${css.compactedSummary ?? ''} ${css.summaryScrollRegion ?? ''}`, 'data-summary-scroll-region': ''},
                      h(MarkdownRecordContent, {
                        record: selected,
                        rendered: true,
                        thinkingExpanded: this.#thinkingExpanded,
                        onThinkingExpandedChange: (expanded) => { this.#thinkingExpanded = expanded; this.#render() },
                        onOpenCall: (callId) => { this.#openCallSummary(callId) },
                      }),
                    )
                  )
                  : null,
              ],
              !promptSelected
                && selected !== undefined
                && selected.cell.kind !== 'compacted'
                && selectedState !== undefined
                && this.#activeTab === 'overview' && [
                h('dl', {class: `${css.overview ?? ''} ${css.summaryScrollRegion ?? ''}`, 'data-summary-scroll-region': ''},
                  selected.cell.messageSource !== undefined && (
                    h('div', null,
                      h('dt', null, 'Source'),
                      h('dd', {class: css.overviewParentLinks ?? ''},
                        h('button', {
                          type: 'button',
                          class: css.overviewHierarchyNavLink ?? '',
                          onclick: () => { this.#activateTab('source') },
                        },
                          h('span', null, messageSourceLabel(selected.cell.messageSource)),
                          h(IconChevronRightOutline14, {className: css.overviewHierarchyJumpIconTight, size: 11}),
                        ),
                      ),
                    )
                  ),
                  hasSelectedHierarchy && (
                    h('div', null,
                      h('dt', null, selectedAssistantRequestTarget !== undefined ? 'Source' : 'Hierarchy'),
                      h('dd', {class: css.overviewParentLinks ?? ''},
                        selectedAssistantRequestTarget !== undefined && (
                          h('button', {
                            type: 'button',
                            class: css.overviewHierarchyNavLink ?? '',
                            onclick: () => { this.#selectRequest(selectedAssistantRequestTarget) },
                          },
                            h('span', null, 'Request #', selectedAssistantRequest ?? '—'),
                            h(IconChevronRightOutline14, {className: css.overviewHierarchyJumpIconTight, size: 11}),
                          )
                        ),
                        selectedParentMessage !== undefined && (
                          h('button', {
                            type: 'button',
                            class: css.overviewHierarchyNavLink ?? '',
                            onclick: () => { this.#openRecordSummary(selectedParentMessage) },
                          },
                            h('span', null, 'Assistant Message'),
                            h(IconChevronRightOutline14, {className: css.overviewHierarchyJumpIconTight, size: 11}),
                          )
                        ),
                        selectedParentTool !== undefined && (
                          h('button', {
                            type: 'button',
                            class: css.overviewHierarchyNavLink ?? '',
                            onclick: () => { this.#openRecordSummary(selectedParentTool) },
                          },
                            h('span', null, 'Tool Call'),
                            h(IconChevronRightOutline14, {className: css.overviewHierarchyJumpIconTight, size: 11}),
                          )
                        ),
                      ),
                    )
                  ),
                  h('div', null,
                    h('dt', null, 'Status'),
                    h('dd', {class: (selectedState === 'error' ? css.error : undefined) ?? ''},
                      statusLabel(selectedState),
                    ),
                  ),
                  selected.cell.kind === 'message' && TokenRows({ cell: selected.cell }),
                  (selected.cell.kind === 'user' || selected.cell.kind === 'context') && (
                    h('div', null,
                      h('dt', null, 'Duration'),
                      h('dd', null, formatElapsedSeconds(selected.cell.timeSeconds)),
                    )
                  ),
                ),
                h('div', {class: css.overviewSections ?? ''},
                  isMarkdownRecord(selected)
                    ? (
                      h(OverviewSection, {label: 'Preview', onOpen: () => { this.#activateTab('rendered') }},
                        h(MarkdownRecordContent, {
                          record: selected,
                          rendered: true,
                          preview: true,
                          thinkingExpanded: this.#thinkingExpanded,
                          onThinkingExpandedChange: (expanded) => { this.#thinkingExpanded = expanded; this.#render() },
                          onOpenCall: (callId) => { this.#openCallSummary(callId) },
                        }),
                      )
                    )
                    : [
                      selected.cell.inputDetail
                        ? (
                          h(OverviewSection, {label: 'Payload', onOpen: () => { this.#activateTab('input') }},
                            h(RecordPayload, {record: selected, direction: 'input', preview: true}),
                          )
                        )
                        : null,
                      selected.cell.outputDetail
                        ? (
                          h(OverviewSection, {label: 'Result', onOpen: () => { this.#activateTab('output') }},
                            h(RecordPayload, {record: selected, direction: 'output', preview: true}),
                          )
                        )
                        : null,
                      h(OverviewSection, {label: 'Schema', onOpen: () => { this.#activateTab('schema') }},
                        h(RecordSchema, {record: selected, preview: true}),
                      ),
                    ],
                  selectedAssistantRequestTarget !== undefined && (
                    h(OverviewSection, {
                      label: 'Request Timing',
                      onOpen: () => { this.#selectRequest(selectedAssistantRequestTarget, 'timing') },
                    },
                      h(RecordTiming, {record: selected, showUnix: this.#showUnix, onToggleUnix: toggleUnix}),
                    )
                  ),
                  (selected.cell.kind === 'tool' || selected.cell.kind === 'subtool') && (
                    h(OverviewSection, {label: 'Timing', onOpen: () => { this.#activateTab('timing') }},
                      h(RecordTiming, {record: selected, showUnix: this.#showUnix, onToggleUnix: toggleUnix}),
                    )
                  ),
                ),
              ],
              !promptSelected && selected !== undefined && this.#activeTab === 'rendered' && (
                h(MarkdownRecordContent, {
                  record: selected,
                  rendered: true,
                  thinkingExpanded: this.#thinkingExpanded,
                  onThinkingExpandedChange: (expanded) => { this.#thinkingExpanded = expanded; this.#render() },
                  onOpenCall: (callId) => { this.#openCallSummary(callId) },
                })
              ),
              !promptSelected && selected !== undefined && this.#activeTab === 'raw' && (
                h(MarkdownRecordContent, {
                  record: selected,
                  rendered: false,
                  thinkingExpanded: this.#thinkingExpanded,
                  onThinkingExpandedChange: (expanded) => { this.#thinkingExpanded = expanded; this.#render() },
                  onOpenCall: (callId) => { this.#openCallSummary(callId) },
                })
              ),
              !promptSelected && selected !== undefined && this.#activeTab === 'source' && (
                h(MessageSource, {record: selected})
              ),
              !promptSelected && selected !== undefined && this.#activeTab === 'input' && (
                h(RecordPayload, {record: selected, direction: 'input'})
              ),
              !promptSelected && selected !== undefined && this.#activeTab === 'output' && (
                h(RecordPayload, {record: selected, direction: 'output'})
              ),
              !promptSelected && selected !== undefined && this.#activeTab === 'schema' && (
                h(RecordSchema, {record: selected})
              ),
              !promptSelected && selected !== undefined && this.#activeTab === 'timing' && (
                h(RecordTiming, {record: selected, showUnix: this.#showUnix, onToggleUnix: toggleUnix})
              ),
            ),
          )
        ),
      )
    )
    applyDiff(this, vdom)
    this.#tablePaneEl = this.querySelector(`.${css.tablePane}`)
    if (virtualizationEnabled && this.#tablePaneEl !== null && this.#virtual.virtualizer !== null) {
      this.#virtual.virtualizer.scrollElement = this.#tablePaneEl
    }
    this.#syncScrollInit(historyLoading, virtualizationEnabled, rowVirtualizer)
  }

  #applyPendingScroll(
    records,
    virtualizationEnabled,
    virtualIndexByRecordId,
    rowVirtualizer,
  ) {
    const id = this.#pendingScrollRecordId
    if (id === null) return
    const position = records.findIndex(record =>
      trajectoryRecordId(record.cell) === id && record.collapsedSummary === undefined)
    if (position === -1) return
    const focusInspected = this.#pendingInspectFocus
    if (virtualizationEnabled) {
      const virtualIndex = virtualIndexByRecordId.get(id)
      if (virtualIndex === undefined) return
      this.#pendingScrollRecordId = null
      this.#pendingInspectFocus = false
      this.#followsTableTail = false
      rowVirtualizer?.scrollToIndex(virtualIndex, { behavior: 'smooth', align: 'center' })
      if (focusInspected) this.#focusInspector()
      return
    }
    this.#pendingScrollRecordId = null
    this.#pendingInspectFocus = false
    this.#followsTableTail = false
    const recordIndex = records[position]?.cell.index
    const row = recordIndex === undefined
      ? null
      : this.querySelector(`tr[data-record-index="${recordIndex}"]`)
    if (row !== undefined && row !== null && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    if (focusInspected) this.#focusInspector()
  }

  #focusInspector(framesLeft = FOCUS_INSPECTOR_FRAMES) {
    requestAnimationFrame(() => {
      const inspector = this.querySelector('aside[aria-label="Event details"]')
      if (inspector !== null) inspector.focus({ preventScroll: true })
      else if (framesLeft > 0) this.#focusInspector(framesLeft - 1)
    })
  }

  #applyTimelineFocus(
    records,
    projectedVirtualRows,
    virtualizationEnabled,
    virtualIndexByRecordId,
    rowVirtualizer,
    timelineFocusIndexes,
  ) {
    if (timelineFocusIndexes === null || timelineFocusIndexes.size === 0) return
    const focusedPositions = records.flatMap((record, position) =>
      record.collapsedSummary === undefined
      && record.cell.requestOnly !== true
      && timelineFocusIndexes.has(record.cell.index)
        ? [position]
        : [])
    const first = focusedPositions.at(0)
    const last = focusedPositions.at(-1)
    if (first === undefined || last === undefined) return
    if (!virtualizationEnabled) {
      const focusedRows = [...this.querySelectorAll('tr[data-timeline-focus="inside"]')]
      const firstRow = focusedRows.at(0)
      const lastRow = focusedRows.at(-1)
      if (firstRow === undefined || lastRow === undefined) return
      const focusHeight = lastRow.getBoundingClientRect().bottom - firstRow.getBoundingClientRect().top
      const ledgerHeight = this.clientHeight
      const target = focusHeight > ledgerHeight
        ? firstRow
        : focusedRows[Math.floor((focusedRows.length - 1) / 2)]
      if (target !== undefined && typeof target.scrollIntoView === 'function') {
        this.#followsTableTail = false
        target.scrollIntoView({
          behavior: 'smooth',
          block: focusHeight > ledgerHeight ? 'start' : 'center',
        })
      }
      return
    }
    const focusedVirtualIndexes = [...new Set(focusedPositions.flatMap((position) => {
      const record = records[position]
      if (record === undefined) return []
      const virtualIndex = virtualIndexByRecordId.get(trajectoryRecordId(record.cell))
      return virtualIndex === undefined ? [] : [virtualIndex]
    }))].sort((left, right) => left - right)
    const firstVirtual = focusedVirtualIndexes.at(0)
    const lastVirtual = focusedVirtualIndexes.at(-1)
    if (firstVirtual === undefined || lastVirtual === undefined) return
    const paneHeight = this.#tablePaneEl?.clientHeight ?? 0
    const focusHeight = projectedVirtualRows
      .slice(firstVirtual, lastVirtual + 1)
      .reduce((height, row) => height + row.height, 0)
    this.#followsTableTail = false
    rowVirtualizer?.scrollToIndex(
      focusHeight > paneHeight
        ? firstVirtual
        : focusedVirtualIndexes[Math.floor((focusedVirtualIndexes.length - 1) / 2)] ?? firstVirtual,
      {
        behavior: 'smooth',
        align: focusHeight > paneHeight ? 'start' : 'center',
      },
    )
  }

  #syncScrollInit(
    historyLoading,
    virtualizationEnabled,
    rowVirtualizer,
  ) {
    if (!this.isConnected) return
    const pane = this.#tablePaneEl
    if (pane === null) return
    const { historyStartSeq } = this.#props
    const anchor = this.#olderLoadAnchor
    if (anchor !== null && anchor.historyStartSeq !== historyStartSeq) {
      if (!virtualizationEnabled) {
        pane.scrollTop = anchor.scrollTop + pane.scrollHeight - anchor.scrollHeight
      }
      this.#olderLoadAnchor = null
      this.#followsTableTail = false
      return
    }
    if (!this.#tableScrollInitialized) {
      if (historyLoading && pane.querySelector('tbody tr') === null) return
      this.#tableScrollInitialized = true
      this.#followsTableTail = true
      if (virtualizationEnabled) rowVirtualizer?.scrollToEnd({ behavior: 'auto' })
      else pane.scrollTop = pane.scrollHeight
      this.#tableScrollReady = true
      this.#render()
      return
    }
    if (!this.#followsTableTail) return
    if (virtualizationEnabled) rowVirtualizer?.scrollToEnd({ behavior: 'auto' })
    else pane.scrollTop = pane.scrollHeight
  }
}

defineElement('freddie-trajectory-table', FreddieTrajectoryTable)

export function TrajectoryTable(props) {
  return h(resolveElementTag('freddie-trajectory-table'), {
    ref: (el) => { el?.setProps(props) },
  })
}
