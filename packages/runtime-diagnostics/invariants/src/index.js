import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'

export class InvariantError extends Error {
  code = 'INVARIANT'
  packageName

  constructor(packageName, message) {
    super(`invariant violated by "${packageName}": ${message}`)
    this.name = 'InvariantError'
    this.packageName = packageName
  }
}

function compilePatterns(field, values) {
  const seen = new Set()
  return values.map((value) => {
    if (value.length === 0 || value.trim() !== value) {
      throw new Error(`invariants: ${field} entries must be non-blank and have no surrounding whitespace`)
    }
    if (seen.has(value)) {
      throw new Error(`invariants: ${field} contains duplicate regex ${JSON.stringify(value)}`)
    }
    seen.add(value)
    try {
      return new RegExp(value)
    } catch (cause) {
      throw new Error(`invariants: ${field} contains invalid regex ${JSON.stringify(value)}`, { cause })
    }
  })
}

export class InvariantRegistry extends Service {
  static Config = z.object({
    enabled: z.boolean().default(true),
    package_allowlist: z.array(z.string()).default([]),
    package_blocklist: z.array(z.string()).default([]),
  })

  enabled
  ownerCtx
  packageAllowlist
  packageBlocklist
  registrations = new Set()

  constructor(ctx, config = {}) {
    super(ctx, 'invariants')
    this.ownerCtx = ctx
    this.enabled = config.enabled ?? true
    this.packageAllowlist = compilePatterns('package_allowlist', config.package_allowlist ?? [])
    this.packageBlocklist = compilePatterns('package_blocklist', config.package_blocklist ?? [])
  }

  selected(packageName) {
    if (!this.enabled) return false
    if (this.packageAllowlist.length > 0
      && !this.packageAllowlist.some(pattern => pattern.test(packageName))) return false
    return !this.packageBlocklist.some(pattern => pattern.test(packageName))
  }

  register(packageName, installer) {
    if (packageName.length === 0 || packageName.trim() !== packageName || /\s/.test(packageName)) {
      throw new Error('invariants: packageName must be non-blank and contain no whitespace')
    }
    if (this.registrations.has(packageName)) {
      throw new Error(`invariants: package "${packageName}" is already registered`)
    }

    const ctx = this.ownerCtx
    const registrations = this.registrations
    registrations.add(packageName)

    let registration
    try {
      registration = ctx.effect(async () => {
        if (!this.selected(packageName)) {
          return () => {
            registrations.delete(packageName)
          }
        }

        const installInvariant = (childCtx) => (
          installer(childCtx, (message) => {
            throw new InvariantError(packageName, message)
          })
        )
        try {
          const child = ctx.plugin(installer.inject === undefined
            ? installInvariant
            : Object.assign(installInvariant, { inject: installer.inject }))

          try {
            await child
          } catch (error) {
            await child.dispose()
            throw error
          }

          return async () => {
            try {
              await child.dispose()
            } finally {
              registrations.delete(packageName)
            }
          }
        } catch (error) {
          registrations.delete(packageName)
          throw error
        }
      }, `invariants.register(${JSON.stringify(packageName)})`)
    } catch (error) {
      registrations.delete(packageName)
      throw error
    }
    return registration
  }
}

export default InvariantRegistry
