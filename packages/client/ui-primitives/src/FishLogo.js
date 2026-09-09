// Freddie mustache mark. Native 500x220 viewBox, rendered 24x10.56 by
// default (ratio-locked to the source artwork). Color rides currentColor
// so it stays legible in both light and dark themes.

import { createElement as h } from 'webjsx'

/**
 * Render the mustache logo.
 * @param props.size - width in px (default 24; height keeps the 500:220 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }) {
  return h(
    'svg',
    {
      width: String(size),
      height: String((size * 220) / 500),
      class: className ?? '',
      viewBox: '0 0 500 220',
      fill: 'none',
      'aria-hidden': 'true',
    },
    h('path', {
      d: 'M 250 80'
        + ' C 270 60, 300 48, 335 52'
        + ' C 370 56, 405 80, 425 115'
        + ' C 438 138, 432 168, 412 182'
        + ' C 395 194, 382 178, 376 162'
        + ' C 368 142, 350 126, 310 120'
        + ' C 280 115, 262 118, 250 122'
        + ' C 238 118, 220 115, 190 120'
        + ' C 150 126, 132 142, 124 162'
        + ' C 118 178, 105 194, 88 182'
        + ' C 68 168, 62 138, 75 115'
        + ' C 95 80, 130 56, 165 52'
        + ' C 200 48, 230 60, 250 80 Z',
      fill: 'currentColor',
    }),
  )
}
