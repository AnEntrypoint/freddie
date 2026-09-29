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
      if (existing !== undefined && existing !== url) {
        throw new Error(`webserver: import-map specifier "${specifier}" contributed two different URLs: "${existing}" and "${url}"`)
      }
      imports[specifier] = url
    }
  }
  if (Object.keys(imports).length === 0) return ''
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
    out = open === null ? `${head}${out}` : splice(out, open.index + open[0].length, head)
  }
  if (body !== '') {
    const open = /<body(?:\s[^>]*)?>/i.exec(out)
    out = open === null ? `${out}${body}` : splice(out, open.index + open[0].length, body)
  }
  return out
}
