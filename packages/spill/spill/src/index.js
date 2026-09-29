import { Service } from '@freddie/cordis'

export { SpillLocator } from './types.js'

export class SpillStore extends Service {
  constructor(ctx) {
    super(ctx, 'spillStore')
  }
}

export default SpillStore
