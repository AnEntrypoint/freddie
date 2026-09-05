import base from '../styles/base.css.js'
import designPlatform from '../styles/design-platform.css.js'
import scrollbar from '../styles/scrollbar.css.js'
import gradientShadowText from '../styles/gradient-shadow-text.css.js'
import shiki from '../styles/shiki.css.js'

const PLUGIN_ID = '@freddie/freddie-client-ui-theme'

const STYLES = [
  ['base.css', base],
  ['design-platform.css', designPlatform],
  ['scrollbar.css', scrollbar],
  ['gradient-shadow-text.css', gradientShadowText],
  ['shiki.css', shiki],
]

/**
 * Mount the global theme sheets for exactly the owning plugin lifetime.
 * @param ctx - Owning plugin context.
 */
export function installThemeStyles(ctx) {
  if (typeof document === 'undefined') return
  for (const [name, css] of STYLES) {
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.dataset.plugin = PLUGIN_ID
      tag.dataset.pluginCss = `${PLUGIN_ID}/${name}`
      tag.textContent = css
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }, `ui-theme: ${name} stylesheet`)
  }
}
