import { defineDomain, domainTable } from '@freddie/freddie-storage-domain'

export const projectionCacheDomainSpec = defineDomain({
  name: 'session_projcache',
  version: 3,
  tables: { sessions: domainTable() },
})
