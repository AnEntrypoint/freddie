#!/usr/bin/env node
// freddie Language Server: hover (signature lookup), completion (plugin.js/
// handler.js boilerplate snippets), and diagnostics (real contract
// violations, reusing src/host/contract.js's SURFACES enum directly so the
// two checks can never silently drift). Uses the real vscode-languageserver
// library (Microsoft-maintained -- no hand-rolled JSON-RPC/LSP wire
// protocol).
import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, DiagnosticSeverity, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { buildSignatureIndex, hoverTextFor } from './signatures.mjs'
import { diagnosePluginSource, PLUGIN_JS_SNIPPET, HANDLER_JS_SNIPPET } from './diagnostics.mjs'

const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout)
const documents = new TextDocuments(TextDocument)

let signatureIndex = null

connection.onInitialize((params) => {
    const root = params.rootPath || params.workspaceFolders?.[0]?.uri?.replace('file://', '') || process.cwd()
    signatureIndex = buildSignatureIndex(root)
    connection.console.log(`freddie-lsp: indexed ${signatureIndex.size} exported names from ${root}`)
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            completionProvider: { resolveProvider: false },
        },
    }
})

function isPluginJs(uri) { return uri.endsWith('plugin.js') }
function isHandlerJs(uri) { return uri.endsWith('handler.js') }

function runDiagnostics(doc) {
    if (!isPluginJs(doc.uri) && !isHandlerJs(doc.uri)) return
    const text = doc.getText()
    const found = diagnosePluginSource(text, isHandlerJs(doc.uri))
    const diagnostics = found.map((d) => ({
        severity: d.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        range: {
            start: doc.positionAt(d.index || 0),
            end: doc.positionAt((d.index || 0) + 1),
        },
        message: d.message,
        source: 'freddie-lsp',
    }))
    connection.sendDiagnostics({ uri: doc.uri, diagnostics })
}

documents.onDidOpen((e) => runDiagnostics(e.document))
documents.onDidChangeContent((e) => runDiagnostics(e.document))

connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return []
    const items = []
    if (isPluginJs(doc.uri)) {
        items.push({
            label: 'plugin-boilerplate',
            kind: CompletionItemKind.Snippet,
            insertText: PLUGIN_JS_SNIPPET,
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Real plugin.js contract shape (src/host/contract.js validatePlugin)',
        })
    }
    if (isHandlerJs(doc.uri)) {
        items.push({
            label: 'tool-boilerplate',
            kind: CompletionItemKind.Snippet,
            insertText: HANDLER_JS_SNIPPET,
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Real handler.js tool shape ({name, schema, handler})',
        })
    }
    return items
})

function wordAt(text, offset) {
    const before = text.slice(0, offset).match(/[A-Za-z0-9_$]*$/)[0]
    const afterMatch = text.slice(offset).match(/^[A-Za-z0-9_$]*/)
    const after = afterMatch ? afterMatch[0] : ''
    return before + after
}

connection.onHover((params) => {
    if (!signatureIndex) return null
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return null
    const offset = doc.offsetAt(params.position)
    const text = doc.getText()
    const word = wordAt(text, offset)
    if (!word) return null
    const hover = hoverTextFor(signatureIndex, word)
    if (!hover) return null
    return { contents: { kind: 'markdown', value: hover } }
})

documents.listen(connection)
connection.listen()
