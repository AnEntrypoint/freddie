/** Public Agent Teams identities, durable records, and service request values. */

/** Identifies the implicit team rooted at one top-level Session. */

/**
 * Brand one root Session identity as its implicit Team identity.
 * @param id - Root Session identity.
 * @returns the same string branded as a Team identity.
 */
export function TeamId(id) {
  return id
}

/** Stable identifier for one task in a Team. */

/**
 * Brand a validated task id.
 * @param id - Team-local task identity.
 * @returns the same string branded as a Team task identity.
 */
export function TeamTaskId(id) {
  return id
}

/** Stable identifier for one durable peer message. */

/**
 * Brand a generated peer-message id.
 * @param id - Durable mailbox message identity.
 * @returns the same string branded as a Team message identity.
 */
export function TeamMessageId(id) {
  return id
}

/**
 * Durable teammate lifecycle: `provisioning` until the initial prompt is
 * durably accepted, then `active`, or `failed` when creation or recovery
 * could not settle it.
 * @typedef {'provisioning' | 'active' | 'failed'} TeammateLifecycle
 */

/**
 * Whole durable value written on every teammate lifecycle change.
 * @typedef {object} TeammateRecord
 * @property {import('@freddie/freddie-session').SessionId} id Durable child Session identity.
 * @property {string} name Never-reused, lower-kebab-case model-facing name.
 * @property {string} description Short creation-time purpose.
 * @property {string} provider Subagent provider that started the child.
 * @property {unknown} context Provider-defined context mode carried from creation.
 * @property {TeammateLifecycle} phase
 * @property {string} [error] Failure message, set only once `phase` is `failed`.
 */

/**
 * Current runtime-enriched roster row: the durable record joined with the
 * member's live Agent status, when resident.
 * @typedef {object} RosterRow
 * @property {import('@freddie/freddie-session').SessionId} id
 * @property {string} name
 * @property {'lead' | 'teammate'} role
 * @property {string} status Live Agent status, or `provisioning`/`failed`/`inactive`.
 * @property {string} [description]
 * @property {string} [provider]
 * @property {unknown} [context]
 * @property {string} [model]
 * @property {readonly string[]} diagnostics Failure messages, when any.
 */

/**
 * Durable task lifecycle.
 * @typedef {'pending' | 'in_progress' | 'completed' | 'deleted'} TeamTaskStatus
 */

/**
 * Whole durable task snapshot; every mutation increments `revision`.
 * @typedef {object} TeamTask
 * @property {import('./types.js').TeamTaskId} id
 * @property {number} revision
 * @property {string} subject
 * @property {string} description
 * @property {TeamTaskStatus} status
 * @property {readonly import('./types.js').TeamTaskId[]} blockedBy
 * @property {readonly string[]} writeScopes Advisory overlapping-write hints.
 * @property {import('@freddie/freddie-session').SessionId} [ownerId]
 */

/**
 * Runtime-enriched task view returned to tools and hosts.
 * @typedef {object} TeamTaskView
 * @property {import('./types.js').TeamTaskId} id
 * @property {number} revision
 * @property {string} subject
 * @property {string} description
 * @property {TeamTaskStatus} status
 * @property {readonly import('./types.js').TeamTaskId[]} blockedBy
 * @property {readonly string[]} writeScopes
 * @property {string} [ownerName]
 * @property {boolean} ready Whether every blocker has completed.
 * @property {readonly string[]} writeScopeWarnings
 */

/**
 * One peer message retained until its target Session records it.
 * @typedef {object} TeamMessageRecord
 * @property {import('./types.js').TeamMessageId} id
 * @property {import('@freddie/freddie-session').SessionId} senderId
 * @property {string} senderName
 * @property {import('@freddie/freddie-session').SessionId} targetId
 * @property {'quiet' | 'wakeup'} delivery
 * @property {unknown} content Sender-framed message content.
 */

/**
 * Source retained by the target Session for durable mailbox de-duplication.
 * @typedef {object} TeamMessageSource
 * @property {'team-message'} kind
 * @property {import('@freddie/freddie-session').SessionId} teamId
 * @property {import('./types.js').TeamMessageId} messageId
 */

/**
 * Team-service deployment limits.
 * @typedef {object} TeamServiceLimits
 * @property {number} maxMembers
 * @property {number} maxTasks
 * @property {number} maxPendingMessagesPerMember
 * @property {number} maxMessageBytes
 * @property {number} disposalTimeoutMs
 */

/**
 * Input for creating one durable teammate.
 * @typedef {object} SpawnTeammateRequest
 * @property {string} name
 * @property {string} description
 * @property {unknown} prompt Initial continuable-child prompt.
 * @property {unknown} context Provider-defined context mode.
 * @property {string} provider
 * @property {AbortSignal} signal
 */

/**
 * Result after one teammate reaches a durable active or failed edge.
 * @typedef {object} SpawnTeammateResult
 * @property {RosterRow} member
 */

/**
 * Input for one durable peer message.
 * @typedef {object} SendTeamMessageRequest
 * @property {string} target Model-facing member name, or `lead`.
 * @property {unknown} content
 * @property {'quiet' | 'wakeup'} delivery
 * @property {AbortSignal} signal
 */

/**
 * Result after a peer message enters the durable mailbox.
 * @typedef {object} SendTeamMessageResult
 * @property {import('./types.js').TeamMessageId} messageId
 * @property {'accepted' | 'queued'} status `queued` defers delivery; it is not an instruction to resend.
 */

/**
 * Input for creating one shared task.
 * @typedef {object} CreateTeamTaskRequest
 * @property {string} subject
 * @property {string} description
 * @property {readonly import('./types.js').TeamTaskId[]} [blockedBy]
 * @property {readonly string[]} [writeScopes]
 */

/**
 * Supported task mutation actions.
 * @typedef {'claim' | 'release' | 'edit' | 'set_dependencies' | 'complete' | 'reopen' | 'reassign' | 'delete'} TeamTaskAction
 */

/**
 * Compare-and-set mutation of one shared task.
 * @typedef {object} UpdateTeamTaskRequest
 * @property {import('./types.js').TeamTaskId} taskId
 * @property {number} expectedRevision
 * @property {TeamTaskAction} action
 * @property {string} [subject] `edit` only.
 * @property {string} [description] `edit` only.
 * @property {readonly string[]} [writeScopes] `edit` only.
 * @property {readonly import('./types.js').TeamTaskId[]} [blockedBy] `set_dependencies` only.
 * @property {string} [owner] `reassign` only; a blank or absent value releases ownership.
 */

/**
 * Result of waiting for Team activity.
 * @typedef {object} TeamActivityWaitResult
 * @property {boolean} timedOut
 */
