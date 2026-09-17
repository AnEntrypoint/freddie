/**
 * Per-verb typed tool definitions dispatched over `ctx.gm`. Each definition's
 * `parameters`/`output.schema` names the real fields that verb's spool
 * contract actually reads/returns (per gm's own served `instruction` prose
 * and gm-mcp's `dispatch.js` cleaning), replacing the generic MCP bridge's
 * single opaque `(verb, body: any)` shape with real per-verb typing.
 *
 * Session id is NOT taken per-call: `Gm.call` dispatches under the single
 * `sessionId` fixed on its own plugin instance (`@freddie/freddie-gm-client`'s
 * own documented contract — a distinct `ctx.gm` instance per session, never
 * a per-call override), so every tool here shares whichever `gm` instance
 * the mounting composition wired. Project cwd IS per-call: each execute
 * passes `exec.agent.session.header.cwd` so the spool is the session
 * workspace, not the GUI host's `process.cwd()`.
 * @module @freddie/freddie-tool-gm/verbs
 */

import { defineTool } from '@freddie/freddie-tools'
import {
  GM_CODESEARCH_TIMEOUT_MS,
  GM_SCAN_DEPS_TIMEOUT_MS,
  GM_TOOL_TIMEOUT_MS,
  codesearchMetaFromValue,
  compactMetaFromValue,
  presentCodesearchCall,
  presentCodesearchResult,
  presentGenericCall,
  presentInstructionCall,
  presentInstructionResult,
  presentRecallCall,
  presentRecallResult,
  presentTransitionCall,
  presentTransitionResult,
  recallMetaFromValue,
} from './presentation.js'

const jsonOutput = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
}

/**
 * Build every gm-verb tool bound to one `ctx.gm` service instance. `execute`
 * cannot read `ctx` off `exec` (the registry's execution context carries
 * `agent`/`signal`/`token`/`callId`, never a Cordis context), so `gm` (the
 * `Gm` service instance from `@freddie/freddie-gm-client`) is closed over
 * from the owning plugin's `apply(ctx)` instead.
 * @param gm - the `Gm` service instance this composition mounted.
 * @param onProgress - receives one settled daemon result or error with dispatch facts after each GM dispatch.
 * @returns the tool definitions, ready for `ctx.tools.register()`.
 */
