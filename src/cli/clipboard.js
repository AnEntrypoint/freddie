import { spawn } from 'node:child_process'
function run(cmd, input = null) {
    return new Promise((resolve) => {
        const child = spawn(cmd[0], cmd.slice(1))
        let stdout = ''
        child.stdout?.on('data', d => stdout += d.toString())
        child.on('close', code => resolve({ code, stdout }))
        child.on('error', () => resolve({ code: -1, stdout: '' }))
        if (input != null) { child.stdin?.write(input); child.stdin?.end() }
    })
}
export async function copy(text) {
    if (process.platform === 'win32') return run(['clip'], text)
    if (process.platform === 'darwin') return run(['pbcopy'], text)
    const xclip = await run(['xclip', '-selection', 'clipboard'], text)
    if (xclip.code === 0) return xclip
    return run(['xsel', '--clipboard', '--input'], text)
}
export async function paste() {
    if (process.platform === 'win32') return (await run(['powershell', '-NoProfile', '-Command', 'Get-Clipboard'])).stdout
    if (process.platform === 'darwin') return (await run(['pbpaste'])).stdout
    const x = await run(['xclip', '-selection', 'clipboard', '-o'])
    return x.code === 0 ? x.stdout : (await run(['xsel', '--clipboard', '--output'])).stdout
}
