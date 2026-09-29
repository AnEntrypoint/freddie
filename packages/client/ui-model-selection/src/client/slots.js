/**
 * ModelSelect's injected face. The target 'conversation.input.model' seat is
 * declared (children table) and typed by ui-conversation's composer-bar
 * entry; this package only contributes the single occupant, so no SlotMap
 * merge lives here.
 */

/**
 * Per-session props the 'conversation.input.model' occupant (ModelSelect, see
 * `./ModelSelect.js`) receives from this package's own `inject()` in
 * `./index.js` — `locked` itself is the owner share ui-conversation's seat
 * declaration supplies, not part of this face.
 * @typedef {object} ModelSelectInjectedProps
 * @property {boolean} available - false for addressed subagent sessions, which hide the seat.
 * @property {{getSnapshot: function(): object, subscribe: function(function(): void): function(): void}} directory - the session's ModelDirectory store.
 * @property {function(): void} load - (re)load the directory; no-op when unavailable.
 * @property {function(object): Promise<boolean>} select - submit a selection; resolves false on rejection.
 */
