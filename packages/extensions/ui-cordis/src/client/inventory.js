export function createCordisInventory(
  port,
  onError,
) {
  const listeners = new Set()
  let snapshot = { rows: [], removed: new Set(), read: false }
  let inFlight
  let generation = 0

  const publish = (next) => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    refresh: () => {
      if (inFlight !== undefined) return
      const issued = generation
      inFlight = port.inventory().then(
        (rows) => {
          if (issued !== generation) return
          const removed = new Set(snapshot.removed)
          const live = new Set(rows.map(row => row.pluginId))
          for (const previous of snapshot.rows) {
            if (!live.has(previous.pluginId)) removed.add(previous.pluginId)
          }
          publish({ rows, removed, read: true })
        },
        (error) => {
          if (issued !== generation) return
          onError(error)
          publish({
            rows: snapshot.rows,
            removed: snapshot.removed,
            read: snapshot.read,
            error: error instanceof Error ? error.message : 'reading the cordis inventory failed',
          })
        },
      ).then(() => { if (issued === generation) inFlight = undefined })
    },
    retire: (pluginId) => {
      const removed = new Set(snapshot.removed)
      removed.add(pluginId)
      publish({ ...snapshot, rows: snapshot.rows.filter(row => row.pluginId !== pluginId), removed })
    },
    reset: () => {
      generation += 1
      inFlight = undefined
      publish({ rows: [], removed: snapshot.removed, read: false })
    },
  }
}
