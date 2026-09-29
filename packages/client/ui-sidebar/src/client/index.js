/** Registers the sidebar shell into the layout-owned slot. */
import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './SidebarRoot.js'
import { en } from './locales.js'

/** Dictionary namespace owned by this plugin (shell controls copy). */
const NS = 'sidebar'

/** Services required by the sidebar plugin. */
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'locale']

/** Registers the sidebar shell and its service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-sidebar: dictionaries')

  const injectProps = () => ({
    startSession: (workspaceId) => { ctx.workspaces.startSession(workspaceId) },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
  })
  ctx.effect(
    () => ctx.slots.register({
      name: 'sidebar',
      locale: NS,
      children: {
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      },
      inject: injectProps,
    }, webjsxSlot('freddie-sidebar-root')),
    'ui-sidebar: slot registration',
  )
}
