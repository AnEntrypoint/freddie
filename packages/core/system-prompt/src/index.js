import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { AnonymousEntries, NamedEntries, ScopedLayers, scopeTarget } from '@freddie/freddie-scope'

export const PERSONA_SECTION = 'deployment:persona'

export const PERSONA_ORDER = 0

const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/

const GROUP_AT = /^\{\{([^{}]*)\}\}/

export const TOOL_ORDER_REST = '<unlisted-tools>'

function validateToolOrder(toolOrder) {
  if (toolOrder === undefined) return undefined
  const seen = new Set()
  for (const name of toolOrder) {
    if (seen.has(name)) throw new Error(`toolOrder lists "${name}" more than once`)
    seen.add(name)
  }
  if (!seen.has(TOOL_ORDER_REST)) {
    throw new Error(`toolOrder must contain the "${TOOL_ORDER_REST}" rest entry (where unlisted tools are inserted)`)
  }
  return toolOrder
}

function orderTools(tools, toolOrder, knownNames, onUnknown) {
  const reserved = tools.find(tool => tool.name === TOOL_ORDER_REST)
  if (reserved !== undefined) {
    throw new Error(`tool provider returned reserved tool name "${TOOL_ORDER_REST}" (reserved for toolOrder's rest entry)`)
  }
  if (toolOrder === undefined) return tools.sort(compareToolNames)
  const unknown = toolOrder.filter(name => name !== TOOL_ORDER_REST && !knownNames.has(name))
  if (unknown.length > 0) onUnknown(unknown, knownNames)
  const listed = new Set(toolOrder)
  const rest = tools.filter(tool => !listed.has(tool.name)).sort(compareToolNames)
  return toolOrder.flatMap(name =>
    name === TOOL_ORDER_REST ? rest : tools.filter(tool => tool.name === name))
}

function compareToolNames(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

export function renderPrompt(assembly) {
  return assembly.sections
    .map(section => section.interpolate === false ? section.text : interpolate(section, assembly.variables, 'section'))
    .filter(text => text.length > 0)
    .join('\n\n')
}

export function renderContextSnapshot(assembly) {
  return joinContextSections(renderContextSections(assembly))
}

export function joinContextSections(sections) {
  const body = sections.map(section => section.text).join('\n\n')
  if (body.length === 0) return ''
  return `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n${body}`
}

export function renderContextSections(assembly) {
  return assembly.contexts
    .map(context => ({ name: context.name, text: interpolate(context, assembly.variables, 'context') }))
    .filter(section => section.text.length > 0)
}

function interpolate(input, variables, kind) {
  const text = input.text
  let result = ''
  let last = 0
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = GROUP_AT.exec(text.slice(open))
    if (group === null) {
      if (text.indexOf('}}', open + 2) >= 0) {
        throw new Error(`malformed prompt variable reference at "${text.slice(open, open + 16)}…" in ${kind} "${input.name}" (references are complete simple {{name}} groups)`)
      }
      result += text.slice(last, open + 2)
      last = open + 2
      continue
    }
    const name = group[0].slice(2, -2)
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(`malformed prompt variable reference "{{${name}}}" in ${kind} "${input.name}" (variable names match ${String(VARIABLE_NAME)})`)
    }
    if (!Object.hasOwn(variables, name)) {
      const known = Object.keys(variables)
      throw new Error(`unknown prompt variable "{{${name}}}" in ${kind} "${input.name}"; registered variables: ${known.length > 0 ? known.join(', ') : '(none)'}`)
    }
    const value = variables[name]
    if (value === undefined) {
      throw new Error(`prompt variable "{{${name}}}" has no value for this assembly (${kind} "${input.name}")`)
    }
    result += text.slice(last, open) + value
    last = open + group[0].length
  }
  return result + text.slice(last)
}

class PromptLayer {
  sections
  contexts
  runtimeContextSuppressors = new AnonymousEntries()
  toolProviders = new AnonymousEntries()
  variables

  constructor(scope) {
    this.sections = new NamedEntries(name => new Error(scope === undefined
      ? `prompt section "${name}" is already registered (for a per-agent override, register through that agent's \`agent.ctx\` instead)`
      : `prompt section "${name}" is already registered in this scope`))
    this.contexts = new NamedEntries(name => new Error(scope === undefined
      ? `prompt context "${name}" is already registered (for a per-agent override, register through that agent's \`agent.ctx\` instead)`
      : `prompt context "${name}" is already registered in this scope`))
    this.variables = new NamedEntries(name => new Error(scope === undefined
      ? `prompt variable "${name}" is already registered (for a per-agent value, register through that agent's \`agent.ctx\` instead)`
      : `prompt variable "${name}" is already registered in this scope`))
  }

  isEmpty() {
    return this.sections.isEmpty()
      && this.contexts.isEmpty()
      && this.runtimeContextSuppressors.isEmpty()
      && this.toolProviders.isEmpty()
      && this.variables.isEmpty()
  }
}

export class SystemPrompt extends Service {
  static Config = z.object({
    includeHarnessIdentity: z.boolean().default(true),
    includeRuntimeContext: z.boolean().default(true),
    persona: z.string().default(''),
    toolOrder: z.array(z.string()).default(undefined),
  })

