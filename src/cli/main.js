import { Command } from 'commander'
export function buildMainProgram() {
    const program = new Command()
    program.name('freddie').version('0.5.0').description('Freddie — JS rebuild of hermes-agent')
    return program
}
export { buildMainProgram as createCli }
