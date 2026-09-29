import { createRequire } from 'node:module'

const { version } = createRequire(import.meta.url)('../package.json')

export const APP_IDENTITY = {
  product: 'freddie',
  version,
  url: 'https://github.com/lanmower/freddie',
}

export function userAgent(identity = APP_IDENTITY) {
  return `${identity.product}/${identity.version} (+${identity.url})`
}

export function attributionHeaders(identity = APP_IDENTITY) {
  return { 'user-agent': userAgent(identity) }
}
