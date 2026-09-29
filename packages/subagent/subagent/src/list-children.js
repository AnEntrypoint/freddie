/**
 * Read-only enumeration of durable subagent children and descendant trees
 * straight from the live session store and optional session persistence — no
 * query service. Candidates come from one live-preferred corpus; each child's
 * mode/label is the registered `subagent` projection unit's value, resolved
 * down a three-rung ladder: the registry's watermark cache for a live child,
 * a durable projection-cache row when it serves an own-suffix identity (the
 * seq gate), and one persistence inspection folded through the registry
 * otherwise, validated against the enumerated lifecycle. The projection fold
 * is the single classification authority — this module parses no descriptor
 * itself. Absent persistence, enumeration is live-only: a cold child is
 * unreachable for resume anyway, so its absence is capability absence, not an
 * error. The module owns no catalog state and does not consult Activation,
 * Agent-registry, continuation-manager, or provider state.
 *
 * @module @freddie/freddie-subagent
 */

import { SubagentError } from './error.js'

/**
 * Concurrent cold inspections per listing; a constant because it bounds one
 * read-only scan of local media, not deployment behavior. Should a networked
 * persistence backend appear, promote it to a validated `Config` field.
 */
const COLD_READ_CONCURRENCY = 4

/**
 * One entry of a {@link listChildren} result, ordered by header `createdAt`
 * with ties broken on id. Only a candidate whose durable header has
 * `origin: 'subagent'` is interpreted. A served `subagent` projection value
 * produces a `child`; a settled candidate whose fold served no identity
 * produces a `diagnostic`; a running candidate without one is omitted — its
 * descriptor may not be appended yet (the creation window). Diagnostics
 * relay the projection fold's outcome or a failed read, never a per-child
 * event scan, and never expose model-hidden descriptor content.
 * @typedef {SubagentChildRow | SubagentChildDiagnostic} SubagentChildListEntry
 */

/**
 * A resolved child entry produced from a served `subagent` projection value.
 * @typedef {object} SubagentChildRow
 * @property {'child'} kind
 * @property {string} id
 * @property {'one-shot' | 'continuable'} mode
 * @property {string} [label]
 * @property {'running' | 'inactive'} activity
 * @property {boolean} hasChildren
 */

/**
 * A settled candidate whose projection fold served no identity, or a failed
 * cold read.
 * @typedef {object} SubagentChildDiagnostic
 * @property {'diagnostic'} kind
 * @property {string} id
 * @property {'corrupt' | 'unavailable'} reason
 */

/**
 * One entry of a descendant listing: the interpreted subagent facts plus its
 * position in the complete session tree. `parentId` is the durable direct
 * parent from the enumerated header, and `depth` counts edges from the root.
 * @typedef {(SubagentChildRow | SubagentChildDiagnostic) & { parentId: string, depth: number }} SubagentDescendantEntry
 */

/**
 * Enumerate one parent's origin-classified direct children from the
 * live-preferred merge of `ctx.sessions` and optional session persistence,
 * serving each identity from the `subagent` projection unit: the registry's
 * watermark snapshot for a live child; for a cold one, a durable
 * projection-cache row when it serves an own-suffix identity (the seq gate),
 * else one bounded-concurrency persistence inspection folded through the
 * registry.
 * @see SubagentRuntime.listChildren for the public cancellation and failure contract.
 * @param ctx - context carrying the session store, the projection registry,
 *   optional persistence, and the optional projection cache.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - caller-owned cancellation observed around every persistence read.
 * @returns children and per-child diagnostics ordered by `createdAt`, then id.
 * @throws {@link SubagentError} when the projection registry or the session
 *   store is not mounted, or the caller cancels the listing.
 */
export async function listChildren(ctx, parentSessionId, signal) {
  const listing = await prepareListing(ctx, signal)
  const candidates = [...listing.corpus.values()]
    .filter(record => record.header.parentSession === parentSessionId
      && record.header.origin === 'subagent')
    .sort(compareCorpusRecords)
  const rows = await resolveCandidateRows(candidates, listing, signal)
  return rows.filter(row => row !== undefined)
}

