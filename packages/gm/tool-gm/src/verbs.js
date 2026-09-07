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
 * the mounting composition wired.
 * @module @freddie/freddie-tool-gm/verbs
 */

import { defineTool } from '@freddie/freddie-tools'

/**
 * Build every gm-verb tool bound to one `ctx.gm` service instance. `execute`
 * cannot read `ctx` off `exec` (the registry's execution context carries
 * `agent`/`signal`/`token`/`callId`, never a Cordis context), so `gm` (the
 * `Gm` service instance from `@freddie/freddie-gm-client`) is closed over
 * from the owning plugin's `apply(ctx)` instead.
 * @param gm - the `Gm` service instance this composition mounted.
 * @returns the tool definitions, ready for `ctx.tools.register()`.
 */
export function buildGmTools(gm) {
  /**
   * One JSON-body gm-verb tool. `verb` is the real gm spool verb name (never
   * derived from `name` -- gm's own verb naming mixes dashes and underscores
   * with no mechanical rule connecting the two, e.g. `prd-add` vs
   * `git_finalize`, live-verified against gm-mcp's own dispatch.js).
   * `toBody` maps typed args to the verb's real body shape.
   */
  const jsonTool = ({ name, verb, description, parameters, toBody, output }) => {
    return defineTool({
      name,
      description,
      parameters,
      output,
      async execute(args) {
        return gm.call(verb, toBody(args))
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
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
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
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
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
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
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
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
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
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
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
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
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
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const raw = args.timeoutMs === undefined ? args.code : `timeoutMs=${args.timeoutMs}\n${args.code}`
      return gm.call('exec_js', {}, { rawBody: raw })
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
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
  })

  return [
    instructionTool,
    codesearchTool,
    recallTool,
    prdAddTool,
    mutableAddTool,
    transitionTool,
    execJsTool,
    gitFinalizeTool,
  ]
}
