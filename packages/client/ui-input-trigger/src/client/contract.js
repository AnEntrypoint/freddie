/**
 * Frozen service contract of the slash pipeline. Types only. The
 * InputTriggerService implementation publishes this face as `ctx.inputTriggers`; sources
 * see registerSource alone, the conversation wiring layer resolves its
 * per-session controller through sessionOf.
 */

/**
 * The `ctx.inputTriggers` face: sources call
 * {@link import('./service.js').InputTriggerService#registerSource} alone;
 * the conversation wiring layer additionally resolves the per-session
 * controller through
 * {@link import('./service.js').InputTriggerService#sessionOf}.
 * @typedef {import('./service.js').InputTriggerService} InputTriggerServiceContract
 */
