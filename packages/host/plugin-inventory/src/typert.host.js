import { TYPERT_REMOTE } from './typert.remote-client.js'

export const TYPERT = {
  package: '@freddie/freddie-host-plugin-inventory',
  face: 'host',
  schemas: [
  ],
  invocations: TYPERT_REMOTE.descriptors,

  model: {
    "services": [],
    "events": [],
    "objects": []
  },
}
