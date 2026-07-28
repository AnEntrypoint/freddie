// VS Code extension entry point: wires the real freddie-lsp language server
// (editors/freddie-lsp/server.mjs). No automated tests — manual testing only.
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
}

function deactivate() {
    if (!client) return undefined
    return client.stop()
}

module.exports = { activate, deactivate }