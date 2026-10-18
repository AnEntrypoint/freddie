import { Context } from '@freddie/cordis'
import { scopeOf } from '@freddie/freddie-scope'
import { assertSupportedJsonSchema, defineTool } from '@freddie/freddie-tools'

const DYNAMIC_TOOL = Symbol('cordis-host-runner.dynamic-tool')
const SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null', 'object', 'array', 'json'])
const VALID_TYPES = '\'string\' | \'number\' | \'integer\' | \'boolean\' | \'null\' | \'object\' | \'array\' | \'json\''
const ANNOTATION_KEYS = ['description', 'title', 'default', 'examples']

function isPlainRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null
    || typeof prototype === 'object'
      && Object.getPrototypeOf(prototype) === null
      && hasIntrinsicConstructor(prototype, 'Object')
}

function hasIntrinsicConstructor(prototype, name) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
  const constructor = descriptor?.value
  if (typeof constructor !== 'function') return false
  try {
    return constructor.name === name
      && constructor.prototype === prototype
      && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`
  } catch {
    return false
  }
}

function hasPlainArrayPrototype(value) {
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array')) return false
  const objectPrototype = Object.getPrototypeOf(prototype)
  return typeof objectPrototype === 'object'
    && objectPrototype !== null
    && Object.getPrototypeOf(objectPrototype) === null
    && hasIntrinsicConstructor(objectPrototype, 'Object')
}

function isDensePlainArray(value) {
  if (!Array.isArray(value) || !hasPlainArrayPrototype(value) || Reflect.ownKeys(value).length !== value.length + 1) {
    return false
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return false
  }
  return true
}

function assertSchemaContainerKeys(value, path) {
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key))) {
    throw new Error(`harness.defineTool ${path} must contain only own enumerable string keys`)
  }
}

function cloneJson(value, path) {
  const ancestors = new Set()
  let root
  const assign = (destination, item) => {
    if (destination.kind === 'root') {
      root = item
      return
    }
    if (destination.kind === 'array') {
      destination.target[destination.index] = item
      return
    }
    Object.defineProperty(destination.target, destination.key, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  const reject = (at) => {
    throw new Error(`${at} must be lossless JSON data (objects, arrays, strings, numbers, booleans, null) — `
      + 'not a class instance, function, Map/Set, Date, or undefined. Return a plain object built from the '
      + 'values you need, or `return null` when the caller needs no value back.')
  }

  const tasks = [{ kind: 'visit', value, path, destination: { kind: 'root' } }]
  for (let task = tasks.pop(); task !== undefined; task = tasks.pop()) {
    if (task.kind === 'leave') {
      ancestors.delete(task.source)
      continue
    }
    if (task.kind === 'array-item') {
      if (!Object.hasOwn(task.source, task.index)) reject(task.path)
      tasks.push({
        kind: 'visit',
        value: task.source[task.index],
        path: `${task.path}[${task.index}]`,
        destination: { kind: 'array', target: task.target, index: task.index },
      })
      continue
    }

    const current = task.value
    if (current === null || typeof current === 'string' || typeof current === 'boolean') {
      assign(task.destination, current)
      continue
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) reject(task.path)
      assign(task.destination, current)
      continue
    }
    if (typeof current !== 'object' || ancestors.has(current)) reject(task.path)

    if (Array.isArray(current)) {
      if (!hasPlainArrayPrototype(current) || Reflect.ownKeys(current).length !== current.length + 1) reject(task.path)
      const output = []
      assign(task.destination, output)
      ancestors.add(current)
      tasks.push({ kind: 'leave', source: current })
      for (let index = current.length - 1; index >= 0; index--) {
        tasks.push({ kind: 'array-item', source: current, index, path: task.path, target: output })
      }
      continue
    }
    if (!isPlainRecord(current)) reject(task.path)
    const record = current
    if (Reflect.ownKeys(record).some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(record, key))) {
      reject(task.path)
    }
    const output = {}
    assign(task.destination, output)
    ancestors.add(record)
    tasks.push({ kind: 'leave', source: record })
    const entries = Object.entries(record)
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index]
      if (entry === undefined) continue
      tasks.push({
        kind: 'visit',
        value: entry[1],
        path: `${task.path}.${entry[0]}`,
        destination: { kind: 'object', target: output, key: entry[0] },
      })
    }
  }
  return root
}

function copyAnnotations(value, output, path) {
  if (Object.hasOwn(value, 'description')) output.description = value.description
  if (Object.hasOwn(value, 'title')) output.title = value.title
  if (Object.hasOwn(value, 'default')) output.default = cloneJson(value.default, `harness.defineTool ${path}.default`)
  if (Object.hasOwn(value, 'examples')) output.examples = cloneJson(value.examples, `harness.defineTool ${path}.examples`)
}

function assertSchemaKeys(value, path, allowed) {
  assertSchemaContainerKeys(value, path)
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`harness.defineTool ${path}.${key} is not supported by the unified schema DSL`)
  }
}

function normalizeParameterSchemaSpec(value, path = 'parameters') {
  if (!isPlainRecord(value)) {
    throw new Error(`harness.defineTool ${path} must be a ParameterSchemaSpec object`)
  }
  if (value.type === 'object') {
    assertSchemaKeys(value, path, ['type', 'properties', 'required', 'additionalProperties', ...ANNOTATION_KEYS])
    if (!isPlainRecord(value.properties)) {
      throw new Error(`harness.defineTool ${path}.properties must be an object of schemas`)
    }
    if (Object.hasOwn(value, 'additionalProperties') && value.additionalProperties !== true) {
      throw new Error(`harness.defineTool ${path}.additionalProperties must be true or omitted because the implicit parameter root is open`)
    }
    if (Object.hasOwn(value, 'required') && value.required === undefined) {
      throw new Error(`harness.defineTool ${path}.required must be an array of declared property names`)
    }
    const required = normalizeRequiredNames(value.required, value.properties, `${path}.required`)
    const rootAnnotations = {}
    copyAnnotations(value, rootAnnotations, path)
    return {
      spec: normalizePropertyMap(value.properties, path, required, true),
      ...(Object.keys(rootAnnotations).length === 0 ? {} : { rootAnnotations }),
    }
  }
  return { spec: normalizePropertyMap(value, path, new Set(), false) }
}

function normalizeRequiredNames(value, properties, path) {
  if (value === undefined) return new Set()
  if (!isDensePlainArray(value)) {
    throw new Error(`harness.defineTool ${path} must be an array of declared property names`)
  }
  const names = new Set()
  for (let index = 0; index < value.length; index++) {
    const name = value[index]
    if (typeof name !== 'string') {
      throw new Error(`harness.defineTool ${path} must be an array of declared property names`)
    }
    names.add(name)
    if (!Object.hasOwn(properties, name)) throw new Error(`harness.defineTool ${path} names undeclared property ${JSON.stringify(name)}`)
  }
  return names
}

function assignNormalizedValue(destination, value) {
  if (destination.kind === 'property') {
    Object.defineProperty(destination.target, destination.key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  } else if (destination.kind === 'item') {
    destination.target.items = value
  } else {
    destination.target[destination.index] = value
  }
}

function assignNormalizedMap(destination, value) {
  if (destination.kind === 'root') destination.holder.value = value
  else destination.target.properties = value
}

function normalizePropertyMap(entries, path, requiredNames, raw) {
  const holder = {}
  const ancestors = new Set()
  const tasks = [{
    kind: 'map',
    entries,
    path,
    requiredNames,
    raw,
    destination: { kind: 'root', holder },
  }]
  for (let task = tasks.pop(); task !== undefined; task = tasks.pop()) {
    if (task.kind === 'leave') {
      ancestors.delete(task.value)
      continue
    }
    if (task.kind === 'map') {
      if (ancestors.has(task.entries)) throw new Error(`harness.defineTool ${task.path} is circular`)
      assertSchemaContainerKeys(task.entries, task.path)
      ancestors.add(task.entries)
      const spec = {}
      assignNormalizedMap(task.destination, spec)
      tasks.push({ kind: 'leave', value: task.entries })
      const mapEntries = Object.entries(task.entries)
      for (let index = mapEntries.length - 1; index >= 0; index--) {
        const entry = mapEntries[index]
        if (entry === undefined) continue
        tasks.push({
          kind: 'value',
          value: entry[1],
          path: `${task.path}.${entry[0]}`,
          forceRequired: task.requiredNames.has(entry[0]),
          raw: task.raw,
          parameterProperty: true,
          destination: { kind: 'property', target: spec, key: entry[0] },
        })
      }
      continue
    }

    const { value, path } = task
    if (!isPlainRecord(value)) {
      throw new Error(`harness.defineTool ${path} must be a ParameterSchemaSpec property object`)
    }
    assertSchemaContainerKeys(value, path)
    if (ancestors.has(value)) throw new Error(`harness.defineTool ${path} is circular`)
    ancestors.add(value)
    const requiredKey = task.parameterProperty && !task.raw ? ['required'] : []
    if (task.parameterProperty && task.raw && Object.hasOwn(value, 'required') && value.type !== 'object') {
      throw new Error(`harness.defineTool ${path}.required belongs to the containing raw object schema`)
    }
    if (task.parameterProperty && !task.raw && Object.hasOwn(value, 'required') && value.required !== true) {
      throw new Error(`harness.defineTool ${path}.required must be true when present`)
    }
    const prop = {}
    assignNormalizedValue(task.destination, prop)
    tasks.push({ kind: 'leave', value })
    if (task.forceRequired || value.required === true) prop.required = true
    copyAnnotations(value, prop, path)

    if (Object.hasOwn(value, 'oneOf')) {
      assertSchemaKeys(value, path, ['oneOf', ...requiredKey, ...ANNOTATION_KEYS])
      if (!isDensePlainArray(value.oneOf) || value.oneOf.length < 2) {
        throw new Error(`harness.defineTool ${path}.oneOf must contain at least two schemas`)
      }
      const oneOf = []
      prop.oneOf = oneOf
      for (let index = value.oneOf.length - 1; index >= 0; index--) {
        tasks.push({
          kind: 'value',
          value: value.oneOf[index],
          path: `${path}.oneOf[${index}]`,
          forceRequired: false,
          raw: task.raw,
          parameterProperty: false,
          destination: { kind: 'one-of', target: oneOf, index },
        })
      }
      continue
    }

    if (task.raw && !Object.hasOwn(value, 'type')) {
      assertSchemaKeys(value, path, ANNOTATION_KEYS)
      prop.type = 'json'
      continue
    }
    if (!SCHEMA_TYPES.has(value.type) || task.raw && value.type === 'json') {
      throw new Error(`harness.defineTool ${path} must declare a valid type: ${VALID_TYPES} (got ${JSON.stringify(value.type)})`)
    }
    const type = value.type
    prop.type = type

    switch (type) {
      case 'object': {
        assertSchemaKeys(value, path, ['type', 'properties', 'additionalProperties', ...requiredKey, ...(task.raw ? ['required'] : []), ...ANNOTATION_KEYS])
        if (!task.raw && (!Object.hasOwn(value, 'additionalProperties') || typeof value.additionalProperties !== 'boolean')) {
          throw new Error(`harness.defineTool ${path}.additionalProperties must be explicitly true or false`)
        }
        if (task.raw && Object.hasOwn(value, 'additionalProperties') && typeof value.additionalProperties !== 'boolean') {
          throw new Error(`harness.defineTool ${path}.additionalProperties must be a boolean`)
        }
        if (task.raw && Object.hasOwn(value, 'required') && value.required === undefined) {
          throw new Error(`harness.defineTool ${path}.required must be an array of declared property names`)
        }
        prop.additionalProperties = task.raw ? value.additionalProperties ?? true : value.additionalProperties
        if (Object.hasOwn(value, 'properties')) {
          const properties = value.properties
          if (!isPlainRecord(properties)) throw new Error(`harness.defineTool ${path}.properties must be an object of schemas`)
          const nestedRequired = task.raw
            ? normalizeRequiredNames(value.required, properties, `${path}.required`)
            : new Set()
          tasks.push({
            kind: 'map',
            entries: properties,
            path: `${path}.properties`,
            requiredNames: nestedRequired,
            raw: task.raw,
            destination: { kind: 'properties', target: prop },
          })
        } else if (task.raw && value.required !== undefined) {
          normalizeRequiredNames(value.required, {}, `${path}.required`)
        }
        break
      }
      case 'array':
        assertSchemaKeys(value, path, ['type', 'items', ...requiredKey, ...ANNOTATION_KEYS])
        if (Object.hasOwn(value, 'items')) {
          tasks.push({
            kind: 'value',
            value: value.items,
            path: `${path}.items`,
            forceRequired: false,
            raw: task.raw,
            parameterProperty: false,
            destination: { kind: 'item', target: prop },
          })
        }
        break
      case 'string':
      case 'number':
      case 'integer':
      case 'boolean':
      case 'null':
        assertSchemaKeys(value, path, ['type', 'enum', 'const', ...requiredKey, ...ANNOTATION_KEYS])
        if (Object.hasOwn(value, 'enum')) {
          if (!isDensePlainArray(value.enum) || value.enum.length === 0) {
            throw new Error(`harness.defineTool ${path}.enum must be a non-empty array`)
          }
          prop.enum = cloneJson(value.enum, `harness.defineTool ${path}.enum`)
        }
        if (Object.hasOwn(value, 'const')) prop.const = cloneJson(value.const, `harness.defineTool ${path}.const`)
        break
      case 'json':
        assertSchemaKeys(value, path, ['type', ...requiredKey, ...ANNOTATION_KEYS])
        break
      default:
        throw new Error(`harness.defineTool ${path} must declare a valid type: ${VALID_TYPES}`)
    }
  }
  return holder.value ?? {}
}

function markDynamicTool(tool) {
  Object.defineProperty(tool, DYNAMIC_TOOL, { value: true })
  return tool
}

function assertDynamicTool(tool) {
  if (!isPlainRecord(tool) || tool[DYNAMIC_TOOL] !== true) {
    throw new Error('dynamic tool registration must use a tool returned by harness.defineTool(...)')
  }
}

function isContentBlockShape(value) {
  return isPlainRecord(value) && typeof value.type === 'string'
}

const RETURN_PREVIEW_LIMIT = 120

function describeReturn(value) {
  const json = JSON.stringify(value)
  return json.length > RETURN_PREVIEW_LIMIT ? `${json.slice(0, RETURN_PREVIEW_LIMIT)}…` : json
}

function assertRenderedContent(value) {
  if (Array.isArray(value) && value.every(isContentBlockShape)) {
    return value
  }
  throw new Error(
    `output.render returned ${describeReturn(value)} — it must return an ARRAY of content blocks:\n`
    + '  ✓ return [{ type: \'text\', text: String(value) }]',
  )
}

export function sandboxDefineTool(options) {
  if (!isPlainRecord(options)) throw new Error('harness.defineTool options must be an object')
  const normalized = normalizeParameterSchemaSpec(options.parameters)
  if (!isPlainRecord(options.output)) {
    throw new Error('harness.defineTool output must declare { schema, render, presentationMeta? }')
  }
  const output = options.output
  if (typeof output.render !== 'function') throw new Error('harness.defineTool output.render must be a function')
  if (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function') {
    throw new Error('harness.defineTool output.presentationMeta must be a function when present')
  }
  if (typeof options.execute !== 'function') throw new Error('harness.defineTool execute must be a function')
  const schema = cloneJson(output.schema, 'harness.defineTool output.schema')
  const rawExecute = options.execute
  const rawRender = output.render
  const rawPresentationMeta = output.presentationMeta
  const erasedDefineTool = defineTool
  const tool = erasedDefineTool({
    ...options,
    parameters: normalized.spec,
    output: {
      schema,
      render(args, value) {
        return assertRenderedContent(cloneJson(rawRender(args, value), 'harness.defineTool output.render result'))
      },
      ...rawPresentationMeta !== undefined ? {
        presentationMeta(args, value) {
          return cloneJson(rawPresentationMeta(args, value), 'harness.defineTool output.presentationMeta result')
        },
      } : {},
    },
    async execute(args, exec) {
      return cloneJson(await rawExecute(args, exec), 'harness.defineTool execute result')
    },
  })
  const parameters = { ...tool.parameters, ...normalized.rootAnnotations }
  assertSupportedJsonSchema(parameters)
  return markDynamicTool({
    ...tool,
    parameters,
  })
}

export function normalizeHandler(method, fn) {
  if (typeof method !== 'string' || method.length === 0) {
    throw new Error('harness.handle(method, fn) needs a non-empty string method name')
  }
  if (typeof fn !== 'function') {
    throw new Error(`harness.handle("${method}") needs a handler function as its second argument`)
  }
  const rawHandler = fn
  return {
    method,
    handler: async args =>
      cloneJson(await rawHandler(args), `harness.handle("${method}") result`),
  }
}

export function sandboxRegisterTool(ctx, tool) {
  assertDynamicTool(tool)
  return ctx.tools.register(tool)
}

const CTX_VERBS = new Set(['effect', 'on', 'once', 'provide', 'timeout', 'interval', 'setTimeout', 'setInterval', 'throttle', 'debounce'])
const TIMER_VERBS = new Set(['timeout', 'interval', 'setTimeout', 'setInterval', 'throttle', 'debounce'])

function sandboxTools(ctx) {
  return {
    register: tool => sandboxRegisterTool(ctx, tool),
    schemas: () => ctx.tools.schemas(scopeOf(ctx)),
    get: name => ctx.tools.schemas(scopeOf(ctx)).find(schema => schema.name === name),
  }
}

function denyContext(value, service, reportFailure) {
  if (value instanceof Context) {
    return rejectGuard(reportFailure,
      `service "${service}" returned a cordis Context, which the sandbox does not expose. `
      + 'Operate through your own plugin ctx (ctx.on / ctx.provide / ctx.tools.register) '
      + 'and the services you inject — never another context.',
    )
  }
  return value
}

function guardedService(service, name, reportFailure) {
  return new Proxy(service, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return denyContext(value, name, reportFailure)
      return (...args) => {
        const result = Reflect.apply(value, target, args)
        if (result instanceof Promise) return result.then(v => denyContext(v, name, reportFailure))
        return denyContext(result, name, reportFailure)
      }
    },
  })
}

function declaredInjects(ctx) {
  return new Set(Object.keys(ctx.fiber.inject))
}

function sandboxContext(ctx, reportFailure) {
  const tools = sandboxTools(ctx)
  const declared = declaredInjects(ctx)
  const denyRead = (prop) => {
    if (ctx.get(prop) !== undefined) {
      return rejectGuard(reportFailure,
        `service "${prop}" is not injected. Declare it: inject: ['${prop}', …] on your plugin, `
        + 'so cordis parks this dynamic package if the provider later goes away.',
      )
    }
    return rejectGuard(reportFailure,
      `sandbox ctx does not expose "${prop}". Available: ctx.tools.register / ctx.on / ctx.provide / `
      + 'the timer helpers after injecting timer, and any service you declared in inject. '
      + 'Framework internals (root, fiber, registry, extend, plugin, …) are withheld by design.',
    )
  }
  const readService = (name, requireDeclaration) => {
    if (name === 'tools') return tools
    if (requireDeclaration && !declared.has(name)) return denyRead(name)
    const service = denyContext(ctx.get(name), name, reportFailure)
    if (service === null || (typeof service !== 'object' && typeof service !== 'function')) return service
    return guardedService(service, name, reportFailure)
  }
  const get = name => readService(name, false)
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'tools') return tools
      if (prop === 'get') return get
      if (typeof prop !== 'string') return undefined
      if (CTX_VERBS.has(prop)) {
        return (...args) => {
          if (TIMER_VERBS.has(prop) && !declared.has('timer')) return denyRead('timer')
          const method = ctx[prop]
          return Reflect.apply(method, ctx, args)
        }
      }
      return readService(prop, true)
    },
    set(_target, prop) {
      return rejectGuard(reportFailure, `sandbox ctx is read-only; cannot assign "${String(prop)}"`)
    },
    has: (_target, prop) => prop === 'tools' || prop === 'get'
      || (typeof prop === 'string'
        && ((CTX_VERBS.has(prop) && (!TIMER_VERBS.has(prop) || declared.has('timer'))) || declared.has(prop))),
  })
}

export function isPlugin(value) {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null
    && typeof value.apply === 'function'
}

export function guardedPlugin(plugin, reportFailure) {
  if (typeof plugin === 'function') {
    const functionPlugin = plugin
    return {
      name: pluginName(plugin),
      apply(ctx, config) {
        return functionPlugin(sandboxContext(ctx, reportFailure), config)
      },
    }
  }
  const objectPlugin = plugin
  return {
    ...plugin,
    apply(ctx, config) {
      return objectPlugin.apply(sandboxContext(ctx, reportFailure), config)
    },
  }
}

function rejectGuard(reportFailure, message) {
  const error = new Error(message)
  reportFailure(error)
  throw error
}

export function pluginName(plugin) {
  const named = plugin.name
  if (typeof named === 'string' && named.length > 0) return named
  return '<anonymous>'
}
