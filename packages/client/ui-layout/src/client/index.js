import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './AppFrame.js'
import { createLayoutStore } from './stores.js'
import { LayoutController } from './service.js'
import { ThemePresenter } from './theme-presenter.js'

export { LayoutController } from './service.js'

export const inject = ['connection', 'slots', 'theme']

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
