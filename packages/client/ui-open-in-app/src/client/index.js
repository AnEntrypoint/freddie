import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './OpenInAppAction.js'
import { OpenInAppController } from './controller.js'
import { en, NS } from './locales.js'

export const inject = ['slots', 'locale']

export function apply(ctx) {
  const controller = new OpenInAppController()
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-open-in-app: dictionaries')
  ctx.slots.inject(
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'open-in-app',
      order: -10,
      locale: NS,
      inject: () => ({
        knownApps: () => controller.known(),
        loadApps: () => controller.load(),
        choice: () => controller.choice(),
        remember: appId => { controller.remember(appId) },
        launch: (appId, path) => controller.launch(appId, path),
        iconUrl: appId => controller.iconUrl(appId),
      }),
    }, webjsxSlot('freddie-open-in-app-action')),
  )
}
