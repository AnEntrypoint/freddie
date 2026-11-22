import { TYPERT_REMOTE } from './typert.remote-client.js'

import { process } from '@freddie/freddie-runtime/process'

export const TYPERT = {
  package: '@freddie/freddie-goal',
  face: 'host',
  schemas: [
  ],
  invocations: TYPERT_REMOTE.descriptors,

}
