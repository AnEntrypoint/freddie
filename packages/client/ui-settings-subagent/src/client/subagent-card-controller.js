import { limitField, StagedForm } from './card-form.js'

export const SUBAGENT_NS = 'subagent'

const MIN_DEPTH = 0

const MIN_ACTIVE = 1

export class SubagentCardController {
  constructor(scope) {
    this.form = new StagedForm(scope, [
      limitField('maxDepth', MIN_DEPTH),
      limitField('maxActiveSubagents', MIN_ACTIVE),
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
