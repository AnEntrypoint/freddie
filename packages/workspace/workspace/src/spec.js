import { defineDomain, domainTable } from '@freddie/freddie-storage-domain'

function passthroughSchema() {
  return { parse: value => value, safeParse: value => ({ success: value !== null }) }
}

export const workspaceRecord = passthroughSchema()

export const workspaceDomainState = passthroughSchema()

export const workspaceDomainSpec = defineDomain({
  name: 'workspace',
  version: 2,
  global: {
    schema: workspaceDomainState,
    initial: { initialized: false, workspaceIds: [], archivedSessionIds: [] },
  },
  tables: { workspaces: domainTable(workspaceRecord) },
})
