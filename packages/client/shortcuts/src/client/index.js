/**
 * Browser keyboard capability, browser half: the settings row that opens the
 * shortcut reference, the reference overlay itself, and the `shortcuts.open`
 * command that opens it from anywhere in the window.
 *
 * Both views read the same `ctx.shortcuts` state through props — the rows, the
 * accepted preferences, and the search text — so neither one owns a copy of the
 * registry.
 */

import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { ShortcutsService } from './service.js'
import { en } from './locales.js'
import './ShortcutReference.js'
import './ShortcutRow.js'

/** Dictionary namespace owned by this plugin. */
const NS = 'shortcuts'

/** Command opened by the row and by the global combination. */
const OPEN_COMMAND = 'shortcuts.open'

/** Regions where the open command answers: everywhere, text entry and the terminal included. */
const OPEN_COMMAND_REGIONS = ['page', 'editable', 'terminal']

/** Modals that own the open command: the settings row's modal and the reference itself. */
const OPEN_COMMAND_MODALS = ['settings', 'shortcuts']

/** Required services: the locale registry and the slot registry; the keyboard service is provided by this plugin itself. */
export const inject = ['locale', 'slots']

/**
 * Client plugin body: mount the keyboard service, expose it to both views, and
 * register the command that opens the reference.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'shortcuts: dictionaries')
  ctx.plugin(ShortcutsService)

  ctx.inject(['slots', 'shortcuts'], (scope) => {
    const registry = scope.shortcuts
    const t = ctx.locale.bind(NS)
    const shared = () => ({
      platform: registry.platform,
      hooks: {
        catalog: registry.catalog,
        config: registry.config,
        fixedCatalog: registry.fixedCatalog,
        reference: registry.reference,
      },
      onOpen: () => { registry.openReference() },
      onClose: () => { registry.closeReference() },
      onSearch: query => { registry.search(query) },
      onEdit: (edit, revision) => registry.edit(edit, revision),
      describeBinding: binding => registry.describeBinding(binding),
    })

    scope.slots.inject('settings.general.item', () => scope.slots.register({
      name: 'settings.general.item',
      id: 'shortcuts',
      order: 30,
      locale: NS,
      inject: () => shared(),
    }, webjsxSlot('freddie-shortcut-row')))

    scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay',
      id: 'shortcuts-reference',
      order: 10,
      locale: NS,
      inject: () => shared(),
    }, webjsxSlot('freddie-shortcut-reference')))

    scope.effect(() => registry.register({
      id: OPEN_COMMAND,
      label: () => t('command.open'),
      aliases: ['keyboard shortcuts', 'shortcut reference', 'keybindings'],
      defaults: {
        'web:macos': { code: 'Slash', modifiers: ['primary'] },
        'web:windows': { code: 'Slash', modifiers: ['primary'] },
        'web:linux': { code: 'Slash', modifiers: ['primary'] },
      },
      regions: OPEN_COMMAND_REGIONS,
      modals: OPEN_COMMAND_MODALS,
      resolve: () => ({ status: 'handled', run: () => { registry.openReference() } }),
    }), 'shortcuts: open command')
  })
}
