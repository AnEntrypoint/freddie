import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './SkillRow.js'
import { en, NS } from './locales.js'

export const inject = ['inputTriggers', 'connection', 'sessions', 'slots', 'locale', 'remote']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-skill: dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'skill', locale: NS },
    webjsxSlot('freddie-skill-row'),
  ))

  const skills = ctx.get('connection').api.skills
  const sessions = ctx.get('sessions')
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
