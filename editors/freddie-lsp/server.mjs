#!/usr/bin/env node
// Minimal freddie Language Server: hover-only support, per the manifesto's
// item 42 first slice. Autocomplete/type-checking are a distinct follow-up
// row (language-server-completions) once this hover-first approach proves
// out. Uses the real vscode-languageserver library (Microsoft-maintained --
// no hand-rolled JSON-RPC/LSP wire protocol).
import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind } from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { buildSignatureIndex, hoverTextFor } from './signatures.mjs'

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
        },
    }
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
