import { applyDocumentTitle } from './DocumentTitle.js'

function selectedTitle(state) {
  const id = state.current
  return id === undefined ? undefined : state.byId[id]?.title
}

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
