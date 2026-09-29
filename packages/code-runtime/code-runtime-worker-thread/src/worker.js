
import { parentPort, workerData } from 'node:worker_threads'
import { runWorkerMain } from './bootstrap.js'

if (!parentPort) throw new Error('freddie-code-runtime-worker-thread: worker entry loaded outside a worker thread')

void runWorkerMain(parentPort, workerData, { stdout: process.stdout, stderr: process.stderr })
