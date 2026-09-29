import { isIP } from 'node:net'

const IPV4_TEXT = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function unbracket(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

export function normalizeHostname(hostname) {
  return unbracket(hostname).replace(/\.+$/, '').toLowerCase()
}

function parseIpv4(text) {
  const match = IPV4_TEXT.exec(text)
  if (match === null) return undefined
  const octets = []
  for (let index = 1; index <= 4; index++) {
    const part = match[index]
    if (part.length > 1 && part.startsWith('0')) return undefined
    const value = Number(part)
    if (value > 255) return undefined
    octets.push(value)
  }
  return octets
}

function parseIpv6(text) {
  if (isIP(text) !== 6 || text.includes('%')) return undefined
  const halves = text.split('::')
  if (halves.length > 2) return undefined
  const head = halves[0] === '' ? [] : halves[0].split(':')
  const tail = halves.length === 2 ? (halves[1] === '' ? [] : halves[1].split(':')) : []
  const groups = []
  for (const part of [...head, ...tail]) {
    if (part.includes('.')) {
      const octets = parseIpv4(part)
      if (octets === undefined) return undefined
      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined
      groups.push(parseInt(part, 16))
    }
  }
  if (halves.length === 1) return groups.length === 8 ? groups : undefined
  const missing = 8 - groups.length
  if (missing < 1) return undefined
  const headLength = head.reduce((count, part) => count + (part.includes('.') ? 2 : 1), 0)
  return [...groups.slice(0, headLength), ...new Array(missing).fill(0), ...groups.slice(headLength)]
}

function classifyIpv4([a, b, c, d]) {
  if (a === 0) return 'unspecified'
  if (a === 10) return 'private'
  if (a === 127) return 'loopback'
  if (a === 100 && b >= 64 && b <= 127) return 'shared'
  if (a === 169 && b === 254) return 'link-local'
  if (a === 172 && b >= 16 && b <= 31) return 'private'
  if (a === 192 && b === 168) return 'private'
  if (a === 192 && b === 0 && c === 0) return 'reserved'
  if (a === 192 && b === 0 && c === 2) return 'documentation'
  if (a === 192 && b === 88 && c === 99) return 'reserved'
  if (a === 198 && (b === 18 || b === 19)) return 'benchmark'
  if (a === 198 && b === 51 && c === 100) return 'documentation'
  if (a === 203 && b === 0 && c === 113) return 'documentation'
  if (a >= 224 && a <= 239) return 'multicast'
  if (a === 255 && b === 255 && c === 255 && d === 255) return 'broadcast'
  if (a >= 240) return 'reserved'
  return undefined
}

function classifyIpv6(groups) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups
  const leadingZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0
  if (leadingZero && g5 === 0 && g6 === 0 && g7 === 0) return 'unspecified'
  if (leadingZero && g5 === 0 && g6 === 0 && g7 === 1) return 'loopback'
  if (leadingZero && g5 === 0xffff) return classifyIpv4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255])
  if (leadingZero && g5 === 0) return 'transition'
  if (g0 === 0x64 && g1 === 0xff9b) return 'transition'
  if ((g0 & 0xfe00) === 0xfc00) return 'private'
  if ((g0 & 0xffc0) === 0xfe80) return 'link-local'
  if ((g0 >> 8) === 0xff) return 'multicast'
  if ((g0 & 0xe000) !== 0x2000) return 'reserved'
  if (g0 === 0x2001 && g1 < 0x200) return 'reserved'
  if (g0 === 0x2001 && g1 === 0xdb8) return 'documentation'
  if (g0 === 0x2002) return 'transition'
  if (g0 === 0x3fff && g1 < 0x1000) return 'documentation'
  return undefined
}

export function classifyAddress(text) {
  if (typeof text !== 'string') return 'unparseable'
  const host = unbracket(text)
  if (isIP(host) === 4) {
    const octets = parseIpv4(host)
    return octets === undefined ? 'unparseable' : classifyIpv4(octets)
  }
  if (isIP(host) === 6) {
    const groups = parseIpv6(host)
    return groups === undefined ? 'scoped-or-unparseable' : classifyIpv6(groups)
  }
  return 'unparseable'
}

export function isPublicAddress(text) {
  return classifyAddress(text) === undefined
}
