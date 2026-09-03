// World-lint checks, ported verbatim from spoint's real client/editor/WorldValidator.js
// lintWorld() (C:/dev/spoint/client/editor/WorldValidator.js). Not a re-derivation or an
// invented rule set -- the exact same 4 checks, same thresholds, same messages shape, cited
// per-check below. Ported rather than imported because WorldValidator.js pulls in
// anentrypoint-design + client/editor/wm/ui.js (webjsx + DOM-coupled EditPanelDOM.js) for its
// panel-rendering half; the lint LOGIC itself has zero DOM dependency, so this file extracts
// exactly that logic and nothing else. No server-side lint endpoint exists in spoint (verified
// live via src/sdk/EditorHandlers.js's full HANDLERS map -- no MSG type runs a lint/validate
// check) -- this plugin re-implements the SAME checks client-side against a live-fetched
// SCENE_GRAPH + APP_LIST, exactly as WorldValidator.js's own updateEntities/updateKnownApps
// consumers do in the real editor UI.

// client/editor/WorldValidator.js:9
const OUT_OF_BOUNDS_RADIUS = 50000

// client/editor/WorldValidator.js:11
const SPAWN_APP_NAMES = new Set(['spawn-point', 'respawn-zone'])

// client/editor/WorldValidator.js:17-24 (_flatten), verbatim
function _flatten(nodes, depth, parentId, out) {
  for (const n of nodes || []) {
    if (!n || !n.id) continue
    out.push({ node: n, depth, parentId })
    if (n.children && n.children.length) _flatten(n.children, depth + 1, n.id, out)
  }
  return out
}

// client/editor/WorldValidator.js:26-88 (lintWorld), verbatim logic (only the DOM-facing
// render() half of that file is omitted -- the 4 checks below are byte-identical in intent
// and threshold to the source).
export function lintWorld(entities, knownAppNames) {
  const flat = _flatten(entities, 0, null, [])
  const findings = []

  // 1) Absurd coordinate magnitude
  for (const { node } of flat) {
    const p = node.position
    if (!Array.isArray(p) || p.length < 3) continue
    const mag = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))
    if (Number.isFinite(mag) && mag > OUT_OF_BOUNDS_RADIUS) {
      findings.push({
        id: node.id, severity: 'error', check: 'out-of-bounds',
        message: `${node.id} is at [${p.map(v => v.toFixed(0)).join(', ')}] -- ${mag.toFixed(0)}u from origin, past the ${OUT_OF_BOUNDS_RADIUS}u reasonable-playable-bounds radius`,
      })
    }
  }

  // 2) Missing spawn points
  const hasSpawn = flat.some(({ node }) => SPAWN_APP_NAMES.has(node.appName))
  if (!hasSpawn) {
    findings.push({
      id: null, severity: 'warn', check: 'missing-spawn',
      message: 'No spawn-point or respawn-zone entity found in this world -- players have nowhere authored to spawn',
    })
  }

  // 3) Duplicate entity ids
  const seenIds = new Map()
  for (const { node } of flat) {
    if (seenIds.has(node.id)) {
      const first = seenIds.get(node.id)
      findings.push({
        id: node.id, severity: 'error', check: 'duplicate-id',
        message: `Entity id "${node.id}" appears more than once in the scene tree (first seen under parent ${first.parentId ?? '(root)'}, again under ${flat.find(f => f.node === node).parentId ?? '(root)'})`,
      })
    } else {
      seenIds.set(node.id, flat.find(f => f.node === node))
    }
  }

  // 4) Missing/unresolvable app name
  if (knownAppNames && knownAppNames.size) {
    for (const { node } of flat) {
      if (node.appName && !knownAppNames.has(node.appName)) {
        findings.push({
          id: node.id, severity: 'error', check: 'unresolvable-app',
          message: `${node.id} references app "${node.appName}" which is not in the server's known-app list -- likely renamed, deleted, or never registered`,
        })
      }
    }
  }

  return findings
}

export { OUT_OF_BOUNDS_RADIUS, SPAWN_APP_NAMES }
