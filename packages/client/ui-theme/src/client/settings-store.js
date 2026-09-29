import { defineStore } from '@freddie/freddie-client-runtime/client'

export function createAppearanceRowStore() {
  return defineStore({
    init: () => ({ preference: 'system', revision: -1 }),
    actions: {
      sync: (d, preference, revision) => {
        if (revision <= d.revision) return
        d.preference = preference
        d.revision = revision
      },
    },
  })
}
