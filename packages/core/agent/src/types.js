/**
 * Durable agent session-event vocabulary shared with type-only consumers.
 *
 * This module is intentionally empty at runtime: it previously carried only
 * TypeScript-only constructs (a type alias and a `declare module`
 * augmentation of `SessionEventMap`), which have no JavaScript
 * representation. The `InboxTarget` type and the `agent/inbox/spliced`
 * event-shape documentation live on now only in the .ts history and in
 * runtime validation elsewhere (see inbox.js).
 *
 * @module @freddie/freddie-agent/types
 */
export {}
