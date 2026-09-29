/**
 * Browser-safe request, result, and lifecycle vocabulary for the Session
 * Remote service.
 *
 * @module @freddie/freddie-session-controller/types
 */

/** Maximum number of Sessions returned by one search. */
export const SESSION_SEARCH_RESULT_LIMIT = 20

/** Maximum search snippet length in Unicode code points. */
export const SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS = 240

/**
 * Persisted hints used to summarize a cold Session. Owned in freddie by the
 * apiproxy projection unit of the same key, whose fold adds `errored`.
 * @typedef {object} SessionListMetadata
 * @property {boolean} blank - whether the folded prefix contains no turn.
 * @property {number | null} lastPromptAt - latest human-authored prompt time.
 * @property {boolean} [errored] - freddie addition: whether the fold saw a failure.
 */

/**
 * Every available wire value a Session-list row carries as partial, possibly
 * stale hints. `kind` and `asOfSeq` are independent facts: `kind` says which
 * sequence space `asOfSeq` belongs to, and therefore how a client may merge
 * the block; `asOfSeq` is the producer's watermark in that space.
 * @typedef {object} SessionProjectionHints
 * @property {'cached' | 'sequenced'} kind - `sequenced` blocks come from the
 *   live registry and share the connected Session's sequence space; `cached`
 *   blocks come from the persisted projection cache and carry that record's
 *   own watermark.
 * @property {number} asOfSeq - watermark of the block in the named space.
 * @property {SessionProjectionValues} values - provider-validated values present
 *   in the block; omitted keys remain unknown.
 */

/**
 * @typedef {object} SessionProjectionBaseline
 * @property {number} asOfSeq
 * @property {SessionProjectionValues} values
 */

/**
 * @typedef {Record<string, unknown>} SessionProjectionValues
 */

/**
 * @typedef {object} ModelSelection
 * @property {string} provider
 * @property {string} model
 * @property {string} [reasoningEffort]
 */

/**
 * @typedef {object} ModelReasoningEffort
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 */

/**
 * @typedef {object} ModelReasoning
 * @property {ModelReasoningEffort[]} efforts
 * @property {string} [defaultEffort]
 */

/**
 * @typedef {object} ModelCatalogModel
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {ModelReasoning} [reasoning]
 */

/**
 * @typedef {object} ModelProviderGroup
 * @property {string} id
 * @property {string} name
 * @property {ModelCatalogModel[]} models
 */

/**
 * @typedef {object} ModelCatalogFailure
 * @property {string} id
 * @property {string} name
 * @property {string} message
 */

/**
 * @typedef {object} ModelCatalog
 * @property {ModelSelection} default - the deployment default for unconfigured Sessions.
 * @property {string[]} routableProviders - provider routes with at least one available model.
 * @property {ModelProviderGroup[]} groups
 * @property {ModelCatalogFailure[]} failures
 */

/**
 * @typedef {object} SessionSummary
 * @property {boolean} agentAvailable - whether this Session currently owns a live Agent.
 * @property {string} sessionId
 * @property {number} updatedAt
 * @property {boolean} running
 * @property {boolean} blank
 * @property {boolean} [errored] - whether the latest closed turn failed and none runs now.
 * @property {string} [parentSessionId]
 * @property {'subagent'} [origin]
 * @property {string} [cwd]
 * @property {string} [agentPreset] - the preset the Session runs: the newest logged selection for
 *   an attached Session, the creation header's for a cold or foreign row.
 * @property {true} [readOnly] - present on a row read from an extra session root this Host does not own.
 * @property {string} [extraHome] - the extra session root a read-only row was listed from.
 * @property {SessionProjectionHints} [projections]
 */

/**
 * @typedef {object} SessionSearchItem
 * @property {string} sessionId
 * @property {string} snippet
 */

/**
 * @typedef {object} SessionListValue
 * @property {SessionSummary[]} items
 */

/**
 * @typedef {object} SessionSearchRequest
 * @property {string} query
 */

/**
 * @typedef {object} SessionSearchValue
 * @property {SessionSearchItem[]} items
 * @property {boolean} hasMore
 */

/**
 * Durable identity selecting an ordinary Session or one direct subagent child.
 * @typedef {{ kind: 'session', sessionId: string }
 *   | { kind: 'subagent', parentSessionId: string, childSessionId: string,
 *       mode: 'one-shot' | 'continuable' | 'unknown' }} SessionAddress
 */

/**
 * @typedef {object} SessionProjectionsRequest
 * @property {string} sessionId
 */

/**
 * Complete Session projection baseline; null when the Session does not exist.
 * @typedef {SessionProjectionBaseline | null} SessionProjectionsValue
 */

/**
 * @typedef {object} SessionEventEntry
 * @property {'event'} type
 * @property {SessionWireEvent} event
 */

/**
 * @typedef {object} SessionWireHeader
 * @property {number} version
 * @property {string} id
 * @property {number} createdAt
 * @property {string} [cwd]
 * @property {string} [parentSession]
 * @property {boolean} isSeeded - whether the Session contains a fork-inherited prefix.
 * @property {'subagent'} [origin]
 * @property {number} [delegationDepth]
 * @property {string} [agentPreset]
 */

/**
 * @typedef {object} SessionWireEvent
 * @property {string} type
 * @property {number} seq
 * @property {number} time
 * @property {unknown} data
 * @property {true} [ignorable]
 * @property {unknown} [sourceEventSeqs]
 * @property {unknown} [surfaceOp]
 */

/**
 * @typedef {SessionEventEntry} SessionHistoryRecord
 */

/**
 * @typedef {object} SessionPageRequest
 * @property {SessionAddress} address
 * @property {number} throughSeq - inclusive log cut from the follow opening frame; -1 for empty.
 * @property {number} [beforeSeq]
 * @property {number} [maxMessages]
 * @property {{ minMessages: number, minTurns: number }} [turnWindow]
 */

/**
 * @typedef {object} SessionFollowRequest
 * @property {SessionAddress} address
 * @property {number} [maxMessages]
 * @property {{ minMessages: number, minTurns: number }} [turnWindow]
 */

/**
 * @typedef {object} SessionPage
 * @property {SessionHistoryRecord[]} records
 * @property {boolean} hasMore
 */

/**
 * @typedef {{ type: 'snapshot', header: SessionWireHeader, cursor: number,
 *   records: SessionHistoryRecord[], hasMore: boolean,
 *   projections: SessionProjectionBaseline }
 *   | SessionEventEntry} SessionFollowFrame
 */

/**
 * @typedef {object} SessionControlBaseline
 * @property {Record<string, SessionProjectionBaseline>} projections
 */

/**
 * @typedef {object} SessionProjectionUpdate
 * @property {string} sessionId
 * @property {string} key
 * @property {unknown} value
 * @property {number} seq
 */

/**
 * Host-wide live state stream; each generation starts with exactly one baseline.
 * @typedef {{ type: 'baseline', value: SessionControlBaseline }
 *   | ({ type: 'projection' } & SessionProjectionUpdate)} SessionControlFrame
 */

/**
 * @typedef {object} SessionInspection
 * @property {object} meta - the Session header.
 * @property {number} inheritedEventCount - durable fork-lineage boundary.
 * @property {SessionWireEvent[]} events
 */

/**
 * Session Controller events available to a Remote Event assembly.
 * @typedef {'api-session/activity'
 *   | 'api-session/added'
 *   | 'api-session/error'
 *   | 'api-session/removed'
 *   | 'api-session/status'} SessionControllerRemoteEvent
 */
