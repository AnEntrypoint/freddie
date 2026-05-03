let _blessed = null
async function probe() { if (_blessed !== null) return _blessed; try { _blessed = await import('blessed') } catch { _blessed = false } return _blessed }

export async function launchCurses({ output } = {}) {
    const b = await probe()
    if (!b) return { error: 'blessed not installed; run: npm install blessed' }
    const blessed = b.default || b
    const screen = blessed.screen({ smartCSR: true, title: 'freddie' })
    const log = blessed.log({ top: 0, left: 0, width: '100%', height: '90%', scrollable: true, alwaysScroll: true })
    const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, inputOnFocus: true })
    screen.append(log); screen.append(input)
    screen.key(['C-c', 'q'], () => process.exit(0))
    screen.render()
    return { screen, log, input, render: () => screen.render(), close: () => screen.destroy() }
}
