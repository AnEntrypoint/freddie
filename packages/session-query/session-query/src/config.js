import { HarnessError } from '@freddie/freddie-llm'

export const SESSION_QUERY_READ_WINDOW_MAX = 50

export const SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY = 4

export class SessionQueryError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
  }
}
