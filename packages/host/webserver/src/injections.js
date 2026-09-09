function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function assertNever(row) {
  throw new Error(`webserver: unknown index injection row ${JSON.stringify(row)}`)
}

function renderRow(row) {
  switch (row.kind) {
    case 'global': {
      // `<` is escaped in JSON so a row-controlled string cannot break out of
      // the script element.
      const name = JSON.stringify(row.name).replaceAll('<', '\\u003c')
      const value = row.value === undefined
        ? 'undefined'
        : JSON.stringify(row.value).replaceAll('<', '\\u003c')
      return { placement: 'head', markup: `<script>globalThis[${name}] = ${value}</script>` }
    }
    case 'script':
      return { placement: row.placement, markup: `<script>${row.text}</script>` }
    case 'script-src':
      return { placement: row.placement, markup: `<script src="${escapeHtmlAttribute(row.src)}"></script>` }
    case 'link':
      return {
        placement: row.placement,
        markup: `<link rel="${escapeHtmlAttribute(row.rel)}" href="${escapeHtmlAttribute(row.href)}">`,
      }
    case 'style':
      return { placement: 'head', markup: `<style>${row.text}</style>` }
    case 'html':
      return { placement: row.placement, markup: row.html }
    // 'importmap-entries' rows are merged and rendered separately, ahead of
    // every other row (see renderIndexInjections) — a document may carry at
    // most one <script type="importmap">, so per-row rendering here would
    // produce an invalid, browser-ignored second (or third) tag the moment a
    // second package contributes entries.
    case 'importmap-entries':
      return { placement: 'head', markup: '' }
    default:
      return assertNever(row)
  }
}

function splice(html, at, markup) {
  return `${html.slice(0, at)}${markup}${html.slice(at)}`
}

function renderImportMap(rows) {
  const imports = {}
  for (const row of rows) {
    if (row.kind !== 'importmap-entries') continue
    for (const [specifier, url] of Object.entries(row.imports)) {
      const existing = imports[specifier]
      // A genuine conflict (two contributors disagreeing on where a
      // specifier resolves) is a composition bug — fail loud rather than let
      // injection-subscriber order silently pick a winner. The same
      // contributor repeating its own entry (e.g. a rescan) is not a
      // conflict.
      if (existing !== undefined && existing !== url) {
        throw new Error(`webserver: import-map specifier "${specifier}" contributed two different URLs: "${existing}" and "${url}"`)
      }
      imports[specifier] = url
    }
  }
  if (Object.keys(imports).length === 0) return ''
  // `<` is escaped so a row-controlled specifier/URL cannot break out of the
  // script element; an import map must be the first module-relevant script
  // the parser sees, so this renders ahead of every other injected row.
  const value = JSON.stringify({ imports }).replaceAll('<', '\\u003c')
  return `<script type="importmap">${value}</script>`
}

export function renderIndexInjections(html, rows) {
  let head = renderImportMap(rows)
  let body = ''
  for (const row of rows) {
    const rendered = renderRow(row)
    if (rendered.placement === 'head') head += rendered.markup
    else body += rendered.markup
  }
  let out = html
  if (head !== '') {
    const open = /<head(?:\s[^>]*)?>/i.exec(out)
    // Headless fixture pages may lack <head>; prepending keeps the rows ahead
    // of every document script.
    out = open === null ? `${head}${out}` : splice(out, open.index + open[0].length, head)
  }
  if (body !== '') {
    const open = /<body(?:\s[^>]*)?>/i.exec(out)
    // Body-less fragments receive the rows at the end, where the HTML parser
    // has already synthesized a body.
    out = open === null ? `${out}${body}` : splice(out, open.index + open[0].length, body)
  }
  return out
}
