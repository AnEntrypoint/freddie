import { CardForm, numberField } from './card-form.js'

export const AGENT_LOOP_NS = 'agent-loop'

export class AgentLoopCardController {
  form
  store

  constructor(scope) {
    this.form = new CardForm(scope, [numberField('maxParallelToolCalls')])
    this.store = this.form.bind(() => this.projection())
  }

  projection() {
    return { ...this.form.shell(), maxParallelToolCalls: this.form.field('maxParallelToolCalls') }
  }

  inject() {
    return { hooks: { agentLoopCard: this.store }, ...this.form.actions() }
  }
}
