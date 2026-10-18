import { createSnapshotStore, defineStore } from '@freddie/freddie-client-runtime/client'

export function createChatStore() {
  const backing = defineStore({
    init: () => ({ selection: null, draft: '', view: null, inspect: null }),
    persist: 'dsh.conversation.chat',
    actions: {
      select: (d, target) => { d.selection = target },
      setDraft: (d, text) => { d.draft = text },
      setView: (d, view) => { d.view = view },
      setInspect: (d, target) => { d.inspect = target },
    },
  })
  return {
    ...backing,
    create(scopeKey) {
      const persisted = backing.create(scopeKey)
      const initial = persisted.getSnapshot()
      const viewing = createSnapshotStore({
        selection: initial.selection,
        view: initial.view,
        inspect: initial.inspect,
      })
      persisted.subscribe(() => {
        const current = persisted.getSnapshot()
        viewing.update((draft) => {
          draft.selection = current.selection
          draft.view = current.view
          draft.inspect = current.inspect
        })
      })
      return {
        getSnapshot: viewing.getSnapshot,
        subscribe: viewing.subscribe,
        store: viewing,
        actions: {
          select: persisted.actions.select,
          setView: persisted.actions.setView,
          setInspect: persisted.actions.setInspect,
        },
        clearPersisted: persisted.clearPersisted,
        readDraft: () => persisted.getSnapshot().draft,
        writeDraft: persisted.actions.setDraft,
      }
    },
  }
}
