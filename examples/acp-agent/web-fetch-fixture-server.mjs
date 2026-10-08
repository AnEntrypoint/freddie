import { createServer } from 'node:http'

const PORT = 43117

const PAGE = `<!doctype html>
<html><head><title>Menu</title><style>.x{color:red}</style><script>ignored()</script></head>
<body>
<h1>Caf&eacute; menu</h1>
<p>Prices include <strong>service &amp; <em>tax</em></strong> &mdash; updated daily.</p>
<ul><li>Espresso</li><li>Flat white</li></ul>
<table><thead><tr><th>Drink</th><th>Price</th></tr></thead><tbody><tr><td>Espresso</td><td>&euro;2</td></tr><tr><td>Flat white</td><td>&euro;3</td></tr></tbody></table>
<p>See <a href="https://fixture.invalid/specials">today&rsquo;s specials</a>.</p>
</body></html>
`

export const name = 'web-fetch-fixture-server'

export async function apply(ctx) {
  const server = createServer((req, res) => {
    if (req.url === '/menu.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '127.0.0.1', () => resolve(undefined))
  })
  server.unref()
  ctx.effect(() => async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve(undefined))
      server.closeAllConnections()
    })
  }, 'web-fetch-fixture-server')
}
