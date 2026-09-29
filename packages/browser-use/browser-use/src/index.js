
import { Service } from '@freddie/cordis'

export class BrowserUseRegistry extends Service {
  registration

  constructor(ctx) {
    super(ctx, 'browserUse')
  }

  get providerName() {
    return this.registration
  }

  register(name) {
    if (this.registration !== undefined) {
      throw new Error(`browser use provider "${this.registration}" is already registered`)
    }
    return this.ctx.effect(() => {
      this.registration = name
      return () => {
        this.registration = undefined
      }
    }, 'browserUse.register()')
  }
}

export default BrowserUseRegistry
