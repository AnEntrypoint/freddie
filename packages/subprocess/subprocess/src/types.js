/**
 * Vocabulary for the subprocess Service Definition: fully-specified spawn requests with
 * Node-shaped per-stream stdio modes, bounded collected output with spill
 * recovery, raw piped streams, and tree-scoped termination. Command
 * defaulting, shell semantics, protocol framing, and presentation belong to
 * consumers such as the bash executor seam.
 * @module freddie-subprocess/types
 */

/** Namespace prefix reserved for Freddie-managed child environment facts. */
export const FREDDIE_ENV_PREFIX = 'FREDDIE_'
