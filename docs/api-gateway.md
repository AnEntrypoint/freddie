# API Gateway

This is the current-state reference for the Typert API Gateway. It describes how business services declare unary Remote methods, how the build generates Host and Client contracts, and how calls reuse the Connection RPC and `/api` route. Session events, incremental data, and other streaming protocols are outside this document's scope; they may use the same Connection but do not use Remote method descriptors.

## Programming model

Business services use `@Remote` or `@RemoteScope` to select the methods exposed to the Client. Unmarked methods do not enter the generated Client types or runtime contributions and cannot be called through `ctx.remote`.

`@Remote` denotes calling a Cordis service registered on the root Host Context. Complex Host objects cannot cross the wire directly; the business package must declare their association with a wire identity through `TypertLookupMap` and register a default resolution provider with `ctx.typert.lookups` at runtime. For example, an `Agent` parameter named `agent` in the Host signature produces an `agentId` wire field, and the Gateway resolves that id to a Host object before invoking the business method. Host composition can use `ctx.typert.lookups.configure()` to override the resolution policy for a lookup key without changing the parameter name, wire field, or canonical type symbol owned by the business package.

`@RemoteScope(key)` first resolves an identity to a scoped Context through `ctx.typert.contexts`, then obtains the service from that Context and invokes the method. It applies when the method itself depends on scoped composition and does not need to receive objects such as `Agent` explicitly.

Services normally extend `TypertRemoteService` so the constructor explicitly binds the Cordis service key and default Remote namespace. A service that already has another base class can instead declare `readonly typertRemote = bindTypertRemote(this, serviceKey)`; both forms leave an inspectable public binding and do not depend on the compiler injecting a symbol into the constructor.

```ts
import type { Agent } from '@freddie/freddie-agent'
import { TypertRemoteService, Remote, RemoteScope } from '@freddie/freddie-typert-protocol'
import type { Context } from '@freddie/cordis'

export interface CreateGoalRequest {
  objective: string
}

export interface CreateGoalResult {
  accepted: boolean
}

export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @Remote('create')
  createForClient(
    agent: Agent,
    request: CreateGoalRequest,
    signal: AbortSignal,
  ): CreateGoalResult {
    signal.throwIfAborted()
    return this.create(agent, request)
  }

  @RemoteScope('agent', 'current')
  currentForClient(): CreateGoalResult {
    return { accepted: true }
  }

  private create(_agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    return { accepted: request.objective.length > 0 }
  }
}
```

Remote methods may return a value synchronously or return a Promise. For cooperative cancellation, the final parameter in the Host signature must be `signal: AbortSignal` using the global type; it is recorded in the descriptor instead of entering `args`, while the generated Client method accepts an optional final `AbortSignal`.

The Client uses concrete functions on ordinary objects, not a JavaScript Proxy. Direct and scoped calls appear under `ctx.remote.<namespace>` and `agentCtx.remote.<namespace>`. Each namespace is a traced Cordis child Service registered as `remote.<namespace>`; the Client assembly mounts contributions through `ctx.remote.$mount()`, and the namespace unloads after its last method is withdrawn. Dependency declarations belong to the actual caller: only a business package that reads `ctx.remote.<namespace>` or `agentCtx.remote.<namespace>` declares both `remote` and `remote.<namespace>` in its own `inject`; assemblies that only mount contributions and higher-level runtimes that do not call that namespace do not declare the namespace dependency on the business package's behalf. When an `@Remote` method has exactly one lookup parameter and a same-named `TypertContextMap` uses the same wire identity, the generated scoped signature omits that identity parameter. `@RemoteScope` generates only the scoped invocation interface.

```ts ignore-check
import type { SessionId } from '@freddie/freddie-session/types'
import type { AgentContext } from '@freddie/freddie-client-runtime/client'
import type { Context } from '@freddie/cordis'
import type {} from '@freddie/freddie-api-remotes/client'

export const inject = ['remote', 'remote.goals']

declare const ctx: Context
declare const agentCtx: AgentContext
declare const agentId: SessionId

await ctx.remote.goals.create(agentId, { objective: 'ship it' })
await agentCtx.remote.goals.create({ objective: 'ship it' })
```

Client applications assemble only `@freddie/freddie-api-remotes`. That package imports the `/remote` subpaths of selected business packages as runtime values, mounts their contributions through `ctx.remote.$mount()`, and re-exports the declaration merges from the same files. Adding a Host Remote package is an explicit choice by the Client composition owner; business components do not need to load the Typert Gateway or the business package's Remote JS separately.

The `api-remotes` assembly and the `ctx.remote` contract are React-independent; the Host methods visible to any Client assembly are limited to the Remote methods selected at generation time.

## Component responsibilities

| Location | Package or entry | Responsibility |
|---|---|---|
| Shared | `@freddie/freddie-typert-protocol` | Declares decorators, Gateway bindings, merge-extensible protocol maps, invocation descriptors, and provider types; starts no TypeScript analysis and registers no Cordis services |
| Build | `@freddie/freddie-typert-generator` | Strictly analyzes Remote signatures, the type graph, lookups, Contexts, and source locations from the Host `ts.Program`, then generates Host and Host-for-Client artifacts |
| Host | `@freddie/freddie-typert-registry` and Loader | Places generated Host descriptors, schemas, and business-package registrations in `ctx.typert`, and holds lookup and Context providers |
| Host | `@freddie/freddie-api-remotes` | Owns the application Agent/Session identity policy and configures the corresponding Typert lookups |
| Host | `@freddie/freddie-api-gateway` | Provides `ctx.typertGateway`, claims Remote endpoints, resolves objects or Contexts, invokes live Cordis services, and validates request and return values |
| Client | `@freddie/freddie-api-gateway/client` | Provides `ctx.remote` and `remote.<namespace>` child Services, mounts generated descriptors as concrete methods, and initiates, validates, and cancels calls through the Connection |
| Client | `@freddie/freddie-api-remotes/client` | Explicitly selects and mounts the `/remote` contributions allowed by the application and brings the corresponding declaration merges into business code |
| Both | `@freddie/freddie-client-connection` | Provides the RPC carrier, request correlation, trust boundary, cancellation, response envelope, and the `/api` HTTP bridge |

