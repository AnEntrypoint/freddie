import { assertSupportedJsonSchema } from './json-schema.js'

const IDENTIFIER = /^[\p{XID_Start}_]\p{XID_Continue}*$/u

function isBareIdentifier(name) {
  return IDENTIFIER.test(name) && name.normalize('NFKC') === name
}

const RESERVED = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
  '__debug__',
])

const TYPING_ORDER = ['Any', 'Literal', 'NotRequired', 'Protocol', 'TypedDict']

function pad(indent) {
  return '    '.repeat(indent)
}

const UNPRINTABLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g

const LONE_SURROGATE = /[\ud800-\udfff]/gu

function describe(schema) {
  const description = schema.description
  if (typeof description !== 'string') return undefined
  const collapsed = description
    .replace(/\s+/g, ' ')
    .replace(UNPRINTABLE, char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .replace(LONE_SURROGATE, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .trim()
  return collapsed.length === 0 ? undefined : collapsed
}

function docLines(description, indent) {
  const collapsed = describe({ description })
  if (collapsed === undefined) return []
  const escaped = collapsed.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return [`${pad(indent)}"""${escaped}"""`]
}

function camelCase(raw) {
  const joined = raw
    .split(/[^\p{XID_Continue}]+|_+/u)
    .filter(part => part.length > 0)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')
    .normalize('NFKC')
  return (/^\p{XID_Start}/u.test(joined) ? joined : `Tool${joined}`).normalize('NFKC')
}

const MAX_CLASS_NAME_BASE = 120

const MAX_LIST_NESTING = 180

function capClassNameBase(base) {
  if (base.length <= MAX_CLASS_NAME_BASE) return base
  const capped = base.slice(0, MAX_CLASS_NAME_BASE)
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped
}

function allocateClassName(base, state) {
  const capped = capClassNameBase(base)
  let name = capped
  if (state.usedClassNames.has(name)) {
    let n = state.nextClassCounter.get(capped) ?? 2
    while (state.usedClassNames.has(`${capped}${n}`)) n++
    name = `${capped}${n}`
    state.nextClassCounter.set(capped, n + 1)
  }
  state.usedClassNames.add(name)
  return name
}

function childClassName(base, segment) {
  return capClassNameBase(`${base}${segment}`.normalize('NFKC'))
}

function pyScalar(value) {
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
    return BigInt(value).toString()
  }
  return String(value)
}

function renderConstrainedScalar(node, broad, state) {
  if (node.const !== undefined) {
    state.typing.add('Literal')
    return `Literal[${pyScalar(node.const)}]`
  }
  if (node.enum !== undefined) {
    state.typing.add('Literal')
    return `Literal[${node.enum.map(pyScalar).join(', ')}]`
  }
  return broad
}

function renderType(schema, className, state) {
  const newFrame = (schema, className, listDepth) =>
    ({ schema, className, phase: 'start', listDepth, children: [], childIndex: 0, childTypes: [], entries: [] })
  try {
    assertSupportedJsonSchema(schema)
    const frames = [newFrame(schema, className, 0)]
    let result
    /* jscpd:ignore-start -- the explicit-stack walk skeleton deliberately parallels
       ts-types.js's renderSupportedSchema; the two sibling renderers keep symmetric shapes. */
    const finish = (type) => {
      frames.pop()
      const parent = frames.at(-1)
      if (parent === undefined) result = type
      else parent.childTypes.push(type)
    }

    while (frames.length > 0) {
      const frame = frames.at(-1)
      /* v8 ignore next -- the loop condition guarantees a current frame. */
      if (frame === undefined) break

      if (frame.phase === 'children') {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex]
          /* v8 ignore next -- childIndex is bounded by children.length. */
          if (child === undefined) throw new Error('missing python render child')
          frame.childIndex++
          frames.push(newFrame(child.schema, child.className, child.listDepth))
          continue
        }
        if (frame.kind === 'oneOf') {
          let union = ''
          for (const [index, childType] of frame.childTypes.entries()) {
            union = index === 0 ? childType : `${union} | ${childType}`
          }
          finish(union)
          continue
        }
        /* jscpd:ignore-end */
        if (frame.kind === 'array') {
          /* v8 ignore next -- the ?? arm needs a childless array frame, which start never builds. */
          finish(`list[${frame.childTypes[0] ?? 'Any'}]`)
          continue
        }
        const node = frame.node
        const name = frame.allocated
        /* v8 ignore next -- typeddict frames always set node and allocated at start. */
        if (node === undefined || name === undefined) throw new Error('missing typeddict frame state')
        const required = new Set(node.required)
        const lines = [`class ${name}(TypedDict):`]
        for (let index = 0; index < frame.entries.length; index++) {
          const entry = frame.entries[index]
          const fieldType = frame.childTypes[index]
          /* v8 ignore next -- entries and childTypes correspond one-to-one. */
          if (entry === undefined || fieldType === undefined) throw new Error('missing typeddict field type')
          const [field, fieldSchema] = entry
          const description = describe(fieldSchema)
          if (description !== undefined) lines.push(`${pad(1)}# ${description}`)
          if (required.has(field)) {
            lines.push(`${pad(1)}${field}: ${fieldType}`)
          } else {
            state.typing.add('NotRequired')
            lines.push(`${pad(1)}${field}: NotRequired[${fieldType}]`)
          }
        }
        if (node.additionalProperties !== false) {
          lines.push(`${pad(1)}# Additional keys beyond those declared are allowed.`)
        }
        if (lines.length === 1) lines.push(`${pad(1)}pass`)
        state.classes.push(lines.join('\n'))
        finish(name)
        continue
      }

      frame.phase = 'children'
      const node = frame.schema
      if (node.oneOf !== undefined) {
        frame.kind = 'oneOf'
        frame.children = node.oneOf.map((branch, index) => ({ schema: branch, className: childClassName(frame.className, `${index + 1}`), listDepth: frame.listDepth }))
        continue
      }
      if (node.type === undefined) {
        state.typing.add('Any')
        finish('Any')
        continue
      }
      switch (node.type) {
        case 'string': finish(renderConstrainedScalar(node, 'str', state)); break
        case 'number': finish(renderConstrainedScalar(node, 'float', state)); break
        case 'integer': finish(renderConstrainedScalar(node, 'int', state)); break
        case 'boolean': finish(renderConstrainedScalar(node, 'bool', state)); break
        case 'null': finish('None'); break
        case 'array': {
          if (node.items === undefined) {
            state.typing.add('Any')
            finish('list[Any]')
            break
          }
          if (frame.listDepth >= MAX_LIST_NESTING) {
            state.typing.add('Any')
            finish('Any')
            break
          }
          frame.kind = 'array'
          frame.children = [{ schema: node.items, className: frame.className, listDepth: frame.listDepth + 1 }]
          break
        }
        case 'object': {
          const entries = Object.entries(node.properties ?? {})
          if (className === '' || !entries.every(([name]) => isBareIdentifier(name) && !RESERVED.has(name) && !(name.startsWith('__') && !name.endsWith('__')))) {
            state.typing.add('Any')
            finish('dict[str, Any]')
            break
          }
          if (entries.length === 0 && node.additionalProperties !== false) {
            state.typing.add('Any')
            finish('dict[str, Any]')
            break
          }
          frame.kind = 'typeddict'
          frame.node = node
          frame.allocated = allocateClassName(frame.className, state)
          state.typing.add('TypedDict')
          frame.entries = entries
          /* v8 ignore next -- allocated is always set before children are built. */
          frame.children = entries.map(([field, child]) => ({ schema: child, className: childClassName(frame.allocated ?? '', camelCase(field)), listDepth: 1 }))
          break
        }
        /* v8 ignore next 4 -- assertSupportedJsonSchema narrowed this closed type union. */
        default: {
          state.typing.add('Any')
          finish('Any')
        }
      }
    }
    /* v8 ignore next -- every root frame produces one expression. */
    return result ?? 'Any'
  } catch {
    state.typing.add('Any')
    return 'Any'
  }
}

