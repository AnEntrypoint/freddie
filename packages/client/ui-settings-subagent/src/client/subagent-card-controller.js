import { CardForm, integerField } from '@freddie/freddie-client-ui-settings-plugins/client'

export const SUBAGENT_NS = 'subagent'

const MIN_DEPTH = 0

const MIN_ACTIVE = 1

export class SubagentCardController {
  constructor(scope) {
    this.form = new CardForm(scope, [
      integerField('maxDepth', MIN_DEPTH),
      integerField('maxActiveSubagents', MIN_ACTIVE),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  projection() {
    return {
      ...this.form.shell(),
      maxDepth: this.form.field('maxDepth'),
      maxActiveSubagents: this.form.field('maxActiveSubagents'),
    }
  }

  inject() {
    return { hooks: { subagentCard: this.store }, ...this.form.actions() }
  }
}