export function buildGmTools(gm, onProgress = () => {}) {
  const reportProgress = (dispatch, exec) => {
    try {
      onProgress(dispatch, exec)
    } catch (error) {
      void error
    }
  }

  /**
   * One JSON-body gm-verb tool. `verb` is the real gm spool verb name (never
   * derived from `name` -- gm's own verb naming mixes dashes and underscores
   * with no mechanical rule connecting the two, e.g. `prd-add` vs
   * `git_finalize`, live-verified against gm-mcp's own dispatch.js).
   * `toBody` maps typed args to the verb's real body shape.
   */
  const jsonTool = ({
    name,
    verb,
    description,
    parameters,
    toBody,
    output = jsonOutput,
    presentCall,
    presentResult,
    timeoutMs = GM_TOOL_TIMEOUT_MS,
  }) => {
    return defineTool({
      name,
      description,
      parameters,
      output,
      timeoutMs,
      presentCall,
      presentResult,
      async execute(args, exec) {
        const cwd = exec.agent?.session.header.cwd
        const startedAt = Date.now()
        reportProgress({ verb, status: 'running', startedAt }, exec)
        try {
          const value = await gm.call(verb, toBody(args), {
            signal: exec.signal,
            timeoutMs,
            ...cwd === undefined ? {} : { cwd },
          })
          reportProgress({ verb, status: 'completed', startedAt, finishedAt: Date.now(), value, body: toBody(args) }, exec)
          return value
        } catch (error) {
          reportProgress({ verb, status: 'failed', startedAt, finishedAt: Date.now(), error }, exec)
          throw error
        }
      },
    })
  }

  const instructionTool = jsonTool({
    name: 'gm_instruction',
    verb: 'instruction',
    description: 'Dispatch gm\'s `instruction` verb: read the current phase\'s served orchestration prose, PRD/mutables state, and orient recall hits for the active gm session. First call of a session must include `prompt` (the user request); later calls take none.',
    parameters: {
      prompt: { type: 'string', description: 'The user request; required on the first dispatch of a session, omitted afterward.' },
    },
    toBody: args => (args.prompt === undefined ? {} : { prompt: args.prompt }),
    output: {
      ...jsonOutput,
      presentationMeta: (_args, value) => compactMetaFromValue('gm instruction', value),
    },
    presentCall: presentInstructionCall,
    presentResult: presentInstructionResult,
  })

  const phaseStatusTool = jsonTool({
    name: 'gm_phase_status',
    verb: 'phase-status',
    description: 'Dispatch gm\'s `phase-status` verb: the current gm session\'s phase, phase-transition history, and pending PRD/mutable counts, without the full served orchestration prose `instruction` returns.',
    parameters: {},
    toBody: () => ({}),
    output: {
      ...jsonOutput,
      presentationMeta: (_args, value) => compactMetaFromValue('gm phase-status', value),
    },
    presentCall: () => presentGenericCall('gm phase-status'),
  })

  const codesearchTool = jsonTool({
    name: 'gm_codesearch',
    verb: 'codesearch',
    description: 'Dispatch gm\'s `codesearch` verb: the harness\'s own cached/incremental code index (never raw grep/glob/find for discovery). Returns ranked file:line hits.',
    parameters: {
      query: { type: 'string', required: true, description: 'Natural-language or symbol-level search query.' },
      k: { type: 'number', description: 'Max hits to return.' },
      mode: { type: 'string', description: 'Optional mode override, e.g. "filename" or "dual".' },
      root: { type: 'string', description: 'Absolute path to search a sibling/submodule repo instead of the current project.' },
    },
    toBody: args => ({
      query: args.query,
      ...args.k === undefined ? {} : { k: args.k },
      ...args.mode === undefined ? {} : { mode: args.mode },
      ...args.root === undefined ? {} : { root: args.root },
    }),
    output: {
      ...jsonOutput,
      presentationMeta: (_args, value) => codesearchMetaFromValue(value),
    },
    presentCall: presentCodesearchCall,
    presentResult: presentCodesearchResult,
    timeoutMs: GM_CODESEARCH_TIMEOUT_MS,
  })

  const recallTool = jsonTool({
    name: 'gm_recall',
    verb: 'recall',
    description: 'Dispatch gm\'s `recall` verb: query gm\'s own memory store (prior resolved mutables, corrections, project facts) by semantic similarity.',
    parameters: {
      query: { type: 'string', required: true, description: 'Query to search prior memory for.' },
    },
    toBody: args => ({ query: args.query }),
    output: {
      ...jsonOutput,
      presentationMeta: (_args, value) => recallMetaFromValue(value),
    },
    presentCall: presentRecallCall,
    presentResult: presentRecallResult,
  })

  const prdAddTool = jsonTool({
    name: 'gm_prd_add',
    verb: 'prd-add',
    description: 'Dispatch gm\'s `prd-add` verb: add or rescope one row in the current gm session\'s PRD plan. `id` (kebab-case) is required; a call with no derivable id is rejected.',
    parameters: {
      id: { type: 'string', required: true, description: 'Kebab-case row id.' },
      title: { type: 'string', description: 'Short row title.' },
      subject: { type: 'string', description: 'What the row covers and why.' },
      acceptance: { type: 'string', description: 'Concrete pre/post-conditions the row must satisfy to resolve.' },
      status: { type: 'string', description: 'Row status, e.g. "pending", "done", "resolved", "in-progress".' },
      route_family: { type: 'string', description: 'One of grounding/reasoning/state/execution/boundary/representation/observability.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm prd-add: ${args.id}`),
  })

  const mutableAddTool = jsonTool({
    name: 'gm_mutable_add',
    verb: 'mutable-add',
    description: 'Dispatch gm\'s `mutable-add` verb: record an unresolved unknown or a typed proof obligation (precondition/invariant/postcondition) against a PRD row, never a silent assumption.',
    parameters: {
      id: { type: 'string', required: true, description: 'Kebab-case mutable id.' },
      prd_id: { type: 'string', description: 'PRD row this obligation belongs to.' },
      obligation_kind: { type: 'string', description: 'precondition | invariant | postcondition | resource-bound | type-shape.' },
      subject: { type: 'string', description: 'What is unknown or must hold.' },
      text: { type: 'string', description: 'How it will be witnessed.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm mutable-add: ${args.id}`),
  })

  const prdResolveTool = jsonTool({
    name: 'gm_prd_resolve',
    verb: 'prd-resolve',
    description: 'Dispatch gm\'s `prd-resolve` verb: mark one row in the current gm session\'s PRD plan resolved/done. `id` and non-empty `witness_evidence` are both required -- gm refuses a resolve with no evidence the work is real (a file:line, a codesearch hit, an exec snippet, or a browser page.evaluate result).',
    parameters: {
      id: { type: 'string', required: true, description: 'Kebab-case row id to resolve.' },
      witness_evidence: { type: 'string', required: true, description: 'Concrete evidence the row\'s acceptance criteria is met: file:line | codesearch hit | exec snippet | browser page.evaluate result. Required -- gm rejects an empty/absent value.' },
      commit_comment: { type: 'string', description: 'A commit-message-shaped note explaining what satisfied this row, if applicable.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm prd-resolve: ${args.id}`),
  })

  const mutableResolveTool = jsonTool({
    name: 'gm_mutable_resolve',
    verb: 'mutable-resolve',
    description: 'Dispatch gm\'s `mutable-resolve` verb: discharge one previously-recorded mutable (unresolved unknown or proof obligation) with its witness text.',
    parameters: {
      id: { type: 'string', required: true, description: 'Kebab-case mutable id to resolve.' },
      witness_text: { type: 'string', required: true, description: 'How the obligation was discharged or the unknown resolved. Mapped to the daemon\'s `witness_evidence` field.' },
    },
    toBody: args => ({
      id: args.id,
      witness_evidence: args.witness_text,
    }),
    presentCall: args => presentGenericCall(`gm mutable-resolve: ${args.id}`),
  })

  const transitionTool = jsonTool({
    name: 'gm_transition',
    verb: 'transition',
    description: 'Dispatch gm\'s `transition` verb: advance the current gm session\'s phase (e.g. SPECIFY -> PROVE). Rejected if the named gates are not yet satisfied.',
    parameters: {
      to: { type: 'string', required: true, description: 'Target phase name.' },
    },
    toBody: args => ({ to: args.to }),
    output: {
      ...jsonOutput,
      presentationMeta: (_args, value) => compactMetaFromValue('gm transition', value),
    },
    presentCall: presentTransitionCall,
    presentResult: presentTransitionResult,
  })

  // exec_js is plain-text-body (gm-mcp's PLAIN_TEXT_BODY_VERBS) -- dispatch
  // via gm.call's `rawBody` option instead of jsonTool's JSON-body shape.
  const execJsTool = defineTool({
    name: 'gm_exec_js',
    description: 'Dispatch gm\'s `exec_js` verb: run a JavaScript snippet inside gm\'s own sandboxed execution surface.',
    parameters: {
      code: { type: 'string', required: true, description: 'JavaScript source to execute.' },
      timeoutMs: { type: 'number', description: 'Execution timeout in milliseconds, prefixed as a leading `timeoutMs=<ms>` line per gm\'s own plain-text-body contract.' },
    },
    output: jsonOutput,
    timeoutMs: GM_TOOL_TIMEOUT_MS,
    presentCall: () => presentGenericCall('gm exec_js'),
    async execute(args, exec) {
      const requested = typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) ? args.timeoutMs : 0
      const budget = Math.max(GM_TOOL_TIMEOUT_MS, requested)
      const raw = args.timeoutMs === undefined ? args.code : `timeoutMs=${args.timeoutMs}\n${args.code}`
      const cwd = exec.agent?.session.header.cwd
      const startedAt = Date.now()
      reportProgress({ verb: 'exec_js', status: 'running', startedAt }, exec)
      try {
        const value = await gm.call('exec_js', {}, {
          rawBody: raw,
          signal: exec.signal,
          timeoutMs: budget,
          ...cwd === undefined ? {} : { cwd },
        })
        reportProgress({ verb: 'exec_js', status: 'completed', startedAt, finishedAt: Date.now(), value }, exec)
        return value
      } catch (error) {
        reportProgress({ verb: 'exec_js', status: 'failed', startedAt, finishedAt: Date.now(), error }, exec)
        throw error
      }
    },
  })

  const gitFinalizeTool = jsonTool({
    name: 'gm_git_finalize',
    verb: 'git_finalize',
    description: 'Dispatch gm\'s `git_finalize` verb: add -> commit -> porcelain-gate -> push -> CI-watch, bundled as one call.',
    parameters: {
      message: { type: 'string', required: true, description: 'Commit message.' },
      files: { type: 'array', items: { type: 'string' }, description: 'Specific files to stage; omit to stage everything relevant to the session.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm git_finalize: ${args.message}`),
  })

  const scanDepsTool = jsonTool({
    name: 'gm_scan_deps',
    verb: 'scan_deps',
    description: 'Dispatch gm\'s `scan_deps` verb: scan git-tracked source plus present node_modules for HiddenSpawn-class obfuscated droppers (size-ratio + dense unicode-escape identifier). Body `{}` scans the whole project; `root` scopes the git-tracked half; `full: true` ignores the stamp.',
    parameters: {
      root: { type: 'string', description: 'Optional relative directory scoping the git-tracked-source half. node_modules is always resolved at the project root.' },
      full: { type: 'boolean', description: 'Force a full re-walk ignoring .gm/scan-deps-stamp.json.' },
    },
    toBody: args => ({
      ...args.root === undefined ? {} : { root: args.root },
      ...args.full === undefined ? {} : { full: args.full },
    }),
    presentCall: () => presentGenericCall('gm scan_deps'),
    timeoutMs: GM_SCAN_DEPS_TIMEOUT_MS,
  })

  const dreamPolicyRegisterTool = jsonTool({
    name: 'gm_dream_policy_register',
    verb: 'dream-policy-register',
    description: 'Dispatch gm\'s `dream-policy-register` verb: register a session-owned exploration policy. Set deployed true only for the incumbent policy; replay later accepts its ID rather than caller-supplied policy definitions.',
    parameters: {
      policy: { type: 'object', required: true, description: 'Policy definition containing an opaque id, roots, and max_nodes.', additionalProperties: true },
      deployed: { type: 'boolean', description: 'Whether this policy becomes the session-owned deployed incumbent.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm dream-policy-register: ${args.policy.id}`),
  })

  const dreamEvaluatorReceiptTool = jsonTool({
    name: 'gm_dream_evaluator_receipt',
    verb: 'dream-evaluator-receipt',
    description: 'Dispatch gm\'s `dream-evaluator-receipt` verb: authenticate an evaluator result for a successful discovery dispatch before a discovery record may consume it.',
    parameters: {
      policy_id: { type: 'string', required: true, description: 'Registered GM policy ID.' },
      dispatch_id: { type: 'string', required: true, description: 'Completed GM dispatch receipt ID.' },
      parent_id: { type: 'string', description: 'Optional parent discovery record ID.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm dream-evaluator-receipt: ${args.dispatch_id}`),
  })

  const dreamDiscoveryRecordTool = jsonTool({
    name: 'gm_dream_discovery_record',
    verb: 'dream-discovery-record',
    description: 'Dispatch gm\'s `dream-discovery-record` verb: record one successful GM discovery action with its target, policy, evaluator score, measured cost, and completed dispatch receipt before sealing a replay world.',
    parameters: {
      id: { type: 'string', required: true, description: 'Opaque discovery record ID.' },
      evaluator_receipt_dispatch_id: { type: 'string', required: true, description: 'Dispatch ID returned by gm_dream_evaluator_receipt.' },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm dream-discovery-record: ${args.id}`),
  })

  const dreamWorldSealTool = jsonTool({
    name: 'gm_dream_world_seal',
    verb: 'dream-world-seal',
    description: 'Dispatch gm\'s `dream-world-seal` verb: construct one sealed replay world from completed GM dispatch receipts. The caller supplies only an opaque world ID and prior dispatch IDs; GM derives node outcomes and costs from its ledger.',
    parameters: {
      world_id: { type: 'string', required: true, description: 'Opaque ID for the new sealed world.' },
      discovery_ids: { type: 'array', required: true, description: 'GM discovery record IDs to include in order.', items: { type: 'string' } },
    },
    toBody: args => args,
    presentCall: args => presentGenericCall(`gm dream-world-seal: ${args.world_id}`),
  })

  const dreamReplayTool = jsonTool({
    name: 'gm_dream_replay',
    verb: 'dream-replay',
    description: 'Dispatch gm\'s `dream-replay` verb: evaluate exploration policies only against recorded discovery worlds. Replay executes no tools or evaluators; the incumbent baseline is retained as a candidate and the result includes per-world observed-node, score, and cost evidence.',
    parameters: {
      baseline_policy_id: { type: 'string', required: true, description: 'ID of the deployed baseline policy. It must also appear in policies.' },
      policy_ids: { type: 'array', required: true, description: 'Opaque identifiers of GM-registered candidate policies.', items: { type: 'string' } },
      world_ids: { type: 'array', required: true, description: 'Opaque identifiers of sealed GM discovery worlds.', items: { type: 'string' } },
    },
    toBody: args => ({
      baseline_policy_id: args.baseline_policy_id,
      policy_ids: args.policy_ids,
      world_ids: args.world_ids,
    }),
    output: {
      ...jsonOutput,
      presentationMeta: (args, value) => ({
        dreamReplay: {
          baselinePolicyId: args.baseline_policy_id,
          policyIds: args.policy_ids,
          worldIds: args.world_ids,
          selectedPolicyId: value?.data?.selected_policy_id,
          replayWorldIds: value?.data?.rankings?.flatMap(ranking => ranking.replays ?? []).map(replay => replay.world_id),
        },
      }),
    },
    presentCall: args => presentGenericCall(`gm dream-replay: ${args.baseline_policy_id}`),
  })

  const residualScanTool = jsonTool({
    name: 'gm_residual_scan',
    verb: 'residual-scan',
    description: 'Dispatch gm\'s `residual-scan` verb: the DECIDE→COMPLETE stop-window scan. Writes `.gm/residual-check-fired` for this session so COMPLETE can see the scan ran. Body is empty.',
    parameters: {},
    toBody: () => ({}),
    presentCall: () => presentGenericCall('gm residual-scan'),
  })

  return [
    instructionTool,
    phaseStatusTool,
    codesearchTool,
    recallTool,
    prdAddTool,
    prdResolveTool,
    mutableAddTool,
    mutableResolveTool,
    transitionTool,
    execJsTool,
    gitFinalizeTool,
    scanDepsTool,
    dreamPolicyRegisterTool,
    dreamEvaluatorReceiptTool,
    dreamDiscoveryRecordTool,
    dreamWorldSealTool,
    dreamReplayTool,
    residualScanTool,
  ]
}
