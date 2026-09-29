import { WEB_SEARCH_NS, WebSearchCardController } from './web-search-card-controller.js'
import { WebSearchCard } from './WebSearchCard.js'
import { en } from './locales.js'

const NS = 'settings.webSearch'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

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
