/**
 * Canonical provider-neutral message and streaming vocabulary for the loop,
 * session log, and plugins. Adapters alone translate provider wire messages;
 * mapped interfaces make the content, source, and finish unions extensible.
 */

/**
 * A model-facing text block.
 * @typedef {object} TextBlock
 * @property {'text'} type
 * @property {string} text
 */

/**
 * A model-produced reasoning ("thinking") block, distinct from visible text.
 * @typedef {object} ReasoningBlock
 * @property {'reasoning'} type
 * @property {string} text
 */

/**
 * A durable image attachment block. See `@freddie/freddie-attachment`.
 * @typedef {object} ImageBlock
 * @property {'image'} type
 * @property {*} attachment - the durable master attachment reference (`attachmentId`, bytes, dimensions).
 */

/**
 * One model-issued tool call, raw arguments still an unparsed JSON string.
 * @typedef {object} ToolCallBlock
 * @property {'tool-call'} type
 * @property {import('./brand.js').CallId} id
 * @property {string} name
 * @property {string} arguments - raw JSON text, never pre-parsed.
 */

/**
 * The result of one tool call, itself carrying nested content blocks.
 * @typedef {object} ToolResultBlock
 * @property {'tool-result'} type
 * @property {import('./brand.js').CallId} toolCallId
 * @property {readonly ContentBlock[]} content
 * @property {boolean} [isError]
 */

/**
 * Merge-extensible content blocks keyed by `type`. New core blocks land with
 * adapter, UI, and compaction support.
 * @typedef {TextBlock|ReasoningBlock|ImageBlock|ToolCallBlock|ToolResultBlock} ContentBlock
 */

/**
 * The discriminant of {@link ContentBlock}.
 * @typedef {'text'|'reasoning'|'image'|'tool-call'|'tool-result'} ContentBlockType
 */

/**
 * Where a message (or injected context) came from — a merge-extensible sum
 * type; plugins add their own `kind`s. See `./message.js` for the `form`
 * (`ContextForm`) fields a `plugin`-kind source may additionally carry.
 * @typedef {{kind: 'user'}|{kind: 'plugin', plugin: string, form?: string}|ModelMessageSource|ToolMessageSource} MessageSource
 */

/**
 * Provider/model identity and adapter-private replay data for an
 * assistant message produced by a model call.
 * @typedef {object} ModelMessageSource
 * @property {'model'} kind
 * @property {string} provider - provider route that produced the message.
 * @property {string} model - provider model id that produced the message.
 * @property {*} [replayState] - lossless-JSON adapter state for replay, exposed only to the same adapter instance.
 */

/**
 * Source of a tool-result message.
 * @typedef {object} ToolMessageSource
 * @property {'tool'} kind
 * @property {import('./brand.js').CallId} callId
 */

/**
 * One immutable message representation shared by delivery, durable history,
 * and model requests. See `./message.js` for the construction helpers.
 * @typedef {object} Message
 * @property {import('./brand.js').MessageId} id - stable identity preserved across every representation boundary.
 * @property {'system'|'user'|'assistant'} role - provider-neutral conversation role.
 * @property {readonly ContentBlock[]} content - exact model-facing blocks.
 * @property {MessageSource} source - required source fields supplied by the producer.
 */

/**
 * Token accounting for one model call. Counts are DISJOINT: `inputTokens` is
 * uncached input only; cached input is reported separately as
 * `cacheReadTokens`/`cacheWriteTokens` (billed input = sum of the three).
 * @typedef {object} TokenUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} [cacheReadTokens]
 * @property {number} [cacheWriteTokens]
 * @property {number} [reasoningTokens] - informational; already included in `outputTokens`.
 */

/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source.
 * @typedef {object} ReplayEnvelope
 * @property {*} response - response-level adapter-private metadata (ids, native stop reason).
 * @property {readonly *[]} [blocks] - per-block adapter-private metadata, one entry per emitted block in first-seen stream order.
 */

/**
 * Why a model response stopped; merge-extensible so adapters can surface
 * provider-specific reasons (see `./error.js`'s `LlmFailure` for `failure`).
 * @typedef {{kind: 'stop'}|{kind: 'tool-calls'}|{kind: 'max-tokens'}|{kind: 'aborted', failure: *}|{kind: 'error', failure: *}} FinishReason
 */

/**
 * Raw streaming protocol emitted by adapters (see `LlmAdapter#stream` in
 * `./index.js` and `BlockAssembler` in `./assembler.js`). Block indexes
 * correlate interleaved deltas, and `block-end` carries the assembled block.
 * Adapters emit `usage` before the terminal `finish` and nothing afterward;
 * tool arguments remain raw JSON strings until `block-end`.
 * @typedef {
 *   {type: 'block-start', index: number, blockType: ContentBlockType}
 *   | {type: 'text-delta', index: number, text: string}
 *   | {type: 'reasoning-delta', index: number, text: string}
 *   | {type: 'tool-call-delta', index: number, id: import('./brand.js').CallId, name?: string, argumentsDelta: string}
 *   | {type: 'block-end', index: number, block: ContentBlock}
 *   | {type: 'usage', usage: TokenUsage}
 *   | {type: 'finish', reason: FinishReason, replayState?: ReplayEnvelope}
 * } StreamChunk
 */

/**
 * A single model request, fully assembled (see `LlmRuntime#stream` and
 * `LlmAdapter#stream` in `./index.js`).
 * @typedef {object} GenerateOptions
 * @property {string} provider - registered provider route selecting the adapter instance.
 * @property {string} model
 * @property {import('./brand.js').ReasoningEffortId} [reasoningEffort] - adapter-owned reasoning effort selected for this exact model.
 * @property {readonly Message[]} messages - ordered conversation messages, exactly as the provider sees them (after the `system` slot).
 * @property {string} [system] - system prompt text (adapters map to the provider's system slot).
 * @property {readonly *[]} [tools] - tool schemas (adapters map to the provider's `tools` field).
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 * @property {readonly string[]} [stop] - generation halts as soon as the model produces any one of these strings.
 * @property {AbortSignal} [signal]
 * @property {*} [sessionId] - session identity stamped by the loop for request routing.
 * @property {'compaction'|'session-title'} [purpose] - provider-neutral classification for an auxiliary model call.
 */

export {} from './message.js'
