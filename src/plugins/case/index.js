// freddie "case" plugin -- registers the case/enquiry toolset into the host so any
// runTurn can use it. Agentic code per the layering mandate; the data store and the
// field/enum/role config are injected by the host application (via toolCtx on each
// turn and plugins.case config), so this plugin is application-agnostic.
//
// The store is resolved PER TURN from toolCtx (ctx.store), never a global, so the
// agent answers for the asking worker. A configured fallback store
// (plugins.case.resolveStore, a function) is used only when a turn carries none
// (e.g. tests). Config is read via ctx.config (scopedCfg 'case').

import { buildCaseToolset } from './toolset.js'

export default {
  name: 'case',
  surfaces: 'pi',
  register({ pi, config }) {
    const resolveStore = config?.get('resolveStore', null)
    const slimCase = config?.get('slimCase', (c) => c)
    const slimEvent = config?.get('slimEvent', (e) => e)
    const tools = buildCaseToolset({
      resolveStore: typeof resolveStore === 'function' ? resolveStore : null,
      config,
      slimCase: typeof slimCase === 'function' ? slimCase : (c) => c,
      slimEvent: typeof slimEvent === 'function' ? slimEvent : (e) => e,
    })
    for (const tool of tools) pi.tools.register(tool)
  },
}
