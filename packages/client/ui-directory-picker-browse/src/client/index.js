import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './flow.js'

const LOCALE_NS = 'directory-browser'

export const inject = ['slots', 'workspaces', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, 'en', {
    'browser.title': 'Select Workspace Directory',
    'browser.home': 'Home',
    'browser.newFolder': 'New folder',
    'browser.folderName': 'Folder name',
    'browser.createIn': 'New folder in "{name}"',
    'browser.untitledFolder': 'Untitled folder',
    'browser.create': 'Create',
    'browser.cancel': 'Cancel',
    'browser.open': 'Open',
    'browser.editPath': 'Edit path',
    'browser.loading': 'Loading…',
    'browser.truncated': 'Too many folders to list; only the beginning is shown.',
    'browser.showHidden': 'Show hidden files',
  }), 'directory-picker-browse: dialog dictionaries')

  const injected = () => ({
    listDirectory: (path, signal) => ctx.workspaces.listDirectory(path, signal),
    createDirectory: (path, name) => ctx.workspaces.createDirectory(path, name),
    t: ctx.locale.bind(LOCALE_NS),
  })
  ctx.slots.inject('conversation.hero.workspace.directoryFlow', () =>
    ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
      yield ctx.slots.register({
        name: 'conversation.hero.workspace.directoryFlow', inject: injected,
      }, webjsxSlot('freddie-browse-directory-flow'))
      yield ctx.slots.register({
        name: 'sidebar.workspaces.directoryFlow', inject: injected,
      }, webjsxSlot('freddie-browse-directory-flow'))
    }))
}
