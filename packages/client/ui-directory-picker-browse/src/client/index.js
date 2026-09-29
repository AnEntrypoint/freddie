/**
 * Browser half of the browse directory-picker backend: fills ui-workspace's
 * two directory-flow holes with the in-app Select Workspace Directory dialog
 * (figma `Harness` 813-23126 family), driving the node half's
 * `host.listDirectory`/`host.createDirectory` primitives. Mounting this
 * package therefore composes both sides of the browse interaction with one
 * cordis.yml row; no client code branches on a capability kind. The dialog's
 * copy is locale-registered here — the flow package owns its own strings.
 */
import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './flow.js'

/** Locale namespace owning the browser dialog's copy. */
const LOCALE_NS = 'directory-browser'

/** Required services (cordis fiber inject): the slot registry, the wire-facing workspace service, and locale. */
export const inject = ['slots', 'workspaces', 'locale']

/**
 * Client plugin body: register the dialog's dictionaries and the browse flow
 * into both directory-flow holes through `slots.inject()` because the
 * ui-workspace entries may activate later or replace their declarations.
 * @param ctx - client root context.
 */
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
