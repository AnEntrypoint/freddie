/**
 * The workspace domain declaration: record shape and the `defineDomain` spec
 * the registry opens. Records pass through unvalidated at the durable
 * boundary and at the RPC wire projection — `workspaceRecord` and
 * `workspaceDomainState` keep the `.parse` call shape sibling files use, but
 * they no longer validate; they just hand the value back.
 * @module @freddie/freddie-workspace/src/spec
 */

import { defineDomain, domainTable } from '@freddie/freddie-storage-domain'

/** Pass-through "schema": no validation, just the identity function. */
function passthroughSchema() {
  return { parse: value => value, safeParse: value => ({ success: value !== null }) }
}

/**
 * Durable shape of one workspace record. `path` is the `fs.realpath` canon
 * stamped at create; `sessionIds` is the ordered ownership account (array
 * order is display order); timestamps are ISO-8601 strings.
 */
export const workspaceRecord = passthroughSchema()

/**
 * Durable registry state. `initialized` distinguishes a valid empty registry
 * from one that still needs the header-only history bootstrap;
 * `workspaceIds` is the authoritative display order. `archivedSessionIds` is
 * the registry-global archive set layered over workspace accounting: an
 * archived session keeps its `sessionIds` slot (unarchiving must restore the
 * position), so the set never participates in the one-owner accounting
 * invariant.
 */
export const workspaceDomainState = passthroughSchema()

/**
 * The workspace domain spec: one `workspaces` table keyed by
 * {@link WorkspaceId} plus the bootstrap/order singleton. The registry opens
 * this through `ctx.storage.domain`; the spec object is the single source of
 * the domain's identity and version.
 */
export const workspaceDomainSpec = defineDomain({
  name: 'workspace',
  version: 2,
  global: {
    schema: workspaceDomainState,
    initial: { initialized: false, workspaceIds: [], archivedSessionIds: [] },
  },
  tables: { workspaces: domainTable(workspaceRecord) },
})
