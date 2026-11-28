import '@freddie/freddie-runtime/install-fx'
import { parentPort, workerData } from '@freddie/freddie-runtime/worker-threads'
import { requireParentPort, runWorkerSession } from './session.js'

void runWorkerSession(requireParentPort(parentPort), workerData)
