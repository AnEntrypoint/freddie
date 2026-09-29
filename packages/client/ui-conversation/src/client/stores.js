import { defineStore } from '@freddie/freddie-client-runtime/client'

export function createChatStore() {
  return defineStore({
    init: () => ({ selection: null, draft: '', view: null, inspect: null }),
    persist: 'dsh.conversation.chat',
    actions: {
      select: (d, target) => { d.selection = target },
      setDraft: (d, text) => { d.draft = text },
      setView: (d, view) => { d.view = view },
      setInspect: (d, target) => { d.inspect = target },
    },
  })
}
