import { HarnessError } from '@freddie/freddie-llm'

export const GOAL_CHANGE_VERSION = 1

export function GoalId(id) {
  return id
}

export class GoalError extends HarnessError {
  constructor(message, code) {
    super(message, code)
  }
}
