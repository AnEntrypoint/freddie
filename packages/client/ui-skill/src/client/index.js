/**
 * Skill reference plugin, browser half: registers the '/' skill source —
 * candidates from the skill.list RPC addressed by the per-call session
 * projection's sessionId (sessions are always agent-backed; the host
 * resolves cwd from the session header). A pick lands the literal `/name `
 * text and the prompt ships the same literal (plain-text-reference decision;
 * see .agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md);
 * determinism
 * lives host-side — the pre-step boundary (`freddie-tool-skill`) recognizes a
 * leading `/name` naming a user-invocable skill and injects the rendered
 * body for every entry point, including `disable-model-invocation` skills the
 * model-side catalog never lists (issue #1470). The RPC rides the plugin's
 * root-context connection captured at registration — the source never reads
 * services off a per-call argument. Draft chip visuals derive from
 * the lexicon scan; this source implements no reference codec.
 *
 * Catalog fetches are cached per session (the small twin of the ui-commands
 * directory): the per-keystroke candidates re-poll filters a settled
 * snapshot locally, so one session costs one RPC. The scope-birth warm hook
 * prewarms the session's key; a preset switch drops that one key (the
 * catalog is the preset's, and a blank session may switch after the warm);
 * connection/reset clears everything — the host
 * catalog may differ across generations. A shared in-flight fetch
 * deliberately outlives any single menu interaction: closing the menu must
 * not kill the prewarm other consumers will hit, so it carries its own
 * abort (fired only on invalidation/teardown) while a candidates caller
 * with an aborted signal just returns early.
 *
 * This browser half also owns the `skill` keyed toolview: a replay-stable
 * accent row derived only from each logged call/result slice.
 */
import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './SkillRow.js'
import { en, NS } from './locales.js'

/** Required services: reference source faces plus the tool-row and locale registries. */
export const inject = ['inputTriggers', 'connection', 'sessions', 'slots', 'locale', 'remote']

/**
 * Client plugin body: register the '/' source, dictionaries, and keyed tool row.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-skill: dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'skill', locale: NS },
    webjsxSlot('freddie-skill-row'),
  ))

  const skills = ctx.get('connection').api.skills
  const sessions = ctx.get('sessions')
  /**
   * One session's catalog fetch: the shared promise plus its own abort handle.
   * @typedef {object} CatalogFetch
   * @property {Promise<Array<{name: string, description: string, modelInvocable: boolean}>>} promise
   * - the in-flight (or already-settled) `skill.list` call for this session.
   * @property {AbortController} abort - cancels this fetch on invalidation or teardown.
   * @property {Array<{name: string, description: string, modelInvocable: boolean}>} [settled]
   * - the resolved skill list, set once `promise` settles successfully.
   */
  /** @type {Map<string, CatalogFetch>} */
  const fetches = new Map()
  const lexiconListeners = new Map()

  const notifyLexicon = (sessionId) => {
    for (const listener of [...(lexiconListeners.get(sessionId) ?? [])]) {
      try {
        listener()
      } catch (error) {
        console.error('[ui-skill] lexicon listener failed:', error)
      }
    }
  }

  const fetchCatalog = (sessionId) => {
    if (sessions.subagentAddress(sessionId) !== undefined) return Promise.resolve([])
    const existing = fetches.get(sessionId)
    if (existing !== undefined) return existing.promise
    const abort = new AbortController()
    const promise = (async () => {
      const { result } = await skills.list({ sessionId }, abort.signal)
      if (!result.ok) throw new Error(`skill.list failed: ${result.error.code}: ${result.error.message}`)
      return result.value.skills
    })()
    const entry = { promise, abort }
    fetches.set(sessionId, entry)
    promise.then(
      (skills) => {
        entry.settled = skills
        notifyLexicon(sessionId)
      },
      () => {
        if (fetches.get(sessionId) === entry) fetches.delete(sessionId)
      },
    )
    return promise
  }

  const invalidate = (key) => {
    const entry = fetches.get(key)
    if (entry === undefined) return
    fetches.delete(key)
    entry.abort.abort()
    notifyLexicon(key)
  }

  const clearAll = () => {
    for (const key of [...fetches.keys()]) invalidate(key)
  }

  const t = ctx.locale.bind(NS)

  const source = {
    trigger: '/',
    name: 'skill',
    order: 2,
    async candidates(session, { query, signal }) {
      const skills = await fetchCatalog(session.sessionId)
      if (signal.aborted) return []
      return skills
        .filter(skill => skill.name.startsWith(query))
        .map(skill => ({
          name: skill.name,
          description: skill.modelInvocable ? skill.description : `${t('menu.userOnly')} · ${skill.description}`,
        }))
    },
    warm(session) {
      fetchCatalog(session.sessionId).catch(() => {})
    },
    lexicon(session) {
      return fetches.get(session.sessionId)?.settled?.map(skill => skill.name)
    },
    subscribeLexicon(session, listener) {
      const key = session.sessionId
      const listeners = lexiconListeners.get(key) ?? new Set()
      listeners.add(listener)
      lexiconListeners.set(key, listeners)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) lexiconListeners.delete(key)
      }
    },
    onPick({ candidate }) {
      return { text: `/${candidate.name} ` }
    },
  }
  const inputTriggers = ctx.get('inputTriggers')
  ctx.remote.$on('agent-preset/selected', invalidate)
  ctx.on('connection/reset', clearAll)
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      clearAll()
    }
  }, 'ui-skill: source')
}
