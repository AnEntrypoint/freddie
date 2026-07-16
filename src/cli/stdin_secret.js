import readline from 'node:readline'

// Read a secret (API key) without it landing in shell history or `ps` output.
// - When stdin is a pipe (not a TTY), read the first line of stdin verbatim:
//   `echo $KEY | freddie auth set anthropic`.
// - When stdin is a TTY, prompt and read with the terminal echo masked so the
//   key is not shown on screen.
// Never accept the secret as an argv argument — argv leaks to history and ps.
export async function readStdinSecret(promptText = 'secret: ', { input = process.stdin, output = process.stdout } = {}) {
    if (!input.isTTY) {
        // Piped input: take the first non-empty line.
        const rl = readline.createInterface({ input, terminal: false })
        for await (const line of rl) { rl.close(); return line.trim() }
        return ''
    }
    // Interactive TTY: prompt and mask the echo.
    return await new Promise((resolve) => {
        const rl = readline.createInterface({ input, output, terminal: true })
        let masked = false
        const onData = () => { if (masked) output.write('\x1b[2K\r' + promptText + '*'.repeat(rl.line.length)) }
        output.write(promptText)
        masked = true
        input.on('data', onData)
        rl.question('', (answer) => {
            input.off('data', onData)
            output.write('\n')
            rl.close()
            resolve(answer.trim())
        })
    })
}
