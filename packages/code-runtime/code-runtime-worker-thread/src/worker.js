/**
 * Spawn-only worker entrypoint over {@link runWorkerMain}. Executable logic stays in
 * `bootstrap.js` for in-process coverage; real-worker tests cover this glue.
 * @module @freddie/freddie-code-runtime-worker-thread/src/worker
 */

import { parentPort, workerData } from 'node:worker_threads'
import { runWorkerMain } from './bootstrap.js'

// A worker always has a parent port; guard loudly rather than run detached.
if (!parentPort) throw new Error('freddie-code-runtime-worker-thread: worker entry loaded outside a worker thread')

void runWorkerMain(parentPort, workerData, { stdout: process.stdout, stderr: process.stderr })
