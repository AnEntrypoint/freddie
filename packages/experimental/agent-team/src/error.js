import { inspect } from 'node:util'
import { HarnessError } from '@freddie/freddie-llm'

export class TeamError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'TeamError'
  }
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return inspect(error, { breakLength: Infinity, compact: true, depth: 4 })
}