  layers = new ScopedLayers(
    scope => new PromptLayer(scope),
    () => { this.ctx.emit('system-prompt/change') },
  )
  toolOrder

  constructor(ctx, config) {
    super(ctx, 'systemPrompt')
    this.toolOrder = validateToolOrder(config.toolOrder)
    if (config.includeHarnessIdentity ?? true) {
      this.section({
        name: 'harness:identity',
        order: -100,
        text: 'You are an AI agent powered by Freddie.',
      })
    }
    this.section({
      name: PERSONA_SECTION,
      order: PERSONA_ORDER,
      text: config.persona ?? '',
    })
    if (!(config.includeRuntimeContext ?? true)) this.suppressRuntimeContext()
  }

  section(section) {
    if (!Number.isFinite(section.order)) {
      throw new TypeError(`prompt section "${section.name}" order must be a finite number`)
    }
    return this.layers.effect(
      this.ctx,
      layer => layer.sections.insert(section.name, section),
      { label: 'systemPrompt.section()' },
    )
  }

  context(context) {
    if (!Number.isFinite(context.order)) {
      throw new TypeError(`prompt context "${context.name}" order must be a finite number`)
    }
    return this.layers.effect(
      this.ctx,
      layer => layer.contexts.insert(context.name, context),
      { label: 'systemPrompt.context()' },
    )
  }

  suppressRuntimeContext() {
    return this.layers.effect(
      this.ctx,
      layer => layer.runtimeContextSuppressors.append(true),
      { label: 'systemPrompt.suppressRuntimeContext()' },
    )
  }

  tools(provider) {
    return this.layers.effect(
      this.ctx,
      layer => layer.toolProviders.append(provider),
      { label: 'systemPrompt.tools()' },
    )
  }

  variable(name, provider) {
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(`invalid prompt variable name "${name}" (must match ${String(VARIABLE_NAME)})`)
    }
    return this.layers.effect(
      this.ctx,
      layer => layer.variables.insert(name, provider),
      { label: 'systemPrompt.variable()' },
    )
  }

  async assemble(context = {}) {
    const scope = context.scope
    const scopeLayers = this.layers.chainLayers(scope)
    const runtimeContextSuppressed = !this.layers.global.runtimeContextSuppressors.isEmpty()
      || scopeLayers.some(layer => !layer.runtimeContextSuppressors.isEmpty())
    const variables = {}
    for (const [name, provider] of this.layers.global.variables.entries()) {
      variables[name] = provider(context)
    }
    for (const layer of scopeLayers) {
      for (const [name, provider] of layer.variables.entries()) {
        variables[name] = provider(context)
      }
    }
    const sectionByName = this.layers.merge(scope, layer => layer.sections)
    const contextByName = this.layers.merge(scope, layer => layer.contexts)
    const providers = [
      ...this.layers.global.toolProviders.values(),
      ...scopeLayers.flatMap(layer => [...layer.toolProviders.values()]),
    ]
    const collected = []
    const knownNames = new Set()
    for (const provider of providers) {
      const result = provider(context)
      const schemas = result.schemas.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters: structuredClone(parameters),
      }))
      const acceptedKnownNames = result.knownNames ?? schemas.map(tool => tool.name)
      collected.push(...schemas)
      for (const name of acceptedKnownNames) knownNames.add(name)
    }
    const sectionDefinitions = [...sectionByName.values()].sort((a, b) => a.order - b.order)
    const completeSections = sectionDefinitions.filter(section => section.complete === true)
    if (completeSections.length > 1) {
      throw new Error(`multiple complete prompt sections are active: ${completeSections.map(section => JSON.stringify(section.name)).join(', ')}`)
    }
    let completeSection
    const sections = sectionDefinitions
      .map((section) => {
        const assembled = {
          name: section.name,
          text: typeof section.text === 'function' ? section.text(context) : section.text,
          ...section.interpolate === false ? { interpolate: false } : {},
        }
        if (section.complete === true) completeSection = { ...assembled }
        return assembled
      })
    const assembly = {
      sections,
      contexts: runtimeContextSuppressed
        ? []
        : [...contextByName.values()]
          .sort((a, b) => a.order - b.order)
          .map(entry => ({
            name: entry.name,
            text: typeof entry.text === 'function' ? entry.text(context) : entry.text,
          })),
      tools: orderTools(collected, this.toolOrder, knownNames, (unknown, known) => {
        this.ctx.logger?.warn?.(`toolOrder names unregistered tool${unknown.length > 1 ? 's' : ''} ${unknown.map(name => `"${name}"`).join(', ')}; skipping this assembly (a hot reload may have dropped a registration). Known tools: ${[...known].sort().join(', ') || '(none)'}`)
      }),
      variables,
    }
    const transformed = await this.ctx.waterfall(
      scopeTarget(this, scope), 'system-prompt/assemble', assembly, context,
      () => Promise.resolve(assembly),
    )
    if (completeSection === undefined && !runtimeContextSuppressed) return transformed
    return {
      ...transformed,
      sections: completeSection === undefined ? transformed.sections : [completeSection],
      contexts: runtimeContextSuppressed ? [] : transformed.contexts,
    }
  }
}

export default SystemPrompt
