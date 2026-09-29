import { defineStore } from '@freddie/freddie-client-runtime/client'

export const FLAT_SESSION_ORDER_KEY = '__flat_session_order__'

export function createWorkspaceViewStore() {
  return defineStore({
    init: () => ({
      groupBy: 'workspace',
      orderBy: 'updated',
      groupExpansion: {},
      sessionOrderByAccount: {},
      sessionUpdatedAtByAccount: {},
    }),
    persist: 'dsh.workspace.view.v5',
    actions: {
      setGroupBy: (d, mode) => { d.groupBy = mode },
      setOrderBy: (d, mode) => { d.orderBy = mode },
      setGroupExpanded: (d, key, expanded) => { d.groupExpansion[key] = expanded },
      retainAccountKeys: (d, workspaceKeys) => {
        const retained = new Set(workspaceKeys)
        d.groupExpansion = Object.fromEntries(
          Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)),
        )
        d.sessionOrderByAccount = Object.fromEntries(
          Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key)),
        )
        d.sessionUpdatedAtByAccount = Object.fromEntries(
          Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key)),
        )
      },
      syncSessionOrderAccount: (d, accountKey, order, updatedAt) => {
        d.sessionOrderByAccount[accountKey] = order
        d.sessionUpdatedAtByAccount[accountKey] = updatedAt
      },
      setSessionOrder: (d, accountKey, order) => {
        d.sessionOrderByAccount[accountKey] = order
      },
    },
  })
}
