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

/** Durable teammate lifecycle. */

/** Whole durable value written on every teammate lifecycle change. */

/** Current runtime-enriched roster row. */

/** Durable task lifecycle. */

/** Whole durable task snapshot; every mutation increments {@link revision}. */

/** Runtime-enriched task view returned to tools and hosts. */

/** One peer message retained until its target Session records it. */

/** Source retained by the target Session for durable mailbox de-duplication. */

/** Team-service deployment limits. */

/** Input for creating one durable teammate. */

/** Result after one teammate reaches a durable active or failed edge. */

/** Input for one durable peer message. */

/** Result after a peer message enters the durable mailbox. */

/** Input for creating one shared task. */

/** Supported task mutation actions. */

/** Compare-and-set mutation of one shared task. */

/** Result of waiting for Team activity. */
