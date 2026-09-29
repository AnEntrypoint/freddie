function payloadPath(file) {
  const normalized = file.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
  return normalized.startsWith('package/') ? normalized.slice('package/'.length) : normalized
}

export function isForbiddenPublicationFile(file) {
  const normalized = payloadPath(file)
  return normalized === 'src'
    || normalized.startsWith('src/')
    || normalized.endsWith('.d.ts.map')
    || normalized.endsWith('.js.map')
}

export function validateTarballPayload(files, context) {
  for (const file of files) {
    if (!isForbiddenPublicationFile(file)) continue
    const normalized = payloadPath(file)
    if (normalized === 'src' || normalized.startsWith('src/')) {
      throw new Error(`${context} publishes source file ${file}`)
    }
    throw new Error(`${context} publishes source map ${file}`)
  }
}
