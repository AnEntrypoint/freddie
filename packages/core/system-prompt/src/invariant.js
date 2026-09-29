const PACKAGE_NAME = '@freddie/freddie-system-prompt'
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/

export const name = 'system-prompt-invariant'
export const inject = ['invariants']

function validateAssembly(assembly, fail) {
  const sectionNames = new Set()
  for (const section of assembly.sections) {
    if (section.name.length === 0) fail('assembled section names must be non-empty')
    if (sectionNames.has(section.name)) fail(`assembled section name ${JSON.stringify(section.name)} is duplicated`)
    sectionNames.add(section.name)
    if (typeof section.text !== 'string') fail(`assembled section ${JSON.stringify(section.name)} text must be a string`)
  }

  const contextNames = new Set()
  for (const context of assembly.contexts) {
    if (context.name.length === 0) fail('assembled context names must be non-empty')
    if (contextNames.has(context.name)) fail(`assembled context name ${JSON.stringify(context.name)} is duplicated`)
    contextNames.add(context.name)
    if (typeof context.text !== 'string') fail(`assembled context ${JSON.stringify(context.name)} text must be a string`)
  }

  for (const tool of assembly.tools) {
    if (tool.name.length === 0) fail('assembled tool names must be non-empty')
  }

  for (const [name, value] of Object.entries(assembly.variables)) {
    if (!VARIABLE_NAME.test(name)) fail(`assembled variable name ${JSON.stringify(name)} is invalid`)
    if (value !== undefined && typeof value !== 'string') {
      fail(`assembled variable ${JSON.stringify(name)} must be a string or undefined`)
    }
  }
}

const install = (ctx, fail) => {
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    validateAssembly(assembled, fail)
    return assembled
  }, { global: true, prepend: true })
}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
