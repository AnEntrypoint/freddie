import { LspError } from '@freddie/freddie-lsp'
import { assertNever } from '@freddie/freddie-llm'

export function requestMethod(operation) {
  switch (operation) {
    case 'goToDefinition': return 'textDocument/definition'
    case 'findReferences': return 'textDocument/references'
    case 'goToImplementation': return 'textDocument/implementation'
    case 'hover': return 'textDocument/hover'
    default: return assertNever(operation, 'requestMethod')
  }
}

function capabilityValue(capabilities, operation) {
  switch (operation) {
    case 'goToDefinition': return capabilities.definitionProvider
    case 'findReferences': return capabilities.referencesProvider
    case 'goToImplementation': return capabilities.implementationProvider
    case 'hover': return capabilities.hoverProvider
    default: return assertNever(operation, 'capabilityValue')
  }
}

function supportsCapability(value) {
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  return true
}

export function supportsOperation(capabilities, operation) {
  return supportsCapability(capabilityValue(capabilities, operation))
}

export function supportsTransientOpen(sync) {
  if (sync === undefined) return false
  if (typeof sync === 'number') return isOpenCloseKind(sync)
  return sync.openClose === true
}

function isOpenCloseKind(kind) {
  return kind === 1 || kind === 2
}

export function negotiatePositionEncoding(encoding) {
  if (encoding === undefined || encoding === 'utf-16') return 'utf-16'
  throw new Error(`server negotiated unsupported position encoding "${encoding}"; this host requires utf-16`)
}

function toRange(range) {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  }
}

function isLocationLink(value) {
  return typeof value.targetUri === 'string' && isRange(value.targetSelectionRange)
}

function isLocation(value) {
  return typeof value.uri === 'string' && isRange(value.range)
}

function isRange(value) {
  if (value === null || typeof value !== 'object') return false
  const range = value
  return isPosition(range.start) && isPosition(range.end)
}

function isPosition(value) {
  if (value === null || typeof value !== 'object') return false
  const position = value
  return isProtocolCoordinate(position.line) && isProtocolCoordinate(position.character)
}

function isProtocolCoordinate(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function normalizeLocations(payload) {
  if (payload === null) return []
  if (payload === undefined) throw malformedResponse('LSP navigation result was missing')
  const elements = Array.isArray(payload) ? payload : [payload]
  const locations = []
  for (const element of elements) {
    if (element === null || typeof element !== 'object') {
      throw malformedResponse('LSP navigation result contained a non-object entry')
    }
    const record = element
    if (isLocationLink(record)) {
      const link = record
      locations.push({ uri: link.targetUri, range: toRange(link.targetSelectionRange) })
    } else if (isLocation(record)) {
      const location = record
      locations.push({ uri: location.uri, range: toRange(location.range) })
    } else {
      throw malformedResponse('LSP navigation result contained neither a Location nor a LocationLink')
    }
  }
  return locations
}

function renderMarkedString(value) {
  if (typeof value === 'string') return value
  return `\`\`\`${value.language}\n${value.value}\n\`\`\``
}

export function normalizeHover(payload) {
  if (payload === null) return null
  if (payload === undefined) throw malformedResponse('LSP hover result was missing')
  if (typeof payload !== 'object') throw malformedResponse('LSP hover result was not an object')
  const hover = payload
  const contents = renderHoverContents(hover.contents)
  if (contents === '') return null
  const range = hover.range
  if (range === undefined) return { contents }
  if (!isRange(range)) throw malformedResponse('LSP hover result contained a malformed range')
  return { contents, range: toRange(range) }
}

function renderHoverContents(contents) {
  if (contents === null || contents === undefined) {
    throw malformedResponse('LSP hover result had no contents')
  }
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents.map((value) => {
      if (isMarkedString(value)) return renderMarkedString(value)
      throw malformedResponse('LSP hover contents contained a malformed MarkedString')
    }).join('\n\n')
  }
  if (typeof contents !== 'object') {
    throw malformedResponse('LSP hover contents were not MarkupContent, MarkedString, or an array')
  }
  const record = contents
  if (record.kind === 'markdown' || record.kind === 'plaintext') {
    if (typeof record.value !== 'string') {
      throw malformedResponse('LSP hover MarkupContent value was not a string')
    }
    return record.value
  }
  if (typeof record.language === 'string' && typeof record.value === 'string') {
    return renderMarkedString({ language: record.language, value: record.value })
  }
  throw malformedResponse('LSP hover contents were not MarkupContent, MarkedString, or an array')
}

function isMarkedString(value) {
  if (typeof value === 'string') return true
  if (value === null || typeof value !== 'object') return false
  const record = value
  return typeof record.language === 'string' && typeof record.value === 'string'
}

function malformedResponse(message) {
  return new LspError(message, 'LSP_MALFORMED_RESPONSE')
}
