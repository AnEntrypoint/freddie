import '@freddie/freddie-runtime/install-fx'

import { parentPort, workerData } from '@freddie/freddie-runtime/worker-threads'
import { runWorkerMain } from './bootstrap.js'
import { process } from '@freddie/freddie-runtime/process'

if (!parentPort) throw new Error('freddie-code-runtime-worker-thread: worker entry loaded outside a worker thread')

void runWorkerMain(parentPort, workerData, { stdout: process.stdout, stderr: process.stderr })
