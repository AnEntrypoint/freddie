/**
 * Platform-singleton module-table. These are the ONLY entities the shell
 * shares into the frozen module table — fetch bundles resolve their externals
 * against exactly this set through the loader's require. Keys come from the
 * platform constant module ({@link ./platform.js}, the single source
 * of truth with the tsdown client externals); values stay shell-static
 * imports so every bundle sees the same instance.
 */
import * as Webjsx from 'webjsx'
import * as Cordis from '@freddie/cordis'
import * as UiSlots from '@freddie/freddie-client-ui-slots'
import * as UiPrimitives from '@freddie/freddie-client-ui-primitives'

/**
 * Build the static table handed to the module loader at boot.
 * @returns module specifier → exported entity (one entry per platform word).
 */
export function getStaticModules() {
  return {
    'webjsx': Webjsx,
    '@freddie/cordis': Cordis,
    '@freddie/freddie-client-ui-slots': UiSlots,
    '@freddie/freddie-client-ui-primitives': UiPrimitives,
  }
}
