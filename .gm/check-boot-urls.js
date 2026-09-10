import fs from 'node:fs'
import http from 'node:http'

const html = fs.readFileSync('.gm/gui-root.html', 'utf8')
const marker = 'globalThis["__FREDDIE_BOOT__"] = '
const i = html.indexOf(marker)
if (i < 0) throw new Error('no boot')
const rest = html.slice(i + marker.length)
const json = rest.slice(0, rest.indexOf('</script>')).trim().replace(/;$/, '')
const boot = JSON.parse(json)

function get(path, follow = true) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: 4912, path, timeout: 8000 }, (res) => {
      const loc = res.headers.location
      if (follow && res.statusCode >= 300 && res.statusCode < 400 && loc) {
        res.resume()
        const next = loc.startsWith('http') ? new URL(loc).pathname + new URL(loc).search : loc
        get(next, false).then((inner) => resolve({ path, status: res.statusCode, loc, followed: inner }))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({
          path,
          status: res.statusCode,
          loc,
          len: buf.length,
          ctype: res.headers['content-type'],
          head: buf.subarray(0, 80).toString('utf8'),
        })
      })
    })
    req.on('error', (e) => resolve({ path, err: e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ path, err: 'timeout' })
    })
  })
}

const paths = boot.entries.map((e) => e.url)
paths.push('/src/main.js', '/manifest.webmanifest', '/favicon.svg')
const results = await Promise.all(paths.map((p) => get(p)))
const bad = results.filter((r) => {
  const final = r.followed ?? r
  return final.status !== 200
})
console.log(JSON.stringify({
  checked: results.length,
  ok: results.length - bad.length,
  sample301: results.find((r) => r.status === 301),
  bad: bad.slice(0, 10),
}, null, 2))
