import { HarnessError } from '@freddie/freddie-llm'

export class SubagentError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'SubagentError'
  }
}
