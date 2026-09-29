const PACKAGE_NAME = '@freddie/freddie-fs'

export const name = 'fs-invariant'
export const inject = ['invariants']

function validateTarget(target, fail) {
  if (target.targetKey.length === 0) fail('filesystem event targetKey must be non-empty')
  if (target.displayPath.length === 0) fail('filesystem event displayPath must be non-empty')
}

const install = (ctx, fail) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'fs/write-intent'
      && eventName !== 'fs/edit-intent'
      && eventName !== 'fs/observed') return
    validateTarget(args[0], fail)
    if (eventName === 'fs/observed') {
      const observation = args[1]
      switch (observation.kind) {
        case 'present':
          if (observation.version.length === 0) fail('fs/observed present version must be non-empty')
          break
        case 'absent':
          break
        default:
          fail('fs/observed kind must be present or absent')
      }
    }
  }, { global: true })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
