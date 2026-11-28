import { defineDomain, domainTable } from '@freddie/freddie-storage'

export const sessionArtifactsDomainSpec = defineDomain({
  name: 'session_artifacts',
  version: 0,
  tables: {
    sessions: domainTable({ parse: value => value }),
    checkpoints: domainTable({ parse: value => value }),
  },
})
