import { randomUUID } from 'node:crypto'
import { boundContextSummary, createUserMessage, errorChain } from '@freddie/freddie-llm'
import { SessionId } from '@freddie/freddie-session'
import { foldSubagentDescriptor, snapshotSubagentDescriptor } from './descriptor.js'
import {
  appendDelegatedPolicyOverrides,
  applyChildComposition,
  captureDelegatedPolicyOverrides,
  childSessionMeta,
  resolveChildAgentOptions,
  resolveChildDepth,
} from './child-agent.js'
import { assertSubagentMaxDepth } from './depth.js'
import { seedDescriptorTurn } from './descriptor-seed.js'
import { SubagentError } from './error.js'

/**
 * Message source recorded when a model coordinator follows up with a child
 * directly, e.g. `{ kind: 'coordinator', form: 'relay', senderSessionId }` as
 * sent by `tool-subagent-control`.
 * @typedef {object} SubagentCoordinatorMessageSource
 * @property {'coordinator'} kind
 * @property {'relay'} form
 * @property {string} senderSessionId - the coordinating parent's session id.
 */

/**
 * Durable attribution for a continuable child's explicit parent report, built
 * by {@link SubagentContinuationManager#deliverReport}.
 * @typedef {object} SubagentReportMessageSource
 * @property {'subagent-report'} kind
 * @property {'relay'} form
 * @property {string} senderSessionId - the reporting child's session id.
 */

/**
 * Durable attribution for the runtime's own account of a continuable child
 * settling. Deliberately a different kind from
 * {@link SubagentReportMessageSource}: a report is content the child chose,
 * while this message is the manager stating what became of the child, and a
 * transcript that merged them would credit the child with words it never wrote.
 * @typedef {object} SubagentSettledMessageSource
 * @property {'subagent-settled'} kind
 * @property {'notice'} form
 * @property {string} summary - bounded summary of the settlement notice text.
 * @property {string} senderSessionId - the settled child's session id.
 */

/**
 * Deployment scheduling policy for accepted child reports: `'quiet'` injects
 * next-step context without waking the parent, `'next-step'` steers and wakes
 * it.
 * @typedef {'quiet' | 'next-step'} SubagentReportDelivery
 */

/**
 * Options for one continuable child's report to its direct parent.
 * @typedef {object} SubagentReportOptions
 * @property {SubagentReportDelivery} delivery
 * @property {AbortSignal} signal
 */

/**
 * What a caller asks for when starting a continuable background child.
 * @typedef {object} SubagentStartContinuableSpec
 * @property {import('@freddie/freddie-session').SessionId} [childId] - a
 * caller-reserved durable id; omitted to let the manager mint one.
 * @property {string} provider - the subagent provider name.
 * @property {string} [label]
 * @property {object} request - the delegation request (`parent`, `prompt`,
 * `maxDepth`, `agentOptions`, `persona`, `toolFilter`).
 * @property {AbortSignal} signal
 */

/**
 * Identities returned once a continuable child accepted its initial prompt.
 * @typedef {object} SubagentStartContinuableResult
 * @property {import('@freddie/freddie-session').SessionId} childId
 * @property {string} messageId
 */

/**
 * Authority under which one interrupt request is admitted. `user` carries the
 * durable direct-parent address a human client presented; `ancestor` carries
 * the exact live Agent object whose recorded lineage must contain the caller.
 * @typedef {{ kind: 'user', parentSessionId: import('@freddie/freddie-session').SessionId } | { kind: 'ancestor', agent: object }} SubagentInterruptAuthority
 */

/**
 * Options for following up with one continuable child.
 * @typedef {object} SubagentFollowupOptions
 * @property {SubagentCoordinatorMessageSource | object} source
 * @property {AbortSignal} signal
 */

/**
 * The residency state of one continuable child, derived from Agent quiescence
 * and the owned-child set rather than a second state machine:
 * `running` — the Agent has an active admission or turn, or waking inbox work;
 * `waiting` — the Agent is quiescent but still owns undisposed children;
 * `settled` — quiescent with every owned child disposed, so the manager
 * disposes the `AgentHandle` and removes the Activation.
 * @typedef {'running' | 'waiting' | 'settled'} SubagentResidencyState
 */

