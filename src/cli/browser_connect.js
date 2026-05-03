let _puppeteer = null
async function probe() { if (_puppeteer !== null) return _puppeteer; try { _puppeteer = (await import('puppeteer-core')).default } catch { _puppeteer = false } return _puppeteer }
export async function connectToBrowser({ wsEndpoint, browserURL } = {}) {
    const p = await probe()
    if (!p) return { error: 'puppeteer-core not installed' }
    const browser = wsEndpoint ? await p.connect({ browserWSEndpoint: wsEndpoint }) : await p.connect({ browserURL })
    return { browser, pages: await browser.pages() }
}
export async function attachExisting(port = 9222) {
    return await connectToBrowser({ browserURL: 'http://127.0.0.1:' + port })
}
