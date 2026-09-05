/**
 * Execution types for the bash executor seam. Background job semantics belong
 * to `@freddie/freddie-jobs`; this seam exposes only process handles. The
 * managed-environment and captured-output vocabulary is owned by the
 * subprocess seam and re-exported here so bash consumers keep one import
 * root.
 * @module freddie-shell/types
 */

export { FREDDIE_ENV_PREFIX } from '@freddie/freddie-subprocess'