/**
 * Hooks the manager needs from the owning service. Declared here, by the
 * dependent, so the manager states exactly what it requires instead of
 * depending back on the whole {@link import('./index.js').SubagentRuntime}.
 * Package-private: no consumer outside this package supplies a host.
 * @typedef {object} SubagentContinuationHost
 * @property {function} prepareContinuable
 * @property {function} observeActivation
 */

/**
 * One residency epoch for a reconstructed continuable child Agent. It directly
 * owns the published `AgentHandle`; the manager's private activation-owner
 * scope is its structural Cordis owner.
 * @typedef {object} Activation
 * @property {import('@freddie/freddie-session').SessionId} childId
 * @property {import('@freddie/freddie-session').SessionId} parentSession
 * @property {string} provider
 * @property {object} handle - the published `AgentHandle`.
 * @property {WeakSet<object>} ancestry
 * @property {Set<import('@freddie/freddie-session').SessionId>} ownedChildren
 * @property {object} observer - the {@link ActivationObserver} tracking this epoch.
 * @property {Promise<Error|undefined>|undefined} disposal
 * @property {Set<string>} accepted - message ids admitted but not yet drained.
 * @property {boolean} announced
 * @property {PromiseWithResolvers<void>} poke
 */

/**
 * Inputs shared by fresh and resumed Activation materialization.
 * @typedef {object} SubagentMaterializationInputs
 * @property {import('@freddie/freddie-session').SessionId} childId
 * @property {string} provider
 * @property {object} parent - the live parent Agent.
 * @property {{ seed: object[], meta: object, delegatedPolicies: object }} [create] - present for a fresh child; absent to resume.
 * @property {object} agentOptions
 * @property {{ persona: unknown, toolFilter: unknown }} composition
 * @property {AbortSignal} signal
 */

/**
 * One admitted materialization and the exact live ancestry observed at its
 * synchronous admission boundary. Retaining identities lets a scoped teardown
 * keep waiting even if an intermediate Agent leaves the registry meanwhile.
 * @typedef {object} SubagentMaterialization
 * @property {object[]} lineage - the live ancestry at admission.
 * @property {Promise<void>} settled
 */

function disposalOf(activation) {
  return activation.disposal
}

function settlementSummary(childId, stopReason) {
  const subject = `Background subagent ${childId}`
  switch (stopReason) {
    case 'completed':
      return `${subject} finished and will do no further work unless you send it more.`
    case 'aborted':
      return `${subject} was stopped before it finished.`
    case 'max-tokens':
      return `${subject} ran out of room before it finished.`
    case 'refusal':
      return `${subject} declined the task.`
    case 'error':
      return `${subject} failed before it finished.`
    /* v8 ignore next 4 -- `SubagentResult['stopReason']` is merge-extensible, so this arm
     * needs a backend that adds a variant; an unnameable ending is reported as unfinished
     * rather than silently as success. */
    default:
      return `${subject} ended abnormally (${String(stopReason)}) before it finished.`
  }
}

/**
 * Whether one settlement attempt opened the disposal transaction.
 * @typedef {object} SubagentSettlementAttempt
 * @property {boolean} settling
 * @property {Promise<Error|undefined>} [done] - present only when `settling` is true.
 */

class ChildLock {
  tails = new Map()

  run(childId, operation) {
    const previous = this.tails.get(childId) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    const tail = result.then(() => undefined, () => undefined)
    this.tails.set(childId, tail)
    void tail.then(() => {
      if (this.tails.get(childId) === tail) this.tails.delete(childId)
    })
    return result
  }
}

export class SubagentContinuationManager {
  activations = new Map()
  materializations = new Set()
  locks = new ChildLock()
  ownerCtx
  closingScopes = new Map()
  draining = false

  constructor(ctx, host, setupRegistry) {
    this.ctx = ctx
    this.host = host
    this.setupRegistry = setupRegistry
    const scope = ctx.plugin(function activationOwner() {})
    this.ownerCtx = scope.ctx
    ctx.on('agent/disposed', ({ agent }) => {
      this.closingScopes.delete(agent)
    })
    ctx.effect(function* () {
      yield scope.dispose
      yield () => this.drain()
    }.bind(this), 'subagents.continuations()')
  }

