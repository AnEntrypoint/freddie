/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @freddie/freddie-subagent
 */

import { HarnessError } from '@freddie/freddie-llm'

/** Typed failure for the subagent seam. */
export class SubagentError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'SubagentError'
  }
}
