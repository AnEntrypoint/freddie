// freddie case toolset -- the agent's hands on a CRM "case" system of record, plus
// a worker ENQUIRY surface. Agentic code lives here (per the layering mandate);
// the data lives in a thatcher-backed store the host application injects. Nothing
// here is casey-specific: the store, the field/enum config, and the role model all
// arrive via toolCtx + plugin config, so a different application configures the
// same toolset differently.
//
// Two design rules from the re-architecture:
//  - IDENTITY comes from toolCtx (author/role/activeCaseRef/store), never a global
//    singleton, so the agent loop stays identity-blind and a tool answers FOR the
//    asking worker.
//  - ENQUIRY outputs are PROJECTED: a per-case row handed to the model is scrubbed
//    to a whitelist that EXCLUDES external_id/contact_id (a phone number / chat id),
//    so a worker's list -- or a mis-scoped neighbour row -- can never surface PII.

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })

// The default report field set. An app overrides via config (plugins.case.reportKeys)
// so the captured-field vocabulary is configuration, not code.
const DEFAULT_REPORT_KEYS = ['species', 'symptoms', 'location', 'how_to_find', 'affected_count',
  'dead_count', 'onset', 'suspected_disease', 'recent_movement', 'identifying_traits',
  'access_notes', 'farmer_available', 'contact_fallback', 'photos', 'audio', 'notes']

const DEFAULT_STATUS_ENUM = ['new', 'triaging', 'in_progress', 'waiting', 'resolved', 'closed']

// Whitelisted fields a per-case enquiry row may expose to the agent. Deliberately
// EXCLUDES external_id and contact_id (PII). An app may extend via config
// (plugins.case.enquiryProjection) but the PII keys are always stripped.
const DEFAULT_PROJECTION = ['id', 'ref', 'status', 'priority', 'subject', 'summary',
  'case_type', 'tags', 'assignee', 'autonomy', 'species', 'location', 'last_event_at', 'created_at', 'distance_km']
const PII_KEYS = ['external_id', 'contact_id', 'contact', 'handle', 'phone', 'from']

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

// Project a case row for enquiry output: keep only whitelisted keys and NEVER any
// PII key, even if the whitelist or a slimmed report leaked one in.
function projectCase(row, projection) {
  if (!row || typeof row !== 'object') return row
  const out = pick(row, projection)
  for (const k of PII_KEYS) delete out[k]
  return out
}

// Resolve the store from toolCtx, else the plugin-configured fallback. Throws a
// clear error (surfaced to the agent as a tool error) when neither is present.
function storeFrom(ctx, fallback) {
  const s = ctx?.store || fallback?.()
  if (!s) throw new Error('case toolset: no store in toolCtx and no configured fallback store')
  return s
}

