/**
 * Opaque webhook identities shared by adapters, rules, and Session message sources.
 * @typedef {string} WebhookRuleId Identifies one programmatic webhook rule.
 * @typedef {string} WebhookSourceId Identifies one configured webhook adapter instance.
 * @typedef {string} WebhookDeliveryId Identifies one provider delivery. The runtime assigns no deduplication semantics.
 */

/**
 * Brand a webhook rule id.
 * @param {string} value - non-empty rule identifier validated at registration.
 * @returns {WebhookRuleId} the same string, branded (a compile-time cast — no runtime cost).
 */
export function WebhookRuleId(value) {
  return value
}

/**
 * Brand a configured webhook source id.
 * @param {string} value - non-empty adapter instance identifier validated by its adapter.
 * @returns {WebhookSourceId} the same string, branded.
 */
export function WebhookSourceId(value) {
  return value
}

/**
 * Brand a provider delivery id.
 * @param {string} value - non-empty provider identity validated by its adapter.
 * @returns {WebhookDeliveryId} the same string, branded.
 */
export function WebhookDeliveryId(value) {
  return value
}
