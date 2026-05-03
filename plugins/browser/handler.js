let _puppeteerAvail = null
async function probe() {
    if (_puppeteerAvail !== null) return _puppeteerAvail
    try { await import('puppeteer-core'); _puppeteerAvail = true } catch { _puppeteerAvail = false }
    return _puppeteerAvail
}

export const _tool = ({
    name: 'browser',
    toolset: 'browse',
    schema: {
        name: 'browser',
        description: 'Browser automation: navigate, click, type, evaluate, screenshot. Requires puppeteer-core.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['navigate', 'click', 'type', 'evaluate', 'screenshot', 'text'] },
                url: { type: 'string' },
                selector: { type: 'string' },
                text: { type: 'string' },
                script: { type: 'string' },
                path: { type: 'string' },
            },
            required: ['action'],
        },
    },
    checkFn: () => true,
    requiresEnv: ['puppeteer-core'],
    handler: async (args) => {
        const ok = await probe()
        if (!ok) return { error: 'puppeteer-core not installed. Run: npm install puppeteer-core' }
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
    },
})
