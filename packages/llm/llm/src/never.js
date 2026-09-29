/**
 * Exhaustiveness helper for closed core unions. Use {@link import('@freddie/freddie-values').assertNever} at the default branch so a
 * new variant fails compilation at every required handler. Do not use it for declaration-merged
 * unions such as session events or content blocks: handle known variants and explicitly fall
 * through because plugins may add valid unknown cases.
 * @module @freddie/freddie-llm/never
 */

export { assertNever } from '@freddie/freddie-values'
