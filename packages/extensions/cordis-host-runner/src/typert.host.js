import { TYPERT_REMOTE } from './typert.remote-client.js'

import { process } from '@freddie/freddie-runtime/process'

export const TYPERT = {
  package: '@freddie/freddie-cordis-host-runner',
  face: 'host',
  schemas: [
  ],
  invocations: TYPERT_REMOTE.descriptors,

}
