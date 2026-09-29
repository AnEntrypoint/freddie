import { CardForm, numberField } from './card-form.js'

export const SHELL_NS = 'shell'

export class BashCardController {
  form
  store

  constructor(scope) {
    this.form = new CardForm(scope, [numberField('timeoutMs'), numberField('maxOutputBytes')])
    this.store = this.form.bind(() => this.projection())
  }

  projection() {
    return {
      ...this.form.shell(),
      timeoutMs: this.form.field('timeoutMs'),
      maxOutputBytes: this.form.field('maxOutputBytes'),
    }
  }

  inject() {
    return { hooks: { bashCard: this.store }, ...this.form.actions() }
  }
}
