export async function relaunch({ argv = process.argv } = {}) {
    const { spawn } = await import('node:child_process')
    const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore', env: process.env })
    child.unref()
    setTimeout(() => process.exit(0), 100)
    return { pid: child.pid }
}
