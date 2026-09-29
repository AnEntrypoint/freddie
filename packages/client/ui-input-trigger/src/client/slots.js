/**
 * Overlay-slot contract surface of the slash plugin. The
 * 'conversation.input.overlay' slot is OWNED by the ui-conversation composer
 * entry (declaring is claiming: anchor, children declaration, lifecycle),
 * but the SlotMap type merge lives here: the owner package depends on this
 * one, so the dependency direction admits no reverse type import, and a
 * type-erased registration is ruled out. The owner's
 * program picks this merge up transitively through its ui-input-trigger imports.
 */

/**
 * Per-session props the 'conversation.input.overlay' occupant (MenuView, see
 * `./MenuView.js`) receives — matching the registration's `inject()` return
 * in `./index.js`.
 * @typedef {object} InputTriggerOverlaySlotProps
 * @property {{getSnapshot: function(): import('../core/contract.js').MenuState, subscribe: function(function(): void): function(): void}} menu - the resolved controller's menu store.
 * @property {function(string, number): void} onPick - route a clicked candidate back to the controller.
 * @property {function(): void} onDismiss - close the menu (e.g. outside pointer).
 */
