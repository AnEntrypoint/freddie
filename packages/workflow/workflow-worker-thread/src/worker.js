/**
 * Single-statement worker entry that boots `runWorkerSession` on real `parentPort`. Logic remains in
 * the session module for in-process MessageChannel coverage; importing this entry on the main thread
 * exercises `requireParentPort`'s failure path.
 * @module @freddie/freddie-workflow-worker-thread/worker
 */

import { parentPort, workerData } from 'node:worker_threads'
import { requireParentPort, runWorkerSession } from './session.js'

// workerData is untyped at the node:worker_threads boundary; the engine is the
// only spawner and always provides a WorkerInit shape.
void runWorkerSession(requireParentPort(parentPort), workerData)