The API Gateway package owns the Host dispatcher and Client Remote endpoint as peer entries, but the two builds never enter the same `ts.Program`. The Host entry does not import the Client Cordis `Context` merge, and the Client entry does not import the Host Gateway service.

## Generation model

The workspace is buildless: there is no TypeScript compiler pass and no separate codegen step. `@Remote`/`@RemoteScope` decorator initializers record the method name and invocation mode directly at module load, in the plain `.js` source; `TypertRemoteService` or `bindTypertRemote()` supplies the explicit service binding. This is the only mode the Gateway runs in — see "SRC development fallback" below for the exact dispatch mechanics, which apply universally rather than as a fallback from a stricter generation pass.

Business packages expose the Host Loader entry through `./typert`, which `@freddie/freddie-typert-loader` imports for every Loader-managed plugin (see [typert-loader](../packages/typert/loader/README.md)). A malformed export fails that package's own activation; failures in one package do not block others from registering.

## Runtime invocation

Remote and API Proxy share the Connection's `/api` route. The Client Remote calls `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)`; the HTTP carrier maps this to `POST /api/<namespace>/<method>`, with a payload containing only a named `args` object.

The Connection performs the unified trust check for `/api` before the HTTP bridge, then dispatches inside the shared FetchHandler in interceptor order. The Typert Gateway claims only two-segment endpoints that have a strict descriptor or active SRC marker; unclaimed requests fall back to the existing API Proxy. The Connection owns transport, RPC ids, response envelopes, and request cancellation, while the Gateway owns only the Remote data protocol and business dispatch. Replacing the Connection carrier in the future does not require changes to Remote descriptors or the Client programming interface.

For every call, the Gateway resolves the descriptor and live service from the current registries instead of caching business objects. It requires the fields in `args` to match the descriptor exactly, validates wire values with codecs, resolves objects or receivers through registered lookup or Context providers, invokes the service method targeted by the binding, and validates the return value. A missing provider, unknown identity, binding mismatch, missing or extra argument, schema failure, or missing method fails before entering or after leaving business code.

The lookup provider's `register()` supplies both the stable declaration and the default resolver; `configure()` supplies a resolver owned by Host composition that may execute asynchronously and is scoped to an effect lifetime. Configuration may precede provider mounting; without a provider, invocation still fails with `lookup-unavailable`, and unloading the configuration restores the provider's default policy. API Remotes owns the standard `agentFor()` semantics for `agent` and `session`: it reuses a live Agent, automatically resumes ordinary cold sessions, deduplicates concurrent resumes, and rejects identities owned by subagent routing; the `session` lookup returns that Agent's Session. The Web API Proxy supplies its Agent defaults and scope setup, then consumes the same resolver for legacy methods. Resume failures and ownership fences pass through unchanged as existing RPC errors rather than being collapsed into the Gateway's `internal` error.

Unloading a Client contribution removes its descriptors and concrete methods together, aborts its in-flight calls, and makes stale method handles retained by external code reject further calls. A strict endpoint withdrawn on the Host also does not degrade to SRC inference, preventing a hot unload from silently weakening validation.

## SRC development fallback

The Host always starts from source (`pnpm freddie web` runs `apps/cli/src/bin.js` directly under Node — no compiler plugin runs). Standard decorator initializers record the method name and invocation mode in a module-private `WeakMap` at import time, while `TypertRemoteService` or `bindTypertRemote()` supplies the explicit service binding; the Gateway constructs its descriptor from this at runtime.

Simple parameter names are parsed from the live function. When a parameter name matches the `parameter` of a registered lookup, such as `agent` or `session`, it uses the lookup's `agentId` or `sessionId` wire field and resolves the object on the Host; other parameters are checked only for cycle-free, JSON-safe data with no special prototype. `@RemoteScope` directly uses the wire field of a registered Host Context provider. This mechanism does not read TypeScript types, generate schemas from types, infer optional parameters, or support destructuring, default values, rest parameters, or duplicate parameter names — the Remote signature discipline in the "Generation model" section above exists because of this.

## Development mode

```sh
pnpm freddie web
```

Both Host and Client packages ship plain `.js` under `src/`, run directly with no build or watch step. Changing a Remote method's implementation, its decorator, or its signature takes effect on the next process restart — there is no separate contract-generation phase to rerun.

## Boundaries

Remote handles only unary method calls with one request and one result. Session event streams, pagination, incremental reduce, projection, and entity substreams require a separate data protocol and registration model; even when they reuse the Connection, they must not masquerade as Remote methods or enter invocation descriptors.

The API layers are organized as `remotes → gateway → connection → webserver`. The BFF and Typert RPC layers live under `packages/api`; Connection and WebServer live at `packages/client/connection` and `packages/host/webserver`. The API Proxy at `packages/host/apiproxy` handles endpoints without Remote descriptors.

Lookup policy is configured per key, so all `agent` or `session` parameters share the cold-resume behavior. Accepting live objects only would require an explicit per-parameter or per-endpoint policy, which does not exist; the business method must not guess whether the object came from restoration.
