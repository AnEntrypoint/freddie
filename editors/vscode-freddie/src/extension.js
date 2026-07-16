// VS Code extension entry point: wires the real freddie-lsp language server
// (editors/freddie-lsp/server.mjs) via vscode-languageclient, and registers a
// Task provider that runs the repo's real test.js.
const path = require('node:path')
const vscode = require('vscode')
const { LanguageClient, TransportKind } = require('vscode-languageclient/node')

let client

function activate(context) {
    const serverModule = context.asAbsolutePath(path.join('..', 'freddie-lsp', 'server.mjs'))

    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.stdio },
        debug: { module: serverModule, transport: TransportKind.stdio },
    }

    const clientOptions = {
        documentSelector: [
            { scheme: 'file', pattern: '**/plugin.js' },
            { scheme: 'file', pattern: '**/handler.js' },
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/{plugin,handler}.js'),
        },
    }

    client = new LanguageClient('freddieLsp', 'Freddie Language Server', serverOptions, clientOptions)
    context.subscriptions.push(client.start())

    context.subscriptions.push(
        vscode.tasks.registerTaskProvider('freddie-test', {
            provideTasks() {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) return []
                const execution = new vscode.ShellExecution('node test.js', { cwd: workspaceFolder.uri.fsPath })
                const task = new vscode.Task(
                    { type: 'freddie-test' },
                    workspaceFolder,
                    'Run freddie test.js',
                    'freddie-test',
                    execution,
                )
                task.group = vscode.TaskGroup.Test
                return [task]
            },
            resolveTask(task) {
                return task
            },
        }),
    )
}

function deactivate() {
    if (!client) return undefined
    return client.stop()
}

module.exports = { activate, deactivate }
