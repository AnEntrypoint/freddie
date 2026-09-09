/**
 * Browser-safe subagent domain contract. Persisted transcript reads never
 * activate an Agent, while continuable prompts route through the exact live
 * direct parent into the child's Agent inbox.
 *
 * This file is pure types in TS and carries no runtime code.
 */
