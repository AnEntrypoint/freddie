import { Service } from '@freddie/cordis'
import { scopeTarget } from '@freddie/freddie-scope'
import { assertObjectJsonSchema } from '@freddie/freddie-tools'
import { SubagentError } from './error.js'
import { assertSubagentMaxDepth } from './depth.js'
import { createActivationObserver, createLifecycleEmitter, observeRun } from './lifecycle.js'
import SubagentContinuationManager from './continuation.js'
import SubagentActivationSetupRegistry from './activation-setup-registry.js'
import { listChildren as listSubagentChildren, listDescendants as listSubagentDescendants } from './list-children.js'
import { snapshotSubagentDescriptor } from './descriptor.js'
import { subagentIdentityProjectionDefinition, subagentTimingProjectionDefinition } from './projection.js'

export * from './out-of-process.js'
export { AssistantOutputFold, finalAssistantOutput } from './assistant-output.js'
export { SubagentRunId } from './types.js'
export {
  foldSubagentDescriptor,
  snapshotSubagentDescriptor,
  SUBAGENT_DESCRIPTOR_VERSION,
} from './descriptor.js'
export { seedDescriptorTurn } from './descriptor-seed.js'
export { SubagentError } from './error.js'
export { settleRun } from './run-settlement.js'
export { assertSubagentMaxDepth, delegationDepthOf } from './depth.js'
export {
  appendDelegatedPolicyOverrides,
  applyChildComposition,
  captureDelegatedPolicyOverrides,
  childSessionMeta,
  resolveChildAgentOptions,
  resolveChildDepth,
  SubagentDepthError,
} from './child-agent.js'

export class SubagentRuntime extends Service {
  providers = new Map()
  continuations
  setupRegistry = new SubagentActivationSetupRegistry()
  emitLifecycle

  constructor(ctx) {
    super(ctx, 'subagents')
    this.emitLifecycle = createLifecycleEmitter(this.ctx, parent => scopeTarget(this, parent))
    ctx.inject(['agents'], (childCtx) => {
      const manager = new SubagentContinuationManager(childCtx, {
        prepareContinuable: (name, request) => this.prepareContinuable(name, request),
        observeActivation: (provider, childId, parent) => this.observeActivation(provider, childId, parent),
      }, this.setupRegistry)
      this.continuations = manager
      childCtx.effect(() => () => {
        if (this.continuations === manager) this.continuations = undefined
      }, 'subagents.continuationBinding()')
    })
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register(subagentTimingProjectionDefinition)
      projectionCtx.sessionProjections.register(subagentIdentityProjectionDefinition)
    })
  }

  async startContinuable(spec) {
    return this.requireContinuations().startContinuable(spec)
  }

  async followup(parent, childId, content, options) {
    return this.requireContinuations().followup(parent, childId, content, options)
  }

  interrupt(targetSessionId, authority) {
    this.continuations?.interrupt(targetSessionId, authority)
  }

  async reportFrom(child, content, options) {
    return this.requireContinuations().reportFrom(child, content, options)
  }

  registerContinuableSetup(contribution) {
    return this.ctx.effect(
      () => this.setupRegistry.register(contribution),
      'subagents.registerContinuableSetup()',
    )
  }

  async drainContinuableDescendants(parents) {
    const manager = this.continuations
    if (manager === undefined) return
    await manager.drainDescendants(parents)
  }

  async drainContinuableChildren(parent, childIds) {
    const manager = this.continuations
    if (manager === undefined) return
    await manager.drainChildren(parent, childIds)
  }

  listChildren(parentSessionId, signal) {
    return listSubagentChildren(this.ctx, parentSessionId, signal)
  }

  listDescendants(rootSessionId, signal) {
    return listSubagentDescendants(this.ctx, rootSessionId, signal)
  }

  registerProvider(provider) {
    const name = provider.name
    return this.ctx.effect(function* () {
      if (this.providers.has(name)) {
        throw new SubagentError(`a subagent provider named "${name}" is already registered`, 'DUPLICATE_PROVIDER')
      }
      this.providers.set(name, provider)
      yield () => {
        this.providers.delete(name)
        this.emitLifecycle('subagent/provider-removed', name)
      }
      this.ctx.emit('subagent/provider-added', provider)
    }.bind(this), 'subagents.registerProvider()')
  }

  getProvider(name) {
    return this.providers.get(name)
  }

  list() {
    return [...this.providers.keys()]
  }

  async start(name, request) {
    const provider = this.expectProvider(name)
    this.assertCapabilities(provider, request)
    assertSubagentMaxDepth(request.maxDepth)
    if (request.outputSchema !== undefined) assertObjectJsonSchema(request.outputSchema)
    const descriptor = snapshotSubagentDescriptor({
      mode: 'one-shot',
      provider: name,
      ...request.label !== undefined ? { label: request.label } : {},
    })
    const resolved = { ...request, descriptor }
    return observeRun(this.emitLifecycle, name, request.parent, await provider.start(resolved))
  }

  async prepareContinuable(name, request) {
    const provider = this.expectProvider(name)
    if (provider.prepareContinuable === undefined) {
      throw new SubagentError(
        `subagent provider "${provider.name}" does not support continuable children `
        + '(no prepareContinuable capability)',
        'UNSUPPORTED_CAPABILITY',
      )
    }
    return provider.prepareContinuable(request)
  }

  expectProvider(name) {
    const provider = this.providers.get(name)
    if (provider === undefined) {
      throw new SubagentError(`no subagent provider registered for "${name}"`, 'NO_PROVIDER')
    }
    return provider
  }

  requireContinuations() {
    if (this.continuations === undefined) {
      throw new SubagentError(
        'continuable subagents require the agents service',
        'CONTINUATION_UNAVAILABLE',
      )
    }
    return this.continuations
  }

  observeActivation(provider, childId, parent) {
    return createActivationObserver(this.emitLifecycle, provider, childId, parent)
  }

  assertCapabilities(provider, request) {
    const needs = [
      { when: request.outputSchema !== undefined, cap: 'outputSchema' },
      { when: request.maxDepth !== undefined, cap: 'depthLimit' },
      { when: request.toolFilter !== undefined, cap: 'toolFilter' },
      { when: request.persona !== undefined, cap: 'persona' },
    ]
    for (const { when, cap } of needs) {
      if (when && !provider.capabilities[cap]) {
        throw new SubagentError(
          `subagent provider "${provider.name}" does not support the "${cap}" capability`,
          'UNSUPPORTED_CAPABILITY',
        )
      }
    }
  }
}

export default SubagentRuntime
