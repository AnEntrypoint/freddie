import { Service } from '@freddie/cordis'

export class SessionTelemetryBackend extends Service {
  constructor(ctx) {
    super(ctx, 'sessionTelemetry')
  }
}

export { SessionTelemetryCoordinator } from './coordinator.js'
