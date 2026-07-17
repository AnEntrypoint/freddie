// Browser automation (navigate/click/type/evaluate/screenshot/text) via
// puppeteer-core, an optional peer dependency. Navigation is gated by
// url-safety and website-policy before puppeteer ever loads the URL.
import { checkUrlSafety } from './url-safety.js'
import { checkWebsitePolicy } from './website-policy.js'

let _puppeteerAvail = null
export async function probeBrowser() {
    if (_puppeteerAvail !== null) return _puppeteerAvail
    try { await import('puppeteer-core'); _puppeteerAvail = true } catch { _puppeteerAvail = false }
    return _puppeteerAvail
}

function gate(url) {
    const safety = checkUrlSafety(url)
    if (!safety.safe) return { error: 'blocked by url_safety: ' + safety.reason }
    const policy = checkWebsitePolicy(url)
    if (policy.decision === 'deny') return { error: 'blocked by website_policy' + (policy.reason ? ': ' + policy.reason : '') }
    return null
}

export async function browse(args) {
    const ok = await probeBrowser()
    if (!ok) return { error: 'puppeteer-core not installed. Run: npm install puppeteer-core' }
    const blocked = gate(args.url)
    if (blocked) return blocked

    const puppeteer = (await import('puppeteer-core')).default
    const browser = await puppeteer.launch({ headless: 'new' })
    try {
        const page = await browser.newPage()
        const a = args.action
        if (a === 'navigate') { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); return { url: page.url(), title: await page.title() } }
        if (a === 'click') { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); await page.click(args.selector); return { ok: true } }
        if (a === 'type') { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); await page.type(args.selector, args.text); return { ok: true } }
        if (a === 'evaluate') { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); return { result: await page.evaluate(args.script) } }
        if (a === 'text') { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); return { text: await page.evaluate(() => document.body.innerText) } }
        if (a === 'screenshot') { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); await page.screenshot({ path: args.path }); return { saved: args.path } }
        return { error: 'unknown action: ' + a }
    } finally { await browser.close() }
}
