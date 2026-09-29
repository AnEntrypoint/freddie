
import { Service } from '@freddie/cordis'

export { CompactionId } from './brand.js'
export { toolPairingBalancedAfter, toolPairingBalancedBefore } from './tool-pairing.js'
export { compactCheckpointSource, isCompactCheckpointSource } from './checkpoint.js'

export class ManualCompactionError extends Error {
  name = 'ManualCompactionError'

  constructor(
    code,
    message,
    options,
  ) {
    super(message, options)
    this.code = code
  }
}

export class CompactionEngine extends Service {
  constructor(ctx) {
    super(ctx, 'compaction')
  }

  compactIfNeeded(
    agent,
    trigger,
    signal,
  ) {
    throw new Error('not implemented')
  }

  compactNow(
    agent,
    signal,
    sourceCommandId,
  ) {
    throw new Error('not implemented')
  }

  compactRegion(
    start,
    end,
    agent,
    signal,
  ) {
    throw new Error('not implemented')
  }
}

export default CompactionEngine
