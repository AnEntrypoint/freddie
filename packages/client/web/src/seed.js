import * as Webjsx from 'webjsx'
import * as Cordis from '@freddie/cordis'
import * as UiSlots from '@freddie/freddie-client-ui-slots'
import * as UiPrimitives from '@freddie/freddie-client-ui-primitives'

export function getStaticModules() {
  return {
    'webjsx': Webjsx,
    '@freddie/cordis': Cordis,
    '@freddie/freddie-client-ui-slots': UiSlots,
    '@freddie/freddie-client-ui-primitives': UiPrimitives,
  }
}
