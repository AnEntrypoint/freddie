
const CORE_ACTION_ORDER = [
  'shortcuts.open',
  'session.new',
  'sidebar.left.toggle',
  'session.search',
  'workspace.add',
  'session.rename',
  'session.fork',
  'session.archive',
  'settings.open',
  'workspace.openLocal',
  'sidebar.right.toggle',
  'workspace.files',
  'browser.new',
  'terminal.new',
  'pane.split',
  'pane.fullscreen.toggle',
  'page.refresh',
  'page.close',
]

const GROUP_ORDER = ['application', 'input', 'menus', 'approval']

export function subsequenceScore(name, query) {
  if (query.length > name.length) return null
  let index = 0
  let start = -1
  let gaps = 0
  let previous = -1
  for (let position = 0; position < name.length && index < query.length; position++) {
    if (name.charAt(position) !== query.charAt(index)) continue
    if (start === -1) start = position
    if (previous !== -1) gaps += position - previous - 1
    previous = position
    index += 1
  }
  if (index < query.length) return null
  return [start === 0 ? 0 : 1, gaps, name.length]
}

function better(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index]
  }
  return false
}

export function referenceRows(catalog, fixedCatalog) {
  const editable = catalog.map(row => ({
    ...row,
    group: 'application',
    names: [
      row.label,
      ...row.aliases,
      row.keys.filter(key => key !== '+').join('+'),
      row.keys.filter(key => key !== '+').join(''),
      row.aria ?? '',
      (row.aria ?? '').replace('Meta', 'Cmd'),
    ],
  }))
  const fixed = fixedCatalog.map(row => ({
    ...row,
    names: [row.label, row.id, row.keys.join(' ')],
  }))
  return [...editable, ...fixed].sort((left, right) => {
    const core = (CORE_ACTION_ORDER.indexOf(left.id) === -1 ? CORE_ACTION_ORDER.length : CORE_ACTION_ORDER.indexOf(left.id))
      - (CORE_ACTION_ORDER.indexOf(right.id) === -1 ? CORE_ACTION_ORDER.length : CORE_ACTION_ORDER.indexOf(right.id))
    if (core !== 0) return core
    const group = GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group)
    if (group !== 0) return group
    return left.id > right.id ? 1 : left.id < right.id ? -1 : 0
  })
}

export function rankRows(rows, query) {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows
  const ranked = []
  rows.forEach((row, position) => {
    let best = null
    for (const name of row.names) {
      const score = subsequenceScore(name.toLowerCase(), needle)
      if (score === null) continue
      if (best === null || better(score, best)) best = score
    }
    if (best !== null) ranked.push({ row, score: best, position })
  })
  ranked.sort((left, right) => {
    if (better(left.score, right.score)) return -1
    if (better(right.score, left.score)) return 1
    return left.position - right.position
  })
  return [...new Set(ranked.map(entry => entry.row))]
}

export function overrideCount(document, profile) {
  return Object.keys(document.profiles[profile] ?? {}).length
}