/**
 * Enumerate every session-backed subagent below one root in stable pre-order.
 * Ordinary sessions and one-shot children remain traversal nodes, so a
 * continuable child below either is still discovered. Classification uses the
 * same projection-backed runtime as {@link listChildren}; no Agent is loaded or
 * resumed.
 * @see SubagentRuntime.listDescendants for the public cancellation and failure contract.
 * @param ctx - context carrying the session store, projection registry, and optional persistence/cache.
 * @param rootSessionId - session whose complete descendant tree is listed.
 * @param signal - caller-owned cancellation observed around every persistence read.
 * @returns interpreted subagents with durable direct-parent and root-relative depth.
 * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
 */
export async function listDescendants(ctx, rootSessionId, signal) {
  const listing = await prepareListing(ctx, signal)
  const positioned = descendantCandidates(listing.corpus, rootSessionId)
  const rows = await resolveCandidateRows(
    positioned.map(candidate => candidate.record),
    listing,
    signal,
  )
  const entries = []
  positioned.forEach((position, index) => {
    const row = rows[index]
    if (row !== undefined) {
      entries.push({ ...row, parentId: position.parentId, depth: position.depth })
    }
  })
  return entries
}

/** Resolve listing services once and build one live-preferred session corpus. */
async function prepareListing(ctx, signal) {
  const projections = ctx.get('sessionProjections')
  if (projections === undefined) {
    throw new SubagentError(
      'listing subagents requires the sessionProjections registry (load @freddie/freddie-session-projection)',
      'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE',
    )
  }
  const sessions = ctx.get('sessions')
  if (sessions === undefined) {
    throw new SubagentError(
      'listing subagents requires the session store (load @freddie/freddie-session)',
      'SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE',
    )
  }
  assertListingNotCancelled(signal)
  const persistence = ctx.get('sessionPersistence')
  const cache = ctx.get('sessionProjectionCache')
  let persistedHeaders = []
  if (persistence !== undefined) {
    try {
      persistedHeaders = await persistence.list(signal)
    } catch (error) {
      assertListingNotCancelled(signal)
      throw error
    }
    assertListingNotCancelled(signal)
  }
  const corpus = new Map()
  for (const header of persistedHeaders) corpus.set(header.id, { header, live: undefined })
  for (const session of sessions.list()) {
    corpus.set(session.header.id, { header: session.header, live: session })
  }
  const subagentParents = new Set()
  for (const record of corpus.values()) {
    if (record.header.origin === 'subagent' && record.header.parentSession !== undefined) {
      subagentParents.add(record.header.parentSession)
    }
  }
  return { projections, persistence, cache, corpus, subagentParents }
}

/** Resolve projection-backed rows for aligned candidates with bounded cold reads. */
async function resolveCandidateRows(candidates, listing, signal) {
  const { projections, persistence, cache, subagentParents } = listing
  const rows = Array.from({ length: candidates.length })
  const coldReads = []
  candidates.forEach((candidate, index) => {
    const childId = candidate.header.id
    if (candidate.live === undefined) {
      coldReads.push({ index, header: candidate.header })
      return
    }
    let identity
    try {
      identity = projections.snapshot(candidate.live).values.subagent
    } catch {
      rows[index] = { kind: 'diagnostic', id: childId, reason: 'corrupt' }
      return
    }
    if (identity === undefined || identity === null) return
    rows[index] = childRow(childId, identity, 'running', subagentParents.has(childId))
  })

  if (persistence !== undefined && coldReads.length > 0) {
    const queue = [...coldReads]
    await Promise.all(Array.from(
      { length: Math.min(COLD_READ_CONCURRENCY, queue.length) },
      async () => {
        for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
          rows[job.index] = await resolveColdIdentity(
            persistence, projections, cache, job.header,
            subagentParents.has(job.header.id), signal,
          )
        }
      },
    ))
  }
  assertListingNotCancelled(signal)
  return rows
}

