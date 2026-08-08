// In-memory task registry shared by tools/task plugins and bash background mode.
// Browser-compatible: no fs, no node builtins beyond what ESM provides.
// Keyed by task_id; each task is a plain object with {id, status, output, stderr, ...}.
// Persisted to JSONL via store.js when filesystem is available.
//
// Thin entrypoint preserving the original module surface. Shared mutable state
// (the _tasks Map, the reconciliation interval handle) lives in state.js;
// implementation split across crud.js (create/get/list/update/awaitTask) and
// lifecycle.js (restore/reconcile/cleanup/reset/clean + periodic reconciliation).
export { createTask, getTask, listTasks, listAllTasks, updateTask, stopTask, getTaskOutput, awaitTask } from './crud.js'
export { restoreTasks, reconcileTasks, cleanupStaleTasks, startPeriodicReconciliation, stopPeriodicReconciliation, reset, cleanCompleted } from './lifecycle.js'
