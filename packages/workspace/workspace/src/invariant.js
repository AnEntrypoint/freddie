import { WorkspaceId } from '@freddie/freddie-workspace'

const PACKAGE_NAME = '@freddie/freddie-workspace'

export const name = 'workspace-invariant'
export const inject = ['invariants']

const install = Object.assign(
  (ctx, fail) => {
    ctx.on('domain/changed', (change) => {
      if (change.domain !== 'workspace' || change.table !== 'workspaces') return
      if (change.operation === 'deleted') {
        if (ctx.workspaceRegistry.get(WorkspaceId(change.key)) !== undefined) {
          fail(
            `workspace record '${change.key}' was deleted while the registry cache still `
            + 'publishes it — some write path bypassed ctx.workspaceRegistry',
          )
        }
        return
      }
      if (ctx.workspaceRegistry.get(WorkspaceId(change.key)) === undefined) {
        fail(
          `workspace record '${change.key}' landed durably but the registry cache holds `
          + 'no entity for it — the cache and the domain table have diverged',
        )
      }
    })
  },
  { inject: ['workspaceRegistry'] },
)

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
