/** The subagent card's staged form over the `subagent` settings namespace. */

import { limitField, StagedForm } from './card-form.js'

/**
 * Namespace of the delegation limits. Spelled here rather than imported: a
 * client half must not depend on the Host half, and the Plugins page dispatches
 * this card by exactly this string.
 */
export const SUBAGENT_NS = 'subagent'

/** Smallest depth the field accepts; zero forbids delegation. */
const MIN_DEPTH = 0

/** Smallest capacity the field accepts; a cap below one would forbid delegation. */
const MIN_ACTIVE = 1

/** Bridges the `subagent` scope onto the card's staged form. */
export class SubagentCardController {
  /**
   * @param scope - the bound settings scope for the `subagent` namespace.
   */
  constructor(scope) {
    this.form = new StagedForm(scope, [
      limitField('maxDepth', MIN_DEPTH),
      limitField('maxActiveSubagents', MIN_ACTIVE),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  /** @returns the card's snapshot: shared form state plus one entry per control. */
  projection() {
    return {
      ...this.form.shell(),
      maxDepth: this.form.field('maxDepth'),
      maxActiveSubagents: this.form.field('maxActiveSubagents'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject() {
    return { hooks: { subagentCard: this.store }, ...this.form.actions() }
  }
}
