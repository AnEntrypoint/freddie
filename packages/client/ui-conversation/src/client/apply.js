
import { resolveSlotLabel, webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { resolveWorkspacePath } from '@freddie/freddie-client-runtime/client'
import { createChatStore } from './stores.js'
import { ConversationController, UnsupportedImageMediaTypeError } from './service.js'
import { ComposerBlockRegistry } from './input/blocks.js'
import { InputHub } from './input/hub.js'
import { ComposerSubmissionPolicy } from './input/submission-policy.js'
import './skeleton/InputBar.js'
import './settings/EnterBehaviorRow.js'
import './chat/ChatView.js'
import './chat/StatsLine.js'
import { ApprovalPanel } from './skeleton/ApprovalPanel.js'
import { todoDockEntry } from './skeleton/TodoPanel.js'
import { queueDockEntry } from './queue/QueueDock.js'
import './skeleton/ConversationRoot.js'
import './skeleton/ConversationSession.js'
import { DetailsPanel } from './skeleton/DetailsPanel.js'
import { en, NS } from './locales.js'
import { registerConversationNodes } from './conversation-nodes/register.js'
import { registerChatNodeRenderers } from './chat/register-node-renderers.js'
import { CONVERSATION_SETTINGS_NAMESPACE } from '../submission-settings.js'

export const inject = [
  'slots', 'layout', 'sessions', 'workspaces', 'locale', 'connection', 'remote', 'settingsScope',
  'conversationEvents', 'conversationViews',
]

const ABSENT_NOTICES = {
  getSnapshot: () => null,
  subscribe: () => () => {},
}

const ABSENT_BLOCK = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
}
const EMPTY_LEXICON = new Map()
const ABSENT_LEXICON = {
  getSnapshot: () => EMPTY_LEXICON,
  subscribe: () => () => {},
}
const ABSENT_MENU_LAUNCHER = {
  getSnapshot: () => null,
  subscribe: () => () => {},
}

const CHAT_NODE_INJECT = {
  hooks: {
    turnData: ({ useSession }, nodeKey) => function useTurnData(key) {
      return useSession((snapshot) => {
        const location = snapshot.chat.nodes.get(nodeKey)?.location
        return location?.kind === 'turn' || location?.kind === 'step'
          ? location.turn.data.get(key)
          : undefined
      })
    },
  },
}

function scopedConversation(sessions, id) {
  const scoped = sessions.scope(id)
  if (scoped === undefined) throw new Error(`ui-conversation: session "${id}" resolved no scope`)
  const conversation = scoped.get('conversation')
  if (conversation === undefined) throw new Error('ui-conversation: conversation service unavailable through the session scope')
  return conversation
}

function concreteConversation(ctx) {
  const conversation = ctx.get('conversation')
  if (conversation === undefined) throw new Error('ui-conversation: conversation service unavailable')
  return conversation
}

function selectApproval({ interactions }) {
  return interactions.find((i) => i.kind === 'approval') ?? null
}

