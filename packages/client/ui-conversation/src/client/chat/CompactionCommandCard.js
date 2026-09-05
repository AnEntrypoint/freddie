// CompactionCommandCard: the `/compact` command's running row and its
// successful checkpoint disclosure. Outcomes without a checkpoint keep the
// generic command card so no-history, cancellation, and failures retain their
// complete handler-authored text.

import { CompactionItem } from './CompactionItem.js'
import { GenericCommandCard } from './GenericCommandCard.js'

/** Render one manual compaction lifecycle without duplicating its checkpoint marker. */
export function CompactionCommandCard({ node, compaction, t }) {
  if (compaction !== undefined) {
    return CompactionItem({
      node: compaction,
      title: 'compact',
      fallbackSummary: node.outcome?.text ?? null,
      t,
    })
  }
  if (node.outcome !== null) return GenericCommandCard({ node, t })
  return GenericCommandCard({ node, t, runningSummary: t('message.compaction.running') })
}
