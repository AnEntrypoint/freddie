import { BrandWordmark, FishLogo } from '@freddie/freddie-client-ui-primitives'
import { createElement as h } from '@freddie/webjsx'

export function OfficialBrandMark({ size, className }) {
  return h(FishLogo, { size, className })
}

export function OfficialBrandName() {
  return h(BrandWordmark, { includeMark: false })
}
