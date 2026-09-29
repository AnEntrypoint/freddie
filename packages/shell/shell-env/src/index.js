import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { FREDDIE_ENV_PREFIX } from '@freddie/freddie-shell'
import { FREDDIE_HOME_ENV, resolveFreddieHome } from '@freddie/freddie-home-paths'

export const name = 'shell-env'
export const inject = []

export const Config = z.object({
  freddieHome: z.string(),
})

const FREDDIE_SHELL_KEY = `${FREDDIE_ENV_PREFIX}SHELL`
const FREDDIE_SESSION_ID_KEY = `${FREDDIE_ENV_PREFIX}SESSION_ID`
const FREDDIE_SESSION_JSONL_KEY = `${FREDDIE_ENV_PREFIX}SESSION_JSONL`
const RESERVED_BASH_ENV_KEYS = new Set([
  FREDDIE_HOME_ENV,
  FREDDIE_SHELL_KEY,
  FREDDIE_SESSION_ID_KEY,
])
const BASH_ENV_KEY_SUFFIX = /^[A-Z][A-Z0-9_]*$/

export class ShellEnvRegistry extends Service {
  contributors = new Map()
  keyOwners = new Map()
  freddieHome

  constructor(ctx, config = {}) {
    super(ctx, 'shellEnv')
    this.freddieHome = resolveFreddieHome(config.freddieHome)
  }

  register(contributor) {
    const dispose = this.ctx.effect(function* () {
      if (contributor.name.trim().length === 0) {
        throw new Error('bash env contributor name must be non-empty')
      }
      if (this.contributors.has(contributor.name)) {
        throw new Error(`bash env contributor "${contributor.name}" is already registered`)
      }

      const variables = Object.entries(contributor.variables)
      for (const [key, variable] of variables) {
        if (!key.startsWith(FREDDIE_ENV_PREFIX)
          || !BASH_ENV_KEY_SUFFIX.test(key.slice(FREDDIE_ENV_PREFIX.length))) {
          throw new Error(`bash env contributor "${contributor.name}" declared invalid key "${key}"`)
        }
        if (RESERVED_BASH_ENV_KEYS.has(key)) {
          throw new Error(`bash env contributor "${contributor.name}" cannot own reserved key "${key}"`)
        }
        if (variable.description.trim().length === 0) {
          throw new Error(`bash env contributor "${contributor.name}" must describe "${key}"`)
        }
        const owner = this.keyOwners.get(key)
        if (owner !== undefined) {
          throw new Error(`bash env key "${key}" is already owned by contributor "${owner}"; contributor "${contributor.name}" cannot also own it`)
        }
      }

      this.contributors.set(contributor.name, contributor)
      for (const [key] of variables) this.keyOwners.set(key, contributor.name)
      yield () => {
        this.contributors.delete(contributor.name)
        for (const [key] of variables) this.keyOwners.delete(key)
      }
    }.bind(this), 'bashEnv.register()')
    return () => void dispose()
  }

  collect(execution) {
    const values = {
      [FREDDIE_HOME_ENV]: this.freddieHome,
      [FREDDIE_SHELL_KEY]: '1',
    }
    if (execution.agent !== undefined) {
      values[FREDDIE_SESSION_ID_KEY] = execution.agent.session.header.id
    }

    for (const contributor of [...this.contributors.values()].sort((left, right) => left.name.localeCompare(right.name))) {
      const resolved = contributor.resolve(execution)
      for (const [rawKey, value] of Object.entries(resolved)) {
        const key = rawKey
        if (!Object.hasOwn(contributor.variables, key)) {
          throw new Error(`bash env contributor "${contributor.name}" returned undeclared key "${key}"`)
        }
        if (typeof value !== 'string') {
          throw new Error(`bash env contributor "${contributor.name}" returned a non-string value for "${key}"`)
        }
        values[key] = value
      }
    }

    return Object.freeze(Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))))
  }

  list() {
    return [...this.contributors.values()]
      .flatMap(contributor => Object.entries(contributor.variables).map(([key, variable]) => ({
        contributor: contributor.name,
        description: variable.description,
        key,
      })))
      .sort((left, right) => left.key.localeCompare(right.key))
  }
}

export function apply(ctx, config = {}) {
  const registry = new ShellEnvRegistry(ctx, config)
  registry.register({
    name: 'session-persistence',
    variables: {
      [FREDDIE_SESSION_JSONL_KEY]: {
        description: 'Absolute target path of the current session JSONL when the active persistence backend provides one.',
      },
    },
    resolve(execution) {
      const agent = execution.agent
      if (agent === undefined) return {}
      const location = ctx.get('sessionPersistence')?.locate(agent.session.header)
      return location?.kind === 'jsonl' ? { [FREDDIE_SESSION_JSONL_KEY]: location.path } : {}
    },
  })
}
