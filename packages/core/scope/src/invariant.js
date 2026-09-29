import { carrierKeyOf, isScopeCarrier } from '@freddie/freddie-scope'
import { scopedSubjectResolverFor } from './scoped-events.generated.js'

const PACKAGE_NAME = '@freddie/freddie-scope'

export const name = 'scope-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('internal/dispatch', (_mode, eventName, args, thisArg) => {
    const subjectOf = scopedSubjectResolverFor(eventName)
    if (subjectOf === undefined) return
    if (!isScopeCarrier(thisArg)) {
      fail(
        `"${eventName}" is a scope-filtered event but was dispatched without a scope carrier — `
        + 'pass scopeTarget(base, subject) as the dispatch thisArg (agent events: use agentEvents(ctx, agent))',
      )
    }
    if (subjectOf !== null && carrierKeyOf(thisArg) !== subjectOf(args)) {
      fail(
        `"${eventName}" was dispatched with a scope carrier keyed to a DIFFERENT subject than its arguments name — `
        + 'the carrier key and the event\'s subject must be the same object (use agentEvents(ctx, agent))',
      )
    }
  }, { global: true })
}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
