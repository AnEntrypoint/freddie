/**
 * Real-UI assembly closure. The whole layout tree hangs from the built-in
 * `root` slot, which is the only ctx-level slot render in the application.
 *
 * Converted from React: the former `SessionDocumentTitle` function component
 * (a `useSessions` selector hook driving a `<DocumentTitle>` effect) becomes
 * an explicit `sessions.list.subscribe` call that applies the title directly
 * (index.ts's mount call binds this subscription's lifetime to the app root's
 * own mount/unmount, since there is no component tree to own it here).
 */
import { applyDocumentTitle } from './DocumentTitle.js'

/** Read the currently-selected session's title off a sessions-list snapshot. */
function selectedTitle(state) {
  const id = state.current
  return id === undefined ? undefined : state.byId[id]?.title
}

/**
 * Build the assembled application: a render factory producing the root
 * slot's VNode tree, plus a disposer that unsubscribes the document-title
 * projection (index.ts calls the disposer alongside unmounting the tree).
 * @param deps - Active UI-renderer dependencies.
 * @returns render factory and disposer.
 */
export function buildRenderApp(deps) {
  const { ctx } = deps
  const sessions = ctx.get('sessions')
  if (sessions === undefined) throw new Error('ui renderer: sessions service unavailable')
  const list = sessions.list
  applyDocumentTitle(selectedTitle(list.getSnapshot()))
  const unsubscribe = list.subscribe(() => {
    applyDocumentTitle(selectedTitle(list.getSnapshot()))
  })
  return {
    render: () => ctx.slots.renderSlot('root', {}),
    dispose: unsubscribe,
  }
}
