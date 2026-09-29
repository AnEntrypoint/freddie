import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { BlockAssembler, deepFreeze } from '@freddie/freddie-llm'
import { canonicalHeader, headerEquals, isSurfaceEvent } from '@freddie/freddie-session'
import { contextBreakdownProjectionDefinition } from './breakdown-projection.js'
import { contextPressureProjectionDefinition, tokenUsageProjectionDefinition } from './usage-projection.js'
import { estimateContent, estimateHeader, estimateMessage, ROLE_OVERHEAD } from './estimate.js'
import { foldSurfaceTokens } from './surface-fold.js'

function usageTokens(usage) {
  return usage.inputTokens
    + (usage.cacheReadTokens ?? 0)
    + (usage.cacheWriteTokens ?? 0)
    + usage.outputTokens
}

function optionalHeaderEquals(left, right) {
  if (left === undefined || right === undefined) return left === right
  return headerEquals(left, right)
}

function validateConfigKeys(config) {
  for (const key of Object.keys(config)) {
    throw new Error(`TokenMeterConfig: unknown key "${key}" (no settings are supported)`)
  }
}

export class TokenMeter extends Service {
  static Config = z.object({})

  states = new WeakMap()

  constructor(ctx, config = {}) {
    super(ctx, 'tokenMeter')
    validateConfigKeys(config)

    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register(tokenUsageProjectionDefinition)
      projectionCtx.sessionProjections.register(contextPressureProjectionDefinition)
      projectionCtx.sessionProjections.register(contextBreakdownProjectionDefinition)
    })

    ctx.on('session/event', (session) => {
      if (this.states.has(session)) this._sync(session)
    })
  }

  measure(session, requestHeader) {
    const state = this._sync(session)
    const header = requestHeader === undefined
      ? state.header
      : canonicalHeader(requestHeader)
    const anchor = state.anchor

    let baseline
    let surfaceDeltaTokens
    if (anchor !== undefined && optionalHeaderEquals(anchor.header, header)) {
      baseline = anchor.baseline
      surfaceDeltaTokens = state.surfaceTokens - anchor.surfaceTokens
    } else if (header === undefined && state.surfaceTokens === 0) {
      baseline = { kind: 'none', tokens: 0 }
      surfaceDeltaTokens = 0
    } else {
      baseline = {
        kind: 'estimated',
        tokens: estimateHeader(header) + state.surfaceTokens,
      }
      surfaceDeltaTokens = 0
    }

    return deepFreeze(structuredClone({
      logRevision: state.consumedEvents,
      baseline,
      surfaceDeltaTokens,
      totalTokens: Math.max(0, baseline.tokens + surfaceDeltaTokens),
      surfaceTokens: state.surfaceTokens,
      nodes: state.surface,
    }))
  }

  estimateMessage(message) {
    return estimateMessage(message)
  }

  _sync(session) {
    let state = this.states.get(session)
    if (state === undefined) {
      state = {
        consumedEvents: 0,
        header: undefined,
        surface: [],
        surfaceTokens: 0,
        stepStart: undefined,
        anchor: undefined,
      }
      this.states.set(session, state)
    }

    while (state.consumedEvents < session.events.length) {
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const event = session.events[state.consumedEvents]
      this._foldEvent(session, state, event)
      state.consumedEvents += 1
    }
    return state
  }

  _foldEvent(session, state, event) {
    let nextHeader = state.header
    let nextStepStart = state.stepStart
    let nextAnchor = state.anchor

    switch (event.type) {
      case 'request/header':
        nextHeader = canonicalHeader(event.data.header)
        break
      case 'step/start':
        if (state.stepStart !== undefined) {
          throw new Error(
            `token meter: step/start at seq ${event.seq} arrived before turn ${state.stepStart.turn}/step ${state.stepStart.step} ended`,
          )
        }
        nextStepStart = { ...event.data, surfaceTokens: state.surfaceTokens }
        break
      case 'step/end':
        if (state.stepStart === undefined
          || state.stepStart.turn !== event.data.turn
          || state.stepStart.step !== event.data.step) {
          throw new Error(`token meter: step/end at seq ${event.seq} has no matching step/start event`)
        }
        nextStepStart = undefined
        break
      default:
        break
    }

    const surface = isSurfaceEvent(event)
      ? foldSurfaceTokens(state.surface, event)
      : undefined

    if (event.type === 'assistant/message') {
      const stepStart = state.stepStart
      if (stepStart === undefined
        || stepStart.turn !== event.data.turn
        || stepStart.step !== event.data.step) {
        throw new Error(`token meter: assistant/message at seq ${event.seq} has no matching step/start event`)
      }

      // oxlint-disable-next-line typescript/no-non-null-assertion
      const eventTokens = surface.tokens
      if (event.data.usage !== undefined && nextHeader !== undefined) {
        const providerAssistantTokens = this._estimateProviderAssistant(
          session,
          event,
          eventTokens,
        )
        const anchorSurfaceTokens = stepStart.surfaceTokens + providerAssistantTokens
        const providerTokens = usageTokens(event.data.usage)
        const estimatedAnchorTokens = estimateHeader(nextHeader) + anchorSurfaceTokens
        nextAnchor = {
          header: nextHeader,
          surfaceTokens: anchorSurfaceTokens,
          baseline: providerTokens >= estimatedAnchorTokens
            ? { kind: 'usage', tokens: providerTokens, usage: event.data.usage }
            : { kind: 'estimated', tokens: estimatedAnchorTokens },
        }
      } else {
        const anchorSurfaceTokens = stepStart.surfaceTokens + eventTokens
        nextAnchor = {
          header: nextHeader,
          surfaceTokens: anchorSurfaceTokens,
          baseline: {
            kind: 'estimated',
            tokens: estimateHeader(nextHeader) + anchorSurfaceTokens,
          },
        }
      }
    }

    state.header = nextHeader
    state.stepStart = nextStepStart
    if (surface !== undefined) {
      state.surface = surface.nodes
      state.surfaceTokens += surface.deltaTokens
    }
    state.anchor = nextAnchor
  }

  _estimateProviderAssistant(session, event, durableEventTokens) {
    const sourceSeqs = event.sourceEventSeqs
    if (sourceSeqs === undefined) return durableEventTokens

    const assembler = new BlockAssembler()
    const seen = new Set()
    for (const seq of sourceSeqs) {
      if (seq >= event.seq) {
        throw new Error(`token meter: assistant/message at seq ${event.seq} source seq ${seq} is not earlier`)
      }
      if (seen.has(seq)) {
        throw new Error(`token meter: assistant/message at seq ${event.seq} repeats source seq ${seq}`)
      }
      seen.add(seq)
      const source = session.events[seq]
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const sourceEvent = source
      if (sourceEvent.type !== 'assistant/chunk') {
        throw new Error(`token meter: assistant/message at seq ${event.seq} source seq ${seq} is not assistant/chunk`)
      }
      if (sourceEvent.data.turn !== event.data.turn || sourceEvent.data.step !== event.data.step) {
        throw new Error(`token meter: assistant/message at seq ${event.seq} source seq ${seq} belongs to another step`)
      }
      assembler.push(sourceEvent.data.chunk)
    }
    const providerContent = assembler.blocks()
    return providerContent.length === 0 ? 0 : estimateContent(providerContent) + ROLE_OVERHEAD
  }
}

export default TokenMeter