/** Build origin-classified candidates from the complete tree without recursion. */
function descendantCandidates(corpus, rootSessionId) {
  const children = new Map()
  for (const record of corpus.values()) {
    const parentId = record.header.parentSession
    if (parentId === undefined) continue
    const siblings = children.get(parentId)
    if (siblings === undefined) children.set(parentId, [record])
    else siblings.push(record)
  }
  for (const siblings of children.values()) siblings.sort(compareCorpusRecords)

  const positioned = []
  const stack = (children.get(rootSessionId) ?? [])
    .map(record => ({ record, parentId: rootSessionId, depth: 1 }))
    .reverse()
  const visited = new Set([rootSessionId])
  while (stack.length > 0) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const position = stack.pop()
    const id = position.record.header.id
    if (visited.has(id)) continue
    visited.add(id)
    if (position.record.header.origin === 'subagent') positioned.push(position)
    const descendants = children.get(id) ?? []
    for (const record of [...descendants].reverse()) {
      stack.push({ record, parentId: id, depth: position.depth + 1 })
    }
  }
  return positioned
}

/** Compare siblings by durable creation time, then id. */
function compareCorpusRecords(a, b) {
  return a.header.createdAt - b.header.createdAt || a.header.id.localeCompare(b.header.id)
}

/**
 * Resolve one cold candidate down the remaining ladder: a durable
 * projection-cache row when it serves an own-suffix identity (the seq gate),
 * otherwise one persistence inspection folded through the projection
 * registry (the same detached recipe the API proxy uses for detached session
 * projections). A failed inspection is one transient `unavailable` row
 * retried on the next listing; an inspection naming another lifecycle, and a
 * settled log the fold cannot identify — or that makes any registered unit
 * throw — are final, so they report `corrupt`.
 */
async function resolveColdIdentity(persistence, projections, cache, header, hasChildren, signal) {
  const childId = header.id
  if (cache !== undefined) {
    let cached
    try {
      cached = cache.cachedSnapshot(header)?.values.subagent
    } catch {
      cached = undefined
    }
    if (cached !== undefined && cached !== null && cached.seq >= (header.seedLength ?? 0)) {
      return childRow(childId, cached, 'inactive', hasChildren)
    }
  }
  assertListingNotCancelled(signal)
  let inspected
  try {
    inspected = await persistence.inspect(childId, signal)
  } catch {
    assertListingNotCancelled(signal)
    return { kind: 'diagnostic', id: childId, reason: 'unavailable' }
  }
  assertListingNotCancelled(signal)
  if (!sameLifecycle(inspected.meta, header)) {
    return { kind: 'diagnostic', id: childId, reason: 'corrupt' }
  }
  let identity
  try {
    identity = projections.restore({}, inspected.events, 0).snapshot.values.subagent
  } catch {
    return { kind: 'diagnostic', id: childId, reason: 'corrupt' }
  }
  if (identity === undefined || identity === null) {
    return { kind: 'diagnostic', id: childId, reason: 'corrupt' }
  }
  return childRow(childId, identity, 'inactive', hasChildren)
}

/** Materialize one served identity as its child row. */
function childRow(id, identity, activity, hasChildren) {
  return identity.mode === 'one-shot'
    ? {
      kind: 'child',
      id,
      mode: 'one-shot',
      ...identity.label !== undefined ? { label: identity.label } : {},
      activity,
      hasChildren,
    }
    : {
      kind: 'child',
      id,
      mode: 'continuable',
      label: identity.label,
      activity,
      hasChildren,
    }
}

/** Immutable header fields that distinguish one session lifecycle from another under the same id. */
const LIFECYCLE_WITNESS_KEYS = [
  'version', 'id', 'createdAt', 'cwd', 'parentSession', 'seedLength', 'delegationDepth',
]

/** Whether an inspected log still belongs to the enumerated lifecycle. */
function sameLifecycle(meta, expected) {
  return LIFECYCLE_WITNESS_KEYS.every(key => meta[key] === expected[key])
}

/** Stop a listing at its next cancellation checkpoint. */
function assertListingNotCancelled(signal) {
  if (signal?.aborted) {
    throw new SubagentError('subagent listing was cancelled', 'CANCELLED')
  }
}
