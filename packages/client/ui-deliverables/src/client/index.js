/**
 * Deliverables plugin, browser half: registers the produced-files row into
 * the chat view's turn-tail chain, and provides the `chatFileMentions`
 * service that links inline-code mentions of produced files in the closing
 * prose. All policy lives here — the derivation from the mutation tools'
 * `locations`, the mention matching, the chip cap, and the copy — so
 * composing this plugin out of cordis.yml removes both surfaces entirely;
 * the owning view renders an empty chain and inert prose at zero cost.
 */
import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { en, NS, zh } from './locales.js'
import {
  deliverablesDefinition, producedFileMentions, selectProducedFiles,
} from './turn-deliverables.js'

export { FreddieProducedFiles, fitProducedFiles } from './ProducedFiles.js'
export { producedForClosing } from './turn-deliverables.js'

/** Required services for the tail-slot registration and its dictionaries. */
export const inject = ['slots', 'locale', 'conversationEvents', 'connection']

/**
 * Client plugin body: register the dictionaries and the turn-tail entry.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  const connection = ctx.get('connection')
  ctx.conversationEvents.register(deliverablesDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-deliverables: dictionaries')
  ctx.slots.inject(
    'conversation.chat.turnTail',
    () => ctx.slots.register({
      name: 'conversation.chat.turnTail',
      select: selectProducedFiles,
      locale: NS,
      inject: () => ({
        isLoopback: connection.isLoopback,
        hooks: { hostDescription: connection.hostDescription },
      }),
    }, webjsxSlot('freddie-produced-files')),
  )
  // The prose side of the same vocabulary: the chat view reaches this face
  // via ctx.get, so its absence — this plugin composed out — is the off state.
  const t = ctx.locale.bind(NS)
  // One resolver per turn, rebuilt only when the produced paths, the closing
  // node, or the opener actually change. MarkdownText compares `fileMentions`
  // by IDENTITY (its propsEqual memo guarding #computeChildren), so returning
  // a fresh object per call made that memo miss unconditionally: every
  // assistant markdown block re-parsed its whole document on every render,
  // rebuilding every inline element -- measured live as ~48 fresh `code`
  // nodes per keystroke, and confirmed by instrumenting propsEqual itself
  // (5 of 15 setProps calls differed on `fileMentions` alone).
  //
  // Keyed on `owner.turn`, NOT on `owner`: the caller builds the owner as a
  // fresh `{ turn, seq, openFile }` literal on every render (see
  // AssistantNodeView), so an owner-keyed cache could never hit. `turn` is the
  // stable per-turn object; `seq` and `openFile` ride along as validators so a
  // genuine change still yields a new resolver and a real re-render.
  const mentionsCache = new WeakMap()
  const mentions = {
    forClosing(owner) {
      // Same claim test the turn-tail chain entry runs: no produced files,
      // no vocabulary — the two surfaces agree by construction.
      const paths = selectProducedFiles(owner)
      if (paths === null) return undefined
      const key = paths.join(' ')
      const cached = mentionsCache.get(owner.turn)
      if (cached !== undefined && cached.key === key
        && cached.seq === owner.seq && cached.openFile === owner.openFile) {
        return cached.value
      }
      const value = producedFileMentions(paths, owner.openFile, path => t('produced.open', { name: path }))
      mentionsCache.set(owner.turn, { key, seq: owner.seq, openFile: owner.openFile, value })
      return value
    },
  }
  ctx.provide('chatFileMentions', mentions)
}
