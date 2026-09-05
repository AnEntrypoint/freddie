import { createElement as h } from 'webjsx'
import { CompactionCommandCard } from './CompactionCommandCard.js'
import { GenericCommandCard } from './GenericCommandCard.js'
import css from './ChatView.css.js'

/** Ordinary command lifecycle renderer with command-name keyed specialization. */
export function CommandNodeView({ node, renderSlot, t }) {
  const command = node.data
  const owner = { node: command }
  return (
    h('div', { class: css.callRow ?? '' },
      renderSlot('conversation.chat.commandview', owner, {
        entryKey: command.name ?? '',
        fallback: GenericCommandCard({ ...owner, t }),
      }),
    )
  )
}

/** One integrated `/compact` command and compaction transaction renderer. */
export function ManualCompactionNodeView({
  node, t,
}) {
  const data = node.data
  return (
    h('div', { class: css.callRow ?? '' },
      CompactionCommandCard({
        node: data.command,
        ...data.compaction === null ? {} : { compaction: data.compaction },
        t,
      }),
    )
  )
}
