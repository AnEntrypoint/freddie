/**
 * Durable storage-domain declaration for lifecycle-bound message feedback.
 * @module @freddie/freddie-message-feedback/src/spec
 */

import { defineDomain, domainTable } from '@freddie/freddie-storage-domain'

/** Closed rating vocabulary for one message feedback item. */
export const messageFeedbackRatings = ['positive', 'negative']

/** One lifecycle-bound sidecar record per Session id. */
export const messageFeedbackDomainSpec = defineDomain({
  name: 'message_feedback',
  version: 0,
  tables: {
    sessions: domainTable({ parse: value => value }),
  },
})