export async function apply(ctx, config) {
  const sessions = ctx.sessions
  const workspaces = ctx.workspaces
  const layout = ctx.layout
  const slots = ctx.slots

  registerConversationNodes(ctx)
  registerChatNodeRenderers(ctx)

  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-conversation: dictionaries')

  const t = ctx.locale.bind(NS)

  const chatStore = createChatStore()
  const submissionPolicy = new ComposerSubmissionPolicy(
    ctx.settingsScope.bind({ namespace: CONVERSATION_SETTINGS_NAMESPACE }),
  )

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'composer-enter',
    order: 20,
    locale: NS,
    inject: () => ({
      hooks: { busyEnter: submissionPolicy.busyEnter },
      setBusyEnter: (behavior) => { submissionPolicy.setBusyEnter(behavior) },
    }),
  }, webjsxSlot('freddie-enter-behavior-row')))

  const chatScrollPositions = new Map()

  const viewTabs = () => {
    const tabs = []
    for (const entry of slots.entries('conversation.view')) {
      /* v8 ignore next */
      if (entry.options.id === undefined) continue
      tabs.push({ id: entry.options.id, label: resolveSlotLabel(entry.options.label) ?? entry.options.id })
    }
    return tabs
  }
  const views = {
    list: viewTabs,
    subscribe: (fn) => slots.subscribe('conversation.view', fn),
    version: () => slots.getVersion('conversation.view'),
  }

  const inputHub = new InputHub(sessions, ctx, t)

  const composerBlocks = new ComposerBlockRegistry()

  await ctx.plugin(ConversationController, { input: inputHub, blocks: composerBlocks })

  ctx.effect(() => sessions.provide({
    hooks: ['input'],
    props: ['inputActions'],
    resolve: (binding) => {
      const shell = inputHub.shellFor(binding)
      return {
        hooks: { input: shell.state },
        props: { inputActions: shell.actions },
      }
    },
  }), 'ui-conversation: input standard-kit provider')

  slots.register({
    name: 'conversation',
    locale: NS,
    children: {
      'conversation.session': { kind: 'single', scope: 'session' },
      'conversation.session.header': { kind: 'single', scope: 'session' },
      'conversation.composer': { kind: 'chain', scope: 'session' },
      'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
      'conversation.input.overlay': { kind: 'list', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
      'conversation.composer.dock': { kind: 'list', scope: 'session' },
      'conversation.input.left': { kind: 'list', scope: 'session' },
      'conversation.input.right': { kind: 'list', scope: 'session' },
      'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
      'conversation.hero.workspace': { kind: 'single', scope: 'root' },
      'conversation.hero.agentPreset': { kind: 'single', scope: 'root' },
    },
    inject: (sessionId) => ({
      hooks: { composerBlock: sessionId === undefined ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },
      selectWorkspace: async (workspaceId) => {
        const nextId = await workspaces.connectWorkspace(workspaceId)
        if (sessionId !== undefined && nextId !== sessionId) {
          const from = inputHub.shell(sessionId)
          const draft = from.snapshot.draft
          const imageIds = from.snapshot.imageIds
          const next = inputHub.shell(nextId)
          if (imageIds.length === 0 || next.addImages(imageIds)) {
            if (draft !== '') {
              next.setDraft(draft)
              from.setDraft('')
            }
            if (imageIds.length > 0) {
              for (const id of imageIds) from.removeImage(id)
            }
          }
        }
        sessions.open(nextId)
      },
    }),
  }, webjsxSlot('freddie-conversation-root'))

  slots.register({
    name: 'conversation.session',
    children: {
      'conversation.view': { kind: 'list', scope: 'session' },
    },
    store: chatStore,
    inject: (sessionId, _actions) => {
      const conversation = concreteConversation(ctx)
      return {
        views,
        releaseSessionImages: (id) => { conversation.releaseSessionImages(id) },
        bindDraftMirror: write => inputHub.shell(sessionId).bindMirror(write),
      }
    },
  }, webjsxSlot('freddie-conversation-session'))

  slots.register({
    name: 'conversation.session.header',
    locale: NS,
    children: {
      'conversation.session.header.lineage': { kind: 'single', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
    store: chatStore,
    inject: () => ({
      views,
      open: (id) => { sessions.open(id) },
    }),
  }, webjsxSlot('freddie-conversation-session-header'))

  slots.register({
    name: 'conversation.composer.bar',
    locale: NS,
    children: {
      'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
      'conversation.input.plan': { kind: 'single', scope: 'session' },
      'conversation.input.model': { kind: 'single', scope: 'session' },
    },
    inject: (sessionId) => {
      if (sessionId === undefined) {
        return {
          keyboard: undefined,
          addImages: undefined,
          removeImage: undefined,
          draftImages: undefined,
          resolveSubmitMode: (running, gesture, steeringAvailable) =>
            submissionPolicy.resolve(running, gesture, steeringAvailable),
          toggleCommandMenu: undefined,
          stop: undefined,
          command: undefined,
          hooks: { notices: ABSENT_NOTICES, lexicon: ABSENT_LEXICON, menuLauncher: ABSENT_MENU_LAUNCHER },
        }
      }
      const conversation = concreteConversation(ctx)
      const shell = inputHub.shell(sessionId)
      const inputTriggers = inputHub.inputTriggers(sessionId)
      return {
        keyboard: shell,
        addImages: (files) => {
          try {
            const images = conversation.createDraftImages(files)
            if (!shell.addImages(images.map(image => image.id))) {
              conversation.releaseDraftImages(images)
            }
            return null
          } catch (error) {
            if (error instanceof UnsupportedImageMediaTypeError) {
              return t('image.unsupportedType')
            }
            return error instanceof Error ? error.message : String(error)
          }
        },
        removeImage: (id) => {
          conversation.releaseDraftImage(id)
          shell.removeImage(id)
        },
        draftImages: ids => conversation.draftImages(ids),
        resolveSubmitMode: (running, gesture, steeringAvailable) =>
          submissionPolicy.resolve(running, gesture, steeringAvailable),
        toggleCommandMenu: inputTriggers === undefined
          ? undefined
          : (selection) => {
            shell.dismissPopup()
            const snapshot = shell.snapshot
            inputTriggers.toggleSource('command', {
              trigger: '/',
              query: '',
              quoted: false,
              position: snapshot.draft.slice(0, selection.start).trim() === '' ? 'leading' : 'inline',
              span: { ...selection, draftRev: snapshot.draftRev },
            })
          },
        stop: () => {
          scopedConversation(sessions, sessionId).cancel().catch(() => {
          })
        },
        command: async (line) => {
          const session = sessions.binding(sessionId)?.session
          if (session === undefined) return false
          const result = await session.command(line)
          return result.ok && result.value.matched
        },
        hooks: {
          notices: shell.notices,
          lexicon: shell.lexicon,
          menuLauncher: inputTriggers?.launcher ?? ABSENT_MENU_LAUNCHER,
        },
      }
    },
  }, webjsxSlot('freddie-input-bar'))

  slots.register({ name: 'conversation.composer', select: selectApproval, priority: 1, locale: NS }, ApprovalPanel)

  slots.register({
    name: 'conversation.view',
    id: 'chat',
    order: 0,
    label: () => t('view.chat'),
    locale: NS,
    children: {
      'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: CHAT_NODE_INJECT },
      'conversation.message.images': { kind: 'single', scope: 'session' },
    },
    store: chatStore,
    inject: (sessionId, actions) => {
      const conversation = concreteConversation(ctx)
      const scoped = scopedConversation(sessions, sessionId)
      return {
        openDetails: (target) => {
          actions.select(target)
          layout.openDetails()
        },
        fileMentions: owner => ctx.get('chatFileMentions')?.forClosing(owner),
        openFile: (path) => {
          const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
          return workspaces.openPath(resolveWorkspacePath(cwd, path))
        },
        loadOlder: () => { void scoped.loadOlder() },
        loadImage: attachment => conversation.resolveImage(sessionId, attachment),
        inspectCall: (callId) => {
          actions.setInspect({ callId })
          actions.setView('trajectory')
        },
        chatScroll: {
          save: (position) => {
            if (position === null) chatScrollPositions.delete(sessionId)
            else chatScrollPositions.set(sessionId, position)
          },
          read: () => chatScrollPositions.get(sessionId) ?? null,
        },
        mountedRowBudget: config.mountedRowBudget,
        forkAt: (seq) => {
          sessions.fork({ sessionId, atSeq: seq, increaseTitle: true })
            .then((childId) => { sessions.open(childId) })
            .catch(() => {
            })
        },
      }
    },
  }, webjsxSlot('freddie-chat-view'))

  slots.register({ name: 'conversation.composer.dock', id: 'stats', order: 0, locale: NS }, webjsxSlot('freddie-stats-line'))

  ctx.plugin(todoDockEntry)

  ctx.plugin(queueDockEntry)

  slots.register({
    name: 'details',
    locale: NS,
    children: {
      'conversation.details.tool': { kind: 'single', scope: 'session' },
    },
    store: chatStore,
    inject: () => ({
      closeDetails: () => { layout.closeDetails() },
    }),
  }, DetailsPanel)

}
