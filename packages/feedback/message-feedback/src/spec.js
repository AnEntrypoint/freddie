import { defineDomain, domainTable } from '@freddie/freddie-storage-domain'

export const messageFeedbackRatings = ['positive', 'negative']

export const messageFeedbackDomainSpec = defineDomain({
  name: 'message_feedback',
  version: 0,
  tables: {
    sessions: domainTable({ parse: value => value }),
  },
})
