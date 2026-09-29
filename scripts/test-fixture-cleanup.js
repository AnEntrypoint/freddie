import { lstatSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export function unlinkFixtureLinks(path) {
  const visit = (entry) => {
    let stat
    try {
      stat = lstatSync(entry)
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      if (stat.isSymbolicLink()) unlinkSync(entry)
      return
    }
    for (const child of readdirSync(entry)) visit(join(entry, child))
  }
  visit(path)
}

export function removeFixtureSafely(path) {
  unlinkFixtureLinks(path)
  rmSync(path, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
}
