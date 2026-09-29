/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * four child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout is the cross-plugin panel-action contract; navigation state lives
 * with the runtime sessions service. A second effect seats the theme
 * presenter, which projects ctx.theme snapshots onto document.body.
 */
import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './AppFrame.js'
import { createLayoutStore } from './stores.js'
import { LayoutController } from './service.js'
import { ThemePresenter } from './theme-presenter.js'

export { LayoutController } from './service.js'

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['connection', 'slots', 'theme']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the four child-slot declarations, the layout store seat,
 * and the inject hook that hands the store's bound actions to the service.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  const layout = new LayoutController()
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      store: createLayoutStore,
      inject: (actions) => {
        layout.attachPanels(actions)
        return { hooks: { connectionState: ctx.connection.state } }
      },
      // oxlint-disable-next-line typescript/no-explicit-any -- webjsxSlot() is a bare (props) => null stub that cannot prove the RendersCheck shape; dispatch happens inside the registered element
    }, webjsxSlot('freddie-app-frame'))
    return () => {
      disposeRegistration()
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-layout: theme presenter')
}
