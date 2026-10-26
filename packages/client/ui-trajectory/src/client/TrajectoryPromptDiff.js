import { createElement as h } from '@freddie/webjsx'
import { structuredPatch } from 'diff'
import css from './TrajectoryTable.css.js'

function promptDiffLines(before, after) {
  const patch = structuredPatch('', '', before, after, undefined, undefined, { context: 3 })
  return patch.hunks.flatMap((hunk, hunkIndex) => [
    ...(hunkIndex === 0 ? [] : [{ kind: 'meta', text: '' }]),
    {
      kind: 'meta',
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    },
    ...hunk.lines.flatMap((line) => {
      if (line.startsWith('\\')) return []
      if (line.startsWith('+')) return [{ kind: 'added', text: line }]
      if (line.startsWith('-')) return [{ kind: 'removed', text: line }]
      return [{ kind: 'context', text: line }]
    }),
  ])
}

function PromptDiffSection({
  title,
  before,
  after,
}) {
  const lines = promptDiffLines(before, after)
  if (lines.length === 0) return null
  return (
    h('section', {class: css.promptDiffSection ?? ''},
      h('h3', {class: css.promptDiffTitle ?? ''}, title),
      h('pre', {class: css.promptDiff ?? ''},
        lines.map((line, index) => (
          h('span', {class: css[`promptDiffLine${line.kind}`] ?? '', key: index},
            line.text || ' ',
            '\n',
          )
        )),
      ),
    )
  )
}

export function SystemPromptDiff({
  before,
  after,
}) {
  const toolsBefore = JSON.stringify(before.tools, null, 2)
  const toolsAfter = JSON.stringify(after.tools, null, 2)
  return (
    h('div', {class: css.promptDiffSections ?? ''},
      before.system !== after.system && (
        h(PromptDiffSection, {
          title: 'System Prompt',
          before: before.system,
          after: after.system,
        })
      ),
      toolsBefore !== toolsAfter && (
        h(PromptDiffSection, {
          title: 'Tools',
          before: toolsBefore,
          after: toolsAfter,
        })
      ),
    )
  )
}
