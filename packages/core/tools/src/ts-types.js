import { assertSupportedJsonSchema } from './json-schema.js'

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function renderKey(name) {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name)
}

function pad(indent) {
  return '  '.repeat(indent)
}

function docLines(description, indent) {
  if (typeof description !== 'string' || description.length === 0) return []
  const collapsed = description.replace(/\s+/g, ' ').trim()
  return [`${pad(indent)}/** ${collapsed.replaceAll('*/', String.raw`*\/`)} */`]
}

function renderScalar(value) {
  return JSON.stringify(value)
}

function renderConstrainedScalar(node, type) {
  const broad = type === 'integer' ? 'number' : type
  if (Object.hasOwn(node, 'const')) return renderScalar(node.const)
  if (Object.hasOwn(node, 'enum')) {
    return node.enum.map(renderScalar).join(' | ')
  }
  return broad
}

function typeDocumentFrom(parts) {
  return {
    parts,
    containsUnionOrIntersection: parts.some(part => typeof part === 'string'
      ? part.includes('|') || part.includes('&')
      : part.containsUnionOrIntersection),
  }
}

function typeDocument(...parts) {
  return typeDocumentFrom(parts)
}

function flattenTypeDocument(document) {
  const chunks = []
  const tasks = [document]
  for (let task = tasks.pop(); task !== undefined; task = tasks.pop()) {
    if (typeof task === 'string') {
      chunks.push(task)
      continue
    }
    for (let index = task.parts.length - 1; index >= 0; index--) {
      const part = task.parts[index]
      if (part !== undefined) tasks.push(part)
    }
  }
  return chunks.join('')
}

function schemaRenderFrame(node, indent) {
  return { node, indent, phase: 'start', children: [], childIndex: 0, childDocuments: [], entries: [] }
}

function renderSupportedSchema(schema, indent) {
  const frames = [schemaRenderFrame(schema, indent)]
  let rootDocument
  const finish = (document) => {
    frames.pop()
    const parent = frames.at(-1)
    if (parent === undefined) rootDocument = document
    else parent.childDocuments.push(document)
  }

  while (frames.length > 0) {
    const frame = frames.at(-1)
    if (frame === undefined) break
    if (frame.phase === 'children') {
      if (frame.childIndex < frame.children.length) {
        const child = frame.children[frame.childIndex]
        if (child === undefined) throw new Error('missing schema render child')
        frame.childIndex++
        frames.push(schemaRenderFrame(child.node, child.indent))
        continue
      }
      if (frame.kind === 'oneOf') {
        const parts = []
        for (let index = 0; index < frame.childDocuments.length; index++) {
          if (index > 0) parts.push(' | ')
          const child = frame.childDocuments[index]
          if (child !== undefined) parts.push(child)
        }
        finish(typeDocumentFrom(parts))
        continue
      }
      if (frame.kind === 'array') {
        const child = frame.childDocuments[0]
        if (child === undefined) throw new Error('missing array item type')
        finish(child.containsUnionOrIntersection
          ? typeDocument('(', child, ')[]')
          : typeDocument(child, '[]'))
        continue
      }

      const required = new Set(frame.node.required)
      const parts = ['{']
      for (let index = 0; index < frame.entries.length; index++) {
        const entry = frame.entries[index]
        const child = frame.childDocuments[index]
        if (entry === undefined || child === undefined) throw new Error('missing object property type')
        const [name, prop] = entry
        for (const line of docLines(prop.description, frame.indent + 1)) parts.push('\n', line)
        parts.push('\n', `${pad(frame.indent + 1)}${renderKey(name)}${required.has(name) ? '' : '?'}: `, child, ';')
      }
      parts.push('\n', `${pad(frame.indent)}}`)
      const declared = typeDocumentFrom(parts)
      finish(frame.node.additionalProperties === false
        ? declared
        : typeDocument(declared, ' & Record<string, JsonValue>'))
      continue
    }

    const node = frame.node
    if (node.oneOf !== undefined) {
      frame.kind = 'oneOf'
      frame.children = Array.from(node.oneOf, child => ({ node: child, indent: frame.indent }))
      frame.childIndex = 0
      frame.childDocuments = []
      frame.phase = 'children'
      continue
    }
    if (node.type === undefined) {
      finish(typeDocument('JsonValue'))
      continue
    }
    switch (node.type) {
      case 'string':
      case 'number':
      case 'integer':
      case 'boolean':
      case 'null':
        finish(typeDocument(renderConstrainedScalar(node, node.type)))
        break
      case 'array':
        if (node.items === undefined) {
          finish(typeDocument('JsonValue[]'))
        } else {
          frame.kind = 'array'
          frame.children = [{ node: node.items, indent: frame.indent }]
          frame.childIndex = 0
          frame.childDocuments = []
          frame.phase = 'children'
        }
        break
      case 'object': {
        const open = node.additionalProperties !== false
        const entries = Object.entries(node.properties ?? {})
        if (entries.length === 0) {
          finish(typeDocument(open ? 'Record<string, JsonValue>' : 'Record<string, never>'))
        } else {
          frame.kind = 'object'
          frame.entries = entries
          frame.children = entries.map(([, child]) => ({ node: child, indent: frame.indent + 1 }))
          frame.childIndex = 0
          frame.childDocuments = []
          frame.phase = 'children'
        }
        break
      }
      default:
        finish(typeDocument('unknown'))
    }
  }

  return rootDocument ?? typeDocument('unknown')
}

export function jsonSchemaToTs(schema, indent = 0) {
  try {
    assertSupportedJsonSchema(schema)
    return flattenTypeDocument(renderSupportedSchema(schema, indent))
  } catch {
    return 'unknown'
  }
}

const SDK_INSTRUCTIONS = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` — the body of an async TypeScript function (erasable syntax only — no \`enum\` or namespaces; type annotations are advisory, the code runs type-stripped) — and \`description\`, a short summary of what the program does. Inside the program:

- Call tools as \`await tools.name(args)\` — quoted access for exotic names: \`tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose \`message\` is human-readable — \`try/catch\` it to handle and continue.
- Independent read-only calls MAY overlap under \`Promise.all\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit results with \`return\` and/or \`console.log(...)\`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

The available tools:`

export function renderToolsSdk(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const argsMembers = []
  const outputMembers = []
  for (const schema of sorted) {
    argsMembers.push(...docLines(schema.description, 1))
    argsMembers.push(`${pad(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.parameters, 1)};`)
    outputMembers.push(`${pad(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.output, 1)};`)
  }
  const argsMap = `interface ToolArgsMap {${argsMembers.length > 0 ? `\n${argsMembers.join('\n')}\n` : ''}}`
  const outputMap = `interface ToolOutputMap {${outputMembers.length > 0 ? `\n${outputMembers.join('\n')}\n` : ''}}`
  const declaration = [
    argsMap,
    outputMap,
    'type ToolName = keyof ToolOutputMap',
    ['declare class ToolCallError extends Error {', '  readonly name: "ToolCallError";', '  readonly toolName: ToolName;', '}'].join('\n'),
    ['declare const tools: {', '  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;', '}'].join('\n'),
  ].join('\n\n')
  const jsonValue = 'type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }'
  return `${SDK_INSTRUCTIONS}\n\n\`\`\`ts\n${jsonValue}\n\n${declaration}\n\`\`\``
}
