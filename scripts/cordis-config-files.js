import { globSync } from 'node:fs'

export function cordisConfigFiles(root) {
  return globSync(['**/*cordis*.yml', '**/*cordis*.yaml'], {
    cwd: root,
    exclude: ['.claude/**', 'node_modules/**', 'framework/**'],
  }).sort()
}