// Build the case toolset. Options:
//  - resolveStore():store   -- fallback store when toolCtx carries none (e.g. tests)
//  - config                 -- scopedCfg-like { get(k,d), all() } for reportKeys,
//                              statusEnum, enquiryProjection, actor
//  - slimCase/slimEvent     -- optional projectors the host provides (else identity)
export function buildCaseToolset({ resolveStore = null, config = null, slimCase = (c) => c, slimEvent = (e) => e } = {}) {
  const cfg = config || { get: (_k, d) => d, all: () => ({}) }
  const reportKeys = cfg.get('reportKeys', DEFAULT_REPORT_KEYS)
  const statusEnum = cfg.get('statusEnum', DEFAULT_STATUS_ENUM)
  const projection = cfg.get('enquiryProjection', DEFAULT_PROJECTION)
  const actor = cfg.get('actor', 'agent')
  const terminalStatuses = cfg.get('terminalStatuses', ['resolved', 'closed'])
  // The field that identifies the REPORTER of a case (who messaged it in). A worker's
  // "my cases" itinerary must scope by who REPORTED the case, not who it is assigned
  // to -- the reporter is the channel author (external_id), never an operator assignee,
  // so an assignee-scoped "my cases" returned nothing for the asking worker. Default
  // external_id; a host keys it via plugins.case.reporterField.
  const reporterField = cfg.get('reporterField', 'external_id')

  // A case row scrubbed for enquiry output -- slim first (structured report), then
  // project to the PII-free whitelist.
  const enquiryRow = (c) => projectCase({ ...c, ...slimCase(c) }, projection)

  const tools = []
  const T = (name, schema, handler) => tools.push({ name, toolset: 'cases', schema: { name, ...schema }, handler })

  // ---- core case_* tools (relocated from the host app; store from ctx) ----
  T('case_get',
    { description: 'Fetch a case by id, including its recent timeline events. Use to refresh your view before acting.',
      parameters: { type: 'object', properties: { id: str('Case id') }, required: ['id'] } },
    async ({ id }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const c = await store.getCase(id)
      if (!c) return { error: `no case ${id}` }
      const events = await store.listEvents(id, { limit: 30 })
      // PII projection by caller: a worker-facing status read gets the enquiryRow
      // whitelist (no external_id/contact_id/phone) so a model-narrated status answer
      // can never echo a contact identifier; an operator/dashboard read keeps the full
      // slimCase. Default to the safe (worker) projection when the role is unknown.
      const operator = ctx?.role === 'operator' || ctx?.principal?.role === 'operator' || ctx?.role === 'dashboard'
      return { case: operator ? slimCase(c) : enquiryRow(c), events: events.map(slimEvent) }
    })

  T('case_list',
    { description: 'List cases, optionally filtered by status/channel/assignee/location. Use `location` (a town, area, or province name the person mentions) to find reports in a place -- this is the place-enquiry tool (case_near needs GPS the worker rarely has). Returns most-recently-active first, PII-free.',
      parameters: { type: 'object', properties: {
        status: str('Filter by workflow status', { enum: statusEnum }),
        channel: str('Filter by channel'), assignee: str('Filter by assignee'),
        location: str('A place name (town/area/province) to match reports whose location contains it'),
        limit: { type: 'number', default: 25 },
      } } },
    async ({ status, channel, assignee, location, limit = 25 }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const where = {}
      if (status) where.status = status
      if (channel) where.channel = channel
      if (assignee) where.assignee = assignee
      // A place-name enquiry: match reports whose location contains the token. Rides
      // thatcher's $ilike operator-where (no gazetteer regex -- the model supplies the
      // place). The store's feature-detect shim falls back to a JS contains filter.
      if (location) where.location = { $ilike: `%${String(location).toLowerCase()}%` }
      const rows = await store.listCases(where, { limit })
      // enquiryRow (PII-free) not slimCase -- a worker-facing list must never carry
      // external_id/contact_id/phone.
      return { count: rows.length, cases: rows.map(enquiryRow) }
    })

  T('case_update',
    { description: 'Update editable case fields (subject, summary, priority, tags, assignee). Keep `summary` current -- it is your working memory of the case.',
      parameters: { type: 'object', properties: {
        id: str('Case id'), subject: str('Short human title'),
        summary: str('One-paragraph rolling summary of the case state'),
        priority: str('Priority', { enum: ['low', 'normal', 'high', 'urgent'] }),
        tags: str('Comma-separated tags'), assignee: str('Operator handle, or "agent"'),
      }, required: ['id'] } },
    async ({ id, ...patch }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const clean = pick(patch, ['subject', 'summary', 'priority', 'tags', 'assignee'])
      if (!Object.keys(clean).length) return { error: 'no editable fields supplied' }
      const c = await store.getCase(id)
      if (!c) return { error: `no case ${id}` }
      // Observe mode is operator control: the agent may only observe.
      if (c.autonomy === 'observe') return { error: 'case autonomy is "observe"; agent edits are disabled. Use case_observe to record notes.' }
      const updated = await store.updateCase(id, clean, actor)
      await store.appendEvent(id, { kind: 'action', actor: 'agent', text: `updated ${Object.keys(clean).join(', ')}`, data: clean })
      return { ok: true, case: slimCase(updated) }
    })

  T('case_report',
    { description: 'Record what you have learned about the report, one field at a time, as the person gives it. Pass ONLY the fields you actually learned this turn -- they merge into the running report, so you never lose earlier facts and never repeat a field already given.',
      parameters: { type: 'object', properties: Object.fromEntries([['id', str('Case id')], ...reportKeys.map(k => [k, str(`Report field: ${k}`)])]), required: ['id'] } },
    async ({ id, ...fields }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const incoming = pick(fields, reportKeys)
      if (!Object.keys(incoming).length) return { error: 'no report fields supplied' }
      const res = await store.mergeReport(id, incoming, actor)
      if (res.error === 'observe') return { error: 'case autonomy is "observe"; agent edits are disabled. Use case_observe to record notes.' }
      if (res.error) return { error: res.error }
      await store.appendEvent(id, { kind: 'action', actor: 'agent', text: `recorded report fields: ${Object.keys(incoming).join(', ')}`, data: incoming })
      return { ok: true, report: res.report, fieldsRecorded: Object.keys(incoming) }
    })

  T('case_observe',
    { description: 'Record an observation or internal note on the case timeline WITHOUT replying to the contact.',
      parameters: { type: 'object', properties: { id: str('Case id'), text: str('The observation') }, required: ['id', 'text'] } },
    async ({ id, text }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      await store.appendEvent(id, { kind: 'observation', actor: 'agent', text })
      return { ok: true }
    })

  // ---- ENQUIRY surface (the new worker-facing retrieval, role-scoped, PII-free) ----

  T('case_mine',
    { description: 'List the cases assigned to or claimed by the CURRENT worker. Use when the worker asks about "my cases" or "what am I working on". Returns PII-free rows, most recent first.',
      parameters: { type: 'object', properties: { status: str('Optional status filter', { enum: statusEnum }), limit: { type: 'number', default: 20 } } } },
    async ({ status, limit = 20 }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      // Scope by REPORTER (the channel author), not assignee -- a worker's own cases
      // are the ones they reported. The equality filter already isolates the worker,
      // so no row_access user scope is needed (and external_id is stripped by
      // enquiryRow, so filtering on it never leaks it).
      const where = ctx?.author ? { [reporterField]: ctx.author } : {}
      if (status) where.status = status
      const rows = await store.listCases(where, { limit })
      return { count: rows.length, cases: rows.map(enquiryRow) }
    })

  T('case_today',
    { description: 'List cases created or last active TODAY (the worker\'s "today\'s list"). Returns PII-free rows.',
      parameters: { type: 'object', properties: { mineOnly: { type: 'boolean', default: true, description: 'restrict to the current worker' }, limit: { type: 'number', default: 20 } } } },
    async ({ mineOnly = true, limit = 20 }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const dayStart = ctx?.now ? new Date(ctx.now) : new Date()
      dayStart.setHours(0, 0, 0, 0)
      const since = String(Math.floor(dayStart.getTime() / 1000))   // case timestamps are unix seconds
      const where = { last_event_at: { $gte: since } }
      if (mineOnly && ctx?.author) where[reporterField] = ctx.author   // reporter scope, not assignee
      const rows = await store.listCases(where, { limit: mineOnly ? limit : limit, ...(mineOnly ? {} : { user: ctx?.principal }) })
      return { count: rows.length, cases: rows.map(enquiryRow) }
    })

  T('case_near',
    { description: 'List cases NEAR the worker, by a lat/lon bounding box. Provide the worker\'s lat/lon and a radius (km). Returns PII-free rows.',
      parameters: { type: 'object', properties: {
        lat: { type: 'number', description: 'worker latitude' }, lon: { type: 'number', description: 'worker longitude' },
        radiusKm: { type: 'number', default: 25 }, limit: { type: 'number', default: 20 },
      }, required: ['lat', 'lon'] } },
    async ({ lat, lon, radiusKm = 25, limit = 20 }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      // Bounding box: ~111km per degree latitude; longitude scaled by cos(lat).
      const dLat = radiusKm / 111
      const dLon = radiusKm / (111 * Math.max(0.01, Math.cos(lat * Math.PI / 180)))
      const where = { lat: { $gte: lat - dLat, $lte: lat + dLat }, lon: { $gte: lon - dLon, $lte: lon + dLon } }
      const rows = await store.listCases(where, { limit, user: ctx?.principal })
      const withDist = rows.map(r => ({ ...r, distance_km: haversineKm(lat, lon, Number(r.lat), Number(r.lon)) }))
        .filter(r => !Number.isFinite(r.distance_km) || r.distance_km <= radiusKm)
        .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))
      return { count: withDist.length, cases: withDist.map(enquiryRow) }
    })

  T('case_today_open',
    { description: 'List OPEN, available work the current worker could help with -- unassigned or unresolved cases ("anything I can help with"). Returns PII-free rows.',
      parameters: { type: 'object', properties: { limit: { type: 'number', default: 20 } } } },
    async ({ limit = 20 }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      // Open = status NOT in the terminal set; available = no assignee or 'agent'.
      const where = { status: { $in: statusEnum.filter(s => !terminalStatuses.includes(s)) } }
      const rows = await store.listCases(where, { limit: limit * 3, user: ctx?.principal })
      const available = rows.filter(r => !r.assignee || r.assignee === 'agent' || r.assignee === actor).slice(0, limit)
      return { count: available.length, cases: available.map(enquiryRow) }
    })

  // ---- active-case binding: select / new (explicit) ----

  T('case_select',
    { description: 'Bind the worker\'s ACTIVE case to an existing case (by id or ref), so their subsequent field updates go into THIS case. Use when the worker says which case they are working on. Does NOT create a case.',
      parameters: { type: 'object', properties: { id: str('Case id'), ref: str('Case reference (e.g. CASE-1042-x)') } } },
    async ({ id, ref }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      let c = id ? await store.getCase(id) : null
      if (!c && ref && store.findCaseByRef) c = await store.findCaseByRef(ref)
      if (!c) return { error: `no case found for ${id || ref || '(nothing given)'}` }
      if (store.setActiveCase && ctx?.author) await store.setActiveCase(ctx.author, c.id)
      await store.appendEvent(c.id, { kind: 'observation', actor: 'system', text: `worker ${ctx?.author || 'unknown'} selected this case as active` })
      return { ok: true, activeCase: enquiryRow(c) }
    })

  T('case_new',
    { description: 'Explicitly CREATE a new case and bind it active to the worker. Use ONLY when the worker explicitly asks to start a new case/report -- never to auto-open one. Optionally seed a subject.',
      parameters: { type: 'object', properties: { subject: str('Optional short subject') } } },
    async ({ subject }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      if (!store.createCase) return { error: 'store does not support explicit case creation' }
      const c = await store.createCase({ subject: subject || '', assignee: ctx?.author || actor, channel: ctx?.channel || 'enquiry' })
      if (store.setActiveCase && ctx?.author) await store.setActiveCase(ctx.author, c.id)
      await store.appendEvent(c.id, { kind: 'note', actor: 'system', text: `case explicitly opened by worker ${ctx?.author || 'unknown'}` })
      return { ok: true, activeCase: enquiryRow(c) }
    })

  // ---- service controls the agent can ACT on (opt-out / human handoff) ----
  T('case_stop',
    { description: 'The person asked to STOP receiving messages (opt out). Records the opt-out so no more automatic replies go to them. Use ONLY on a clear opt-out.',
      parameters: { type: 'object', properties: { id: str('Case id') }, required: ['id'] } },
    async ({ id }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const c = await store.getCase(id)
      if (!c) return { error: `no case ${id}` }
      const tags = String(c.tags || '').split(',').map(s => s.trim()).filter(Boolean)
      if (!tags.includes('opted-out')) tags.push('opted-out')
      await store.updateCase(id, { tags: tags.join(',') }, ctx?.principal || undefined)
      await store.appendEvent(id, { kind: 'observation', actor: 'agent', text: 'OPT-OUT: the person asked to stop; no more automatic replies.' })
      return { ok: true }
    })

  T('case_handoff',
    { description: 'The person wants a real person / operator to help. Flags the case for a human and records the request. Use on a clear ask for a person.',
      parameters: { type: 'object', properties: { id: str('Case id') }, required: ['id'] } },
    async ({ id }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const c = await store.getCase(id)
      if (!c) return { error: `no case ${id}` }
      const tags = String(c.tags || '').split(',').map(s => s.trim()).filter(Boolean)
      if (!tags.includes('needs-human')) tags.push('needs-human')
      await store.updateCase(id, { tags: tags.join(',') }, ctx?.principal || undefined)
      await store.appendEvent(id, { kind: 'observation', actor: 'agent', text: 'HANDOFF REQUESTED: the person asked for a real person.' })
      return { ok: true }
    })

  // The agent DECLARES which phase the conversation is now in; the host reads this
  // observation back and applies the durable state transition (dstate). Append-only,
  // like case_intent -- keeps the state I/O in the host, not the tool.
  T('case_stage',
    { description: 'Declare which phase the conversation is now in: greeting (a warm opener), gathering (collecting the report), enquiring (the worker asked about their work), answering (a general question), complete (the report is on record), handoff (a person is needed), or closed (they asked to stop). Call this when the phase changes so you keep your place and never repeat a question.',
      parameters: { type: 'object', properties: {
        to: str('Conversation phase', { enum: ['greeting', 'gathering', 'enquiring', 'answering', 'complete', 'handoff', 'closed'] }),
      }, required: ['to'] } },
    async ({ to }, ctx) => {
      const store = storeFrom(ctx, resolveStore)
      const id = ctx?.activeCaseId
      if (!id) return { error: 'no active case' }
      await store.appendEvent(id, { kind: 'observation', actor: 'agent', text: `STAGE-DECLARED ${to}` })
      return { ok: true, stage: to }
    })

  return tools
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN
  const R = 6371, toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export { projectCase, DEFAULT_PROJECTION, DEFAULT_REPORT_KEYS, PII_KEYS }
