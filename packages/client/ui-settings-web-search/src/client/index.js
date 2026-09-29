/**
 * Web-search settings surface, browser half — one card over the
 * `web-search-deepseek` namespace, dispatched by the Plugins page's
 * configurable tab.
 *
 * The section is not this package's to declare: the search provider that owns
 * the configuration registers it, so a deployment that composes no such
 * provider serves no section and this card renders nothing.
 */

import { WEB_SEARCH_NS, WebSearchCardController } from './web-search-card-controller.js'
import { WebSearchCard } from './WebSearchCard.js'
import { en } from './locales.js'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.webSearch'

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings-plugins' apply, whose activation order relative to this one is
 * NOT constrained; registration depends on the slot through `slots.inject()`.
 * `connection` carries the credentials workface, `remote` the pushed
 * invalidations that re-read the key's state.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Register the web-search card under the namespace it edits.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-settings-web-search: copy dictionaries')

  const card = new WebSearchCardController(
    ctx.settingsScope.bind({ namespace: WEB_SEARCH_NS }),
    ctx.get('connection').api,
  )

  const rereadKeyStateOnInvalidation = () => {
    const disposers = [
      ctx.remote.$on('credentials/reference-updated', (ref) => { void card.refreshCredential(ref) }),
      ctx.remote.$on('settings/document-updated', () => { void card.refreshCredential() }),
      ctx.on('connection/reset', () => { void card.refreshCredential() }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }
  ctx.effect(rereadKeyStateOnInvalidation, 'ui-settings-web-search: pushed invalidations')

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: WEB_SEARCH_NS,
    locale: NS,
    inject: () => card.inject(),
  }, WebSearchCard))
}
