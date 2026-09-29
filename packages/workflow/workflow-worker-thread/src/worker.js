import { parentPort, workerData } from 'node:worker_threads'
import { requireParentPort, runWorkerSession } from './session.js'

void runWorkerSession(requireParentPort(parentPort), workerData)
