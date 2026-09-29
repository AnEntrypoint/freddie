/**
 * Frozen pure-core contract: trigger detection and
 * menu reduction, zero React / DOM / cordis. Types only — implementations
 * live in sibling modules annotated with these
 * aliases; the service shell wires them to ctx.
 */

/**
 * Availability tier derived from the input phase (`./detect.js`): 'plain'
 * leaves both trigger chars live, 'claimed' suppresses '/' only, 'frozen'
 * suppresses both.
 * @typedef {object} TriggerGuard
 * @property {'plain'|'claimed'|'frozen'} tier
 */

/**
 * A detected trigger token at the caret (`./detect.js`'s `detectTrigger` return shape).
 * @typedef {object} TriggerHit
 * @property {'@'|'/'} trigger
 * @property {string} query
 * @property {boolean} quoted
 * @property {'leading'|'inline'} position
 * @property {{start: number, end: number, draftRev: number}} span
 */

/**
 * Pure trigger-detection function shape implemented by `./detect.js`'s `detectTrigger`.
 * @callback DetectTrigger
 * @param {string} draft - full draft text.
 * @param {number} caret - caret offset into `draft`.
 * @param {TriggerGuard} guard - availability tier derived from the input phase.
 * @returns {TriggerHit|null}
 */

/**
 * One source's candidate group inside the menu (`./menu.js`).
 * @typedef {object} MenuGroup
 * @property {string} source
 * @property {boolean} [showGroupTitle]
 * @property {'pending'|'ready'} status
 * @property {object[]} items
 */

/**
 * Pure menu reducer state (`./menu.js`'s `MENU_CLOSED` initializer shape).
 * @typedef {object} MenuState
 * @property {boolean} open
 * @property {TriggerHit|null} hit
 * @property {number} generation
 * @property {MenuGroup[]} groups
 * @property {{source: string, index: number}|null} highlight
 */

/**
 * Discriminated events the pure menu reducer accepts (`./menu.js`'s `menuReduce` switch).
 * @typedef {(
 *   {type: 'hit', hit: TriggerHit|null} |
 *   {type: 'source-settled', generation: number, source: string, items?: object[]} |
 *   {type: 'source-failed', generation: number, source: string} |
 *   {type: 'move', dir: 1|-1} |
 *   {type: 'close'}
 * )} MenuEvent
 */

/**
 * Pure menu-reduction function shape implemented by `./menu.js`'s `menuReduce`.
 * @callback MenuReduce
 * @param {MenuState} state
 * @param {MenuEvent} ev
 * @returns {MenuState}
 */
