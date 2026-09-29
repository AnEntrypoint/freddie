/**
 * Frozen cross-package contract for the input trigger pipeline. Types only —
 * no runtime code. Sources (ui-commands / ui-skill / ui-reference) and the
 * conversation input layer import from here; changes require main-thread
 * arbitration.
 *
 * Providers receive a {@link ClientSessionContext} projection per call —
 * never a Cordis context or the mutable Session. RPC and service access go
 * through the provider plugin's own root context captured at registration.
 */

/**
 * Per-call session projection a registered source's callbacks receive
 * (`InputTriggerController#project` in `./client/controller.js`): agent-backed
 * session identity, constant for the controller's lifetime.
 * @typedef {object} ClientSessionContext
 * @property {string} sessionId
 */
