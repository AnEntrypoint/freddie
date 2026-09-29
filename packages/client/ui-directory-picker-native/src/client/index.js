import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './flow.js'

export const inject = ['slots', 'workspaces']

export function apply(ctx) {
  const injected = () => ({ pick: () => ctx.workspaces.pickDirectory() })
  ctx.slots.inject('conversation.hero.workspace.directoryFlow', () =>
    ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
      yield ctx.slots.register({
        name: 'conversation.hero.workspace.directoryFlow', inject: injected,
      }, webjsxSlot('freddie-native-directory-flow'))
      yield ctx.slots.register({
        name: 'sidebar.workspaces.directoryFlow', inject: injected,
      }, webjsxSlot('freddie-native-directory-flow'))
    }))
}
