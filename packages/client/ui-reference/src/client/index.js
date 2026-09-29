import { formatFileMention } from '@freddie/freddie-file-reference/grammar'
import { en, NS } from './locales.js'

export const inject = [
  'inputTriggers', 'locale', 'remote', 'remote.fileReferences', 'remote.sessionReferenceResolver',
]

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-reference: dictionaries')
  const t = ctx.locale.bind(NS)
  const source = {
    trigger: '@',
    name: 'reference',
    showGroupTitle: false,
    async candidates(session, { query, quoted, signal }) {
      const files = ctx.remote.fileReferences.list(session.sessionId, query, signal).then(
        result => result.ok ? result.value : [],
        () => [],
      )
      const sessions = quoted === true
        ? Promise.resolve([])
        : ctx.remote.sessionReferenceResolver.candidates(session.sessionId, query, signal).then(
          result => result.ok ? result.value : [],
          () => [],
        )
      const [fileItems, sessionItems] = await Promise.all([files, sessions])
      if (signal.aborted) return []
      return [
        ...fileItems.flatMap(candidate => fileCandidate(candidate, quoted === true, t)),
        ...sessionItems.map(candidate => sessionCandidate(candidate, t)),
      ]
    },
    onPick({ candidate }) {
      const value = parseCandidate(candidate.value)
      if (value?.kind === 'file') {
        return value.fileKind === 'directory'
          ? { text: value.mention, continue: true }
          : {
            insert: {
              source: 'reference',
              ref: value.mention,
              label: value.label,
              appearance: 'file',
              clipboardText: value.mention,
            },
          }
      }
      if (value?.kind === 'session') {
        return {
          insert: {
            source: 'reference',
            ref: value.mention,
            label: value.label,
            appearance: 'session',
            clipboardText: value.mention,
          },
        }
      }
      return undefined
    },
    codec: {
      clipboardText: ref => ref,
      serialize: ref => Promise.resolve(ref),
    },
  }
  const inputTriggers = ctx.get('inputTriggers')
  ctx.effect(() => inputTriggers.registerSource(source), 'ui-reference: @ source')
}

function fileCandidate(candidate, preserveQuote, t) {
  const mention = formatFileMention(candidate, preserveQuote)
  if (mention === undefined) return []
  const name = candidate.path.slice(candidate.path.lastIndexOf('/') + 1)
  const directory = candidate.kind === 'directory'
  const value = {
    kind: 'file',
    fileKind: candidate.kind,
    label: name,
    mention,
  }
  return [{
    name: `${t(directory ? 'candidate.folder' : 'candidate.file')} · ${name}${directory ? '/' : ''}`,
    description: candidate.path,
    section: t('section.files'),
    value: JSON.stringify(value),
  }]
}

function sessionCandidate(candidate, t) {
  const location = candidate.cwd ?? t('candidate.noCwd')
  const description = `${candidate.label === candidate.sessionId ? '' : `${candidate.sessionId} · `}${location} · ${new Date(candidate.createdAt).toISOString()}`
  const value = {
    kind: 'session',
    label: candidate.label,
    mention: candidate.mention,
  }
  return {
    name: `${t('candidate.session')} · ${candidate.label}`,
    description,
    section: t('section.sessions'),
    value: JSON.stringify(value),
  }
}

function parseCandidate(value) {
  if (value === undefined) return undefined
  return JSON.parse(value)
}