  async startContinuable(spec) {
    const request = spec.request
    const parent = request.parent
    this.assertAdmitting(parent)
    const persistence = this.requirePersistence()
    assertSubagentMaxDepth(request.maxDepth)
    const childId = spec.childId ?? SessionId(randomUUID())
    this.assertChildIdAvailable(childId)
    const childDepth = resolveChildDepth(parent, request.maxDepth)
    const agentProvider = request.agentOptions?.provider ?? parent.options.provider
    const agentModel = request.agentOptions?.model ?? parent.options.model
    const descriptor = snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: spec.provider,
      label: spec.label,
      ...agentProvider !== undefined ? { agentProvider } : {},
      ...agentModel !== undefined ? { agentModel } : {},
      ...request.persona !== undefined ? { persona: request.persona } : {},
      ...request.toolFilter !== undefined ? { toolFilter: request.toolFilter } : {},
    })
    const delegatedPolicies = captureDelegatedPolicyOverrides(parent)

    const prepared = await this.host.prepareContinuable(spec.provider, {
      sessionId: childId,
      parent,
      signal: spec.signal,
    })
    spec.signal.throwIfAborted()
    this.assertAdmitting(parent)

    const lineageSeedLength = prepared.seed?.length ?? 0
    const seed = seedDescriptorTurn(childId, prepared.seed, descriptor)
    const messageId = await this.locks.run(childId, async () => {
      spec.signal.throwIfAborted()
      this.assertAdmitting(parent)
      this.assertChildIdAvailable(childId)
      if (spec.childId !== undefined) {
        const persisted = await persistence.listSnapshots(spec.signal)
        spec.signal.throwIfAborted()
        this.assertAdmitting(parent)
        this.assertChildIdAvailable(childId)
        if (persisted.some(snapshot => snapshot.header.id === childId)) {
          throw new SubagentError(`subagent "${childId}" already exists`, 'DUPLICATE_CHILD')
        }
      }
      const activation = await this.materialize({
        childId,
        provider: spec.provider,
        parent,
        create: { seed, meta: childSessionMeta(parent, childDepth, lineageSeedLength), delegatedPolicies },
        agentOptions: resolveChildAgentOptions(parent, request.agentOptions, childDepth),
        composition: { persona: request.persona, toolFilter: request.toolFilter },
        signal: spec.signal,
      })
      return this.submitMaterialized(
        activation,
        request.prompt,
        { kind: 'user' },
        parent,
        spec.signal,
      )
    })
    return { childId, messageId }
  }

  assertChildIdAvailable(childId) {
    if (this.ctx.agents.get(childId) !== undefined || this.ctx.get('sessions')?.get(childId) !== undefined) {
      throw new SubagentError(`subagent "${childId}" already exists`, 'DUPLICATE_CHILD')
    }
  }

  async followup(parent, childId, content, options) {
    this.assertAdmitting(parent)
    while (true) {
      const live = await this.locks.run(childId, async () => {
        const activation = this.activations.get(childId)
        if (activation === undefined) return this.coldResume(parent, childId, content, options)
        /* v8 ignore next 3 -- the send-versus-dispose cutoff: reaching this arm needs a
         * delivery to observe the transaction inside the same critical section that opened it,
         * which no test can schedule deterministically. The behavior is covered end-to-end by
         * "cold-resumes a delivery that lost the race with final disposal". */
        if (activation.disposal !== undefined) {
          return activation.disposal.then(() => undefined, () => undefined)
        }
        return this.submitAdmitted(activation, content, options.source, parent, options.signal)
      })
      /* v8 ignore start -- only the lost-cutoff arm above returns undefined, so only that
       * race reaches the retry below, which then cold-resumes a new Activation. */
      if (live !== undefined) return live
      this.assertAdmitting(parent)
      options.signal.throwIfAborted()
      /* v8 ignore stop */
    }
  }

  interrupt(targetSessionId, authority) {
    if (authority.kind === 'ancestor') {
      const caller = authority.agent
      if (this.ctx.agents.get(caller.id) !== caller) {
        throw new SubagentError(
          `interrupting "${targetSessionId}" requires the exact live ancestor agent`,
          'UNAUTHORIZED',
        )
      }
      if (caller.id === targetSessionId) {
        throw new SubagentError(
          `agent "${caller.id}" cannot interrupt itself`,
          'UNAUTHORIZED',
        )
      }
    }
    const activation = this.activations.get(targetSessionId)
    if (activation === undefined) return
    if (authority.kind === 'user') {
      if (activation.handle.agent.session.header.parentSession !== authority.parentSessionId) {
        throw new SubagentError(
          `subagent "${targetSessionId}" belongs to another parent session`,
          'UNAUTHORIZED',
        )
      }
    } else if (!activation.ancestry.has(authority.agent)) {
      throw new SubagentError(
        `subagent "${targetSessionId}" is not a live descendant of agent "${authority.agent.id}"`,
        'UNAUTHORIZED',
      )
    }
    if (activation.disposal !== undefined) return
    activation.handle.agent.cancel(
      authority.kind === 'user' ? { kind: 'user' } : { kind: 'parent' },
      { keepInbox: true },
    )
  }

  // oxlint-disable-next-line typescript/require-await -- keep rejection semantics without yielding during admission
  async reportFrom(child, content, options) {
    options.signal.throwIfAborted()
    this.assertAdmitting(child)
    const activation = this.authorizeReporter(child)
    const parent = this.resolveReportParent(child)
    return this.deliverReport(activation, parent, content, options.delivery)
  }

  authorizeReporter(child) {
    const activation = this.activations.get(child.id)
    if (activation === undefined || activation.handle.agent !== child) {
      throw new SubagentError(
        `agent "${child.id}" is not a live continuable subagent and cannot report`,
        'UNAUTHORIZED',
      )
    }
    /* v8 ignore next 6 -- only a synchronous re-entrant disposer can open this
     * transaction between exact-agent authorization and this no-await cutoff. */
    if (activation.disposal !== undefined) {
      throw new SubagentError(
        `subagent "${child.id}" activation is being disposed; the report was not delivered`,
        'ACTIVATION_CLOSING',
      )
    }
    return activation
  }

  resolveReportParent(child) {
    const parentId = child.session.header.parentSession
    /* v8 ignore next -- every continuation-managed child has direct-parent metadata. */
    const parent = parentId === undefined ? undefined : this.ctx.agents.get(parentId)
    if (parent === undefined) {
      throw new SubagentError(
        'direct parent is not live; report was not delivered',
        'PARENT_UNAVAILABLE',
      )
    }
    return parent
  }

  deliverReport(activation, parent, content, delivery) {
    const message = createUserMessage({
      content: [
        { type: 'text', text: `Background subagent ${activation.childId} reported:` },
        ...content,
      ],
      source: {
        kind: 'subagent-report',
        form: 'relay',
        senderSessionId: activation.childId,
      },
    })
    if (delivery === 'next-step') {
      this.sendWaking(parent, message, () => { this.sendReport(parent, message, delivery) })
    } else {
      this.sendReport(parent, message, delivery)
    }
    return message.id
  }

  sendWaking(parent, message, send) {
    const parentActivation = this.activations.get(parent.id)
    if (parentActivation !== undefined && parentActivation.handle.agent === parent) {
      this.admitWaking(parentActivation, message.id, send)
    } else {
      send()
    }
  }

  sendReport(parent, message, delivery) {
    try {
      if (delivery === 'next-step') parent.steer(message)
      else parent.inject(message)
    } catch (error) {
      throw new SubagentError(
        'direct parent is not live; report was not delivered',
        'PARENT_UNAVAILABLE',
        { cause: error },
      )
    }
  }

  async drain() {
    this.draining = true
    await Promise.all([...this.materializations].map(materialization => materialization.settled))
    const owned = new Set()
    for (const activation of this.activations.values()) {
      for (const child of activation.ownedChildren) owned.add(child)
    }
    const roots = [...this.activations.values()].filter(activation => !owned.has(activation.childId))
    await this.disposeRoots(roots, 'activation(s)')
  }

  async drainDescendants(parents) {
    const roots = new Set(parents.filter(parent => this.ctx.agents.get(parent.id) === parent))
    if (roots.size === 0) return

    for (const root of roots) {
      this.closingMembers(root).add(root)
    }

    const targets = []
    for (const activation of this.activations.values()) {
      const lineage = this.liveLineage(activation.handle.agent)
      const owners = [...roots].filter(root => activation.handle.agent !== root
        && activation.ancestry.has(root))
      if (owners.length === 0) continue
      targets.push(activation)
      for (const owner of owners) {
        const members = this.closingMembers(owner)
        members.add(activation.handle.agent)
        for (const agent of lineage) members.add(agent)
      }
    }
    const materializations = [...this.materializations].filter((materialization) => {
      const owners = [...roots].filter(root => materialization.lineage.includes(root))
      for (const owner of owners) {
        const members = this.closingMembers(owner)
        for (const agent of materialization.lineage) members.add(agent)
      }
      return owners.length > 0
    })

    const ownedTargets = new Set()
    for (const activation of targets) {
      for (const child of activation.ownedChildren) ownedTargets.add(child)
    }
    const targetRoots = targets.filter(activation => !ownedTargets.has(activation.childId))

    for (const activation of targets) {
      const disposal = this.dispose(activation)
      void disposal.catch(() => undefined)
    }

    await Promise.all(materializations.map(materialization => materialization.settled))
    await this.disposeRoots(targetRoots, 'scoped activation(s)')
  }

  async drainChildren(parent, childIds) {
    if (this.ctx.agents.get(parent.id) !== parent) {
      throw new SubagentError('selected child teardown requires the exact live parent agent', 'UNAUTHORIZED')
    }
    const targets = []
    for (const childId of new Set(childIds)) {
      const activation = this.activations.get(childId)
      if (activation === undefined) continue
      if (activation.parentSession !== parent.id || !activation.ancestry.has(parent)) {
        throw new SubagentError(
          `subagent "${childId}" is not a direct child of agent "${parent.id}"`,
          'UNAUTHORIZED',
        )
      }
      targets.push(activation)
    }

    for (const activation of targets) {
      const disposal = this.dispose(activation)
      void disposal.catch(() => undefined)
    }
    await this.disposeRoots(targets, 'selected activation(s)')
  }

  async disposeRoots(roots, failureSubject) {
    const failures = await Promise.all(roots.map(async (activation) => {
      try {
        await this.dispose(activation)
        return undefined
      } catch (error) {
        return error
      }
    }))
    const reasons = failures.filter(failure => failure !== undefined)
    if (reasons.length > 0) {
      throw new SubagentError(
        `continuable subagent teardown failed for ${reasons.length} ${failureSubject}: `
        + reasons.map(reason => errorChain(reason)).join('; '),
        'ACTIVATION_TEARDOWN_FAILED',
      )
    }
  }

  closingMembers(root) {
    const existing = this.closingScopes.get(root)
    if (existing !== undefined) return existing
    const members = new Set()
    this.closingScopes.set(root, members)
    return members
  }

  liveLineage(agent) {
    const lineage = [agent]
    const seen = new Set([agent.id])
    let parentSession = agent.session.header.parentSession
    while (parentSession !== undefined) {
      const parent = this.ctx.agents.get(parentSession)
      if (parent === undefined || seen.has(parent.id)) break
      lineage.push(parent)
      seen.add(parent.id)
      parentSession = parent.session.header.parentSession
    }
    return lineage
  }

  closingTeardownFor(agent) {
    if (this.draining) return 'manager'
    const lineage = this.liveLineage(agent)
    for (const [root, members] of this.closingScopes) {
      if (members.has(agent) || lineage.includes(root)) return root
    }
    return undefined
  }

  assertAdmitting(agent) {
    const closing = this.closingTeardownFor(agent)
    if (closing === undefined) return
    throw new SubagentError(
      closing === 'manager'
        ? 'continuable subagents are draining; the operation was not admitted'
        : `continuable subagents below parent "${closing.id}" are draining; the operation was not admitted`,
      'DRAINING',
    )
  }

  stateOf(activation) {
    if (activation.handle.agent.status === 'running' || activation.accepted.size > 0) return 'running'
    if (activation.ownedChildren.size > 0) return 'waiting'
    return 'settled'
  }

  async coldResume(parent, childId, content, options) {
    const persistence = this.requirePersistence()
    let loaded
    try {
      loaded = await persistence.inspect(childId, options.signal)
    } catch (error) {
      options.signal.throwIfAborted()
      throw new SubagentError(`subagent "${childId}" is unavailable`, 'NOT_RESUMABLE', { cause: error })
    }
    options.signal.throwIfAborted()
    this.assertAdmitting(parent)
    this.authorizeLineage(parent, childId, loaded.meta.parentSession)
    const descriptor = foldSubagentDescriptor(loaded.events.slice(loaded.meta.seedLength ?? 0))
    if (descriptor === undefined || descriptor.mode !== 'continuable') {
      throw new SubagentError(
        `subagent "${childId}" has no supported continuation state and cannot be resumed; `
        + 'do not retry send_message with this id',
        'NOT_RESUMABLE',
      )
    }
    let activation
    try {
      activation = await this.materialize({
        childId,
        provider: descriptor.provider,
        parent,
        agentOptions: {
          ...descriptor.agentProvider !== undefined ? { provider: descriptor.agentProvider } : {},
          ...descriptor.agentModel !== undefined ? { model: descriptor.agentModel } : {},
        },
        composition: { persona: descriptor.persona, toolFilter: descriptor.toolFilter },
        signal: options.signal,
      })
    } catch (error) {
      options.signal.throwIfAborted()
      if (error instanceof SubagentError) throw error
      throw new SubagentError(`subagent "${childId}" is unavailable`, 'NOT_RESUMABLE', { cause: error })
    }
    return this.submitMaterialized(activation, content, options.source, parent, options.signal)
  }

  async submitMaterialized(activation, content, source, parent, signal) {
    try {
      return this.submitAdmitted(activation, content, source, parent, signal)
    } catch (error) {
      /* v8 ignore next -- rollback disposal failures must not mask the
       * pre-acceptance signal, drain, or lifecycle failure. */
      await this.dispose(activation).catch(() => undefined)
      throw error
    }
  }

  materialize(inputs) {
    this.assertAdmitting(inputs.parent)
    const settled = Promise.withResolvers()
    const lineage = this.liveLineage(inputs.parent)
    const materialization = {
      lineage,
      settled: settled.promise,
    }
    this.materializations.add(materialization)
    return this.materializeTracked(inputs, lineage).finally(() => {
      this.materializations.delete(materialization)
      settled.resolve()
    })
  }

  async materializeTracked(inputs, parentLineage) {
    const { childId, provider, parent, create } = inputs
    inputs.signal.throwIfAborted()
    const setup = (childCtx) => {
      if (create !== undefined) {
        appendDelegatedPolicyOverrides(childCtx.agent.session, create.delegatedPolicies)
      }
      applyChildComposition(childCtx, parent, inputs.composition)
      return this.setupRegistry.apply(childCtx)
    }
    const observer = this.host.observeActivation(provider, childId, parent)
    const handle = create === undefined
      ? await this.ownerCtx.agents.resume({
        resumeSessionId: childId,
        agentOptions: inputs.agentOptions,
        signal: inputs.signal,
        setup,
      })
      : await this.ownerCtx.agents.create({
        sessionId: childId,
        meta: create.meta,
        seed: create.seed,
        agentOptions: inputs.agentOptions,
        signal: inputs.signal,
        setup,
      })

    const activation = {
      childId,
      parentSession: parent.id,
      provider,
      handle,
      ancestry: new WeakSet([handle.agent, ...parentLineage]),
      ownedChildren: new Set(),
      observer,
      disposal: undefined,
      accepted: new Set(),
      announced: false,
      poke: Promise.withResolvers(),
    }
    this.activations.set(childId, activation)
    try {
      inputs.signal.throwIfAborted()
      this.assertAdmitting(parent)
      this.acquireOwnership(parent, childId)
      handle.agent.ctx.on('agent/inbox/claimed', ({ message }) => {
        /* v8 ignore next -- a claim of an id this manager never admitted needs
         * another sender on the same child, which no current path allows. */
        if (activation.accepted.delete(message.id)) this.wake(activation)
      })
      handle.agent.ctx.on('agent/inbox/discarded', ({ message }) => {
        if (activation.accepted.delete(message.id)) this.wake(activation)
      })
      observer.start(handle.agent)
    } catch (error) {
      /* v8 ignore next -- rollback failure must not mask the admission failure
       * that prevented this operation from returning an accepted message id. */
      await this.rollbackUnpublished(activation).catch(() => undefined)
      throw error
    }
    this.watchSettlement(activation)
    return activation
  }

  rollbackUnpublished(activation) {
    return (activation.disposal ??= (async () => {
      try {
        await activation.handle.dispose()
      } finally {
        this.activations.delete(activation.childId)
        this.releaseOwnership(activation.childId)
      }
    })())
  }

  acquireOwnership(parent, childId) {
    const parentActivation = this.activations.get(parent.id)
    if (parentActivation === undefined) return
    if (parentActivation.disposal !== undefined) {
      throw new SubagentError(
        `subagent parent "${parent.id}" is being disposed; the child was not established`,
        'ACTIVATION_CLOSING',
      )
    }
    parentActivation.ownedChildren.add(childId)
  }

  releaseOwnership(childId) {
    for (const candidate of this.activations.values()) {
      if (candidate.ownedChildren.delete(childId)) this.wake(candidate)
    }
  }

  wake(activation) {
    activation.poke.resolve()
    activation.poke = Promise.withResolvers()
  }

  submit(activation, content, source, parent) {
    this.acquireOwnership(parent, activation.childId)
    const message = createUserMessage({ content, source })
    const accepted = this.admitWaking(activation, message.id, () => {
      activation.handle.agent.followup(message)
    })
    activation.announced = true
    return accepted
  }

  admitWaking(activation, messageId, send) {
    activation.accepted.add(messageId)
    try {
      send()
    } catch (error) {
      activation.accepted.delete(messageId)
      throw error
    }
    this.wake(activation)
    return messageId
  }

  submitAdmitted(activation, content, source, parent, signal) {
    signal.throwIfAborted()
    this.assertAdmitting(parent)
    /* v8 ignore next 6 -- only a synchronous re-entrant disposer can change
     * this field between the caller's live check and this no-await boundary. */
    if (disposalOf(activation) !== undefined) {
      throw new SubagentError(
        `subagent "${activation.childId}" activation is being disposed; the message was not accepted`,
        'ACTIVATION_CLOSING',
      )
    }
    this.authorizeLineage(
      parent,
      activation.childId,
      activation.handle.agent.session.header.parentSession,
    )
    return this.submit(activation, content, source, parent)
  }

  authorizeLineage(parent, childId, parentSession) {
    if (this.ctx.agents.get(parent.id) !== parent) {
      throw new SubagentError(
        `subagent "${childId}" delivery requires the exact live parent agent`,
        'UNAUTHORIZED',
      )
    }
    if (parentSession !== parent.id) {
      throw new SubagentError(`subagent "${childId}" belongs to another parent session`, 'UNAUTHORIZED')
    }
  }

  watchSettlement(activation) {
    void (async () => {
      while (disposalOf(activation) === undefined) {
        const poked = activation.poke.promise
        await Promise.race([activation.handle.agent.whenIdle(), poked])
        if (disposalOf(activation) !== undefined) return
        const settling = await this.locks.run(activation.childId, () => {
          if (disposalOf(activation) !== undefined || this.stateOf(activation) !== 'settled') {
            return Promise.resolve({ settling: false })
          }
          return Promise.resolve({ settling: true, done: this.dispose(activation) })
        })
        if (!settling.settling) {
          if (activation.handle.agent.status !== 'running') await poked
          continue
        }
        try {
          await settling.done
        } catch (error) {
          this.ctx.logger.warn(
            `subagent "${activation.childId}" activation teardown failed: ${errorChain(error)}`,
          )
        }
        return
      }
    })()
  }

  dispose(activation) {
    const existing = activation.disposal
    if (existing !== undefined) return existing
    const completion = Promise.withResolvers()
    activation.disposal = completion.promise
    void this.finishDisposal(activation).then(completion.resolve, completion.reject)
    return completion.promise
  }

  async finishDisposal(activation) {
    this.wake(activation)
    const { childId } = activation
    activation.handle.agent.cancel({ kind: 'parent' })
    const idle = activation.handle.agent.whenIdle()
    const children = [...activation.ownedChildren]
      .map(child => this.activations.get(child))
      .filter((child) => child !== undefined)
    const childDisposals = children.map(child => this.dispose(child))

    const failures = []
    try {
      const childFailures = await Promise.all(childDisposals.map(async (disposal) => {
        try {
          await disposal
          return undefined
        } catch (error) {
          return error
        }
      }))
      const reasons = childFailures.filter(reason => reason !== undefined)
      if (reasons.length > 0) {
        failures.push(new SubagentError(
          `subagent "${childId}" child teardown failed: ${reasons.map(reason => errorChain(reason)).join('; ')}`,
          'ACTIVATION_TEARDOWN_FAILED',
        ))
      }
      await idle
      await this.flushFinalState(activation)
      activation.observer.capture(activation.handle.agent)
    } catch (error) {
      failures.push(new SubagentError(
        `subagent "${childId}" activation teardown failed: ${errorChain(error)}`,
        'ACTIVATION_TEARDOWN_FAILED',
        { cause: error },
      ))
    }
    try {
      await activation.handle.dispose()
    } catch (error) {
      failures.push(new SubagentError(
        `subagent "${childId}" activation handle disposal failed: ${errorChain(error)}`,
        'ACTIVATION_TEARDOWN_FAILED',
        { cause: error },
      ))
    }

    let failure
    if (failures.length === 1) {
      failure = failures[0]
    } else if (failures.length > 1) {
      failure = new SubagentError(
        `subagent "${childId}" activation teardown failed at ${failures.length} boundaries: `
        + failures.map(item => errorChain(item)).join('; '),
        'ACTIVATION_TEARDOWN_FAILED',
        { cause: new AggregateError(failures) },
      )
    }
    this.activations.delete(childId)
    this.notifySettlement(activation, activation.observer.terminal(failure))
    this.releaseOwnership(childId)
    activation.observer.settle(failure)
    if (failure !== undefined) throw failure
  }

  notifySettlement(activation, terminal) {
    if (!activation.announced) return
    try {
      const parent = this.ctx.agents.get(activation.parentSession)
      if (parent === undefined) return
      const summary = settlementSummary(activation.childId, terminal.stopReason)
      const message = createUserMessage({
        content: [
          { type: 'text', text: summary },
          ...terminal.output === undefined
            ? [{ type: 'text', text: 'It left no closing message.' }]
            : [{ type: 'text', text: 'Its closing message:' }, ...terminal.output],
        ],
        source: {
          kind: 'subagent-settled',
          form: 'notice',
          summary: boundContextSummary(summary),
          senderSessionId: activation.childId,
        },
      })
      if (this.closingTeardownFor(parent) !== undefined) {
        parent.inject(message)
        return
      }
      this.sendWaking(parent, message, () => {
        if (parent.status === 'idle') parent.followup(message)
        else parent.steer(message)
      })
    } catch (error) {
      this.ctx.logger.warn(
        `subagent "${activation.childId}" settlement notice was not delivered to its parent: `
        + errorChain(error),
      )
    }
  }

  async flushFinalState(activation) {
    const child = activation.handle.agent
    try {
      await child.ctx.sessions.flush(child.session)
    } catch (error) {
      this.ctx.logger.warn(
        `subagent "${activation.childId}" best-effort final session flush failed; `
        + `the persisted state may be unavailable or stale on resume: ${errorChain(error)}`,
      )
    }
  }

  requirePersistence() {
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) {
      throw new SubagentError(
        'continuable subagents require session persistence (load a freddie-session-persistence backend)',
        'PERSISTENCE_UNAVAILABLE',
      )
    }
    return persistence
  }
}

export default SubagentContinuationManager
