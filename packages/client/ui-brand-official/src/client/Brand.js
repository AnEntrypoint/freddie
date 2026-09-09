import { BrandWordmark, FishLogo } from '@freddie/freddie-client-ui-primitives'
import { createElement as h } from 'webjsx'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size, className }) {
  return h(FishLogo, { size, className })
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return h(BrandWordmark, { includeMark: false })
}