export function jsonSchemaToPy(schema) {
  return renderType(schema, '', { classes: [], usedClassNames: new Set(), nextClassCounter: new Map(), typing: new Set() })
}

const SDK_INSTRUCTIONS = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` — the body of an async Python function (top-level \`await\` and \`return\` both work) — and \`description\`, a short summary of what the program does. At run time exactly two of the names declared below are bound: \`tools\` and \`ToolCallError\`. Everything else is a STATIC STUB describing argument and return types — in particular the \`TypedDict\` classes do NOT exist at run time, so build arguments as plain \`dict\`/\`list\` JSON values: \`await tools.name({"field": 1})\`, never \`FooArgs(field=1)\`, which raises \`NameError\`. Inside the program:

- Call tools as \`await tools.name(args)\` — subscript access for exotic, reserved, or underscore-leading names: \`await tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value (each method's return type below). Tool arguments must be lossless JSON.
- A FAILED tool call raises \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose message is human-readable — wrap in \`try/except\` to handle and continue.
- Independent read-only calls MAY overlap under \`asyncio.gather\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit the run's answer with \`print(...)\` and/or a top-level \`return <value>\`; the returned value must be lossless JSON. Only what you print and return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

The available tools:`

export function renderToolsSdkPy(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const state = { classes: [], usedClassNames: new Set(), nextClassCounter: new Map(), typing: new Set(['Protocol']) }
  const members = []
  let statements = 0
  for (const schema of sorted) {
    const argType = renderType(schema.parameters, `${camelCase(schema.name)}Args`, state)
    const outputType = renderType(schema.output, `${camelCase(schema.name)}Output`, state)
    if (isBareIdentifier(schema.name) && !RESERVED.has(schema.name) && !schema.name.startsWith('_')) {
      const doc = docLines(schema.description, 2)
      members.push(doc.length > 0
        ? `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}:`
        : `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}: ...`)
      members.push(...doc)
      statements += 1
    } else {
      members.push(`${pad(1)}# tools[${JSON.stringify(schema.name)}](args: ${argType}) -> ${outputType}`)
      const description = describe(schema)
      if (description !== undefined) members.push(`${pad(1)}#   ${description}`)
    }
  }
  const bodyLines = statements > 0 ? members : [`${pad(1)}pass`, ...members]
  const body = bodyLines.join('\n')
  const imports = TYPING_ORDER.filter(symbol => state.typing.has(symbol))
  const classBlock = state.classes.length > 0 ? `${state.classes.join('\n\n')}\n\n` : ''
  const errorDeclaration = 'class ToolCallError(Exception):\n    toolName: str'
  const declaration = `from typing import ${imports.join(', ')}\n\n${errorDeclaration}\n\n${classBlock}class Tools(Protocol):\n${body}\n\ntools: Tools`
  return `${SDK_INSTRUCTIONS}\n\n\`\`\`python\n${declaration}\n\`\`\``
}
