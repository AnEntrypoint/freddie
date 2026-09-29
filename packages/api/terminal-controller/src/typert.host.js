import { z } from 'zod'

const sessionId = z.intersection(z.string(), z.unknown())
const terminalId = z.intersection(z.string(), z.unknown())
const attachmentId = z.intersection(z.string(), z.unknown())

const shell = z.object({
  path: z.string(),
  name: z.string(),
  args: z.array(z.string()),
})
const terminalInfo = z.object({
  id: z.string(),
  title: z.string(),
  shell,
  cwd: z.string(),
  cols: z.number(),
  rows: z.number(),
  state: z.union([z.literal('running'), z.literal('exited'), z.literal('failed')]),
  exitCode: z.union([z.number(), z.null()]),
  error: z.string().optional(),
  controllerId: z.string().optional(),
})
const terminalInfos = z.array(terminalInfo)
const environment = z.object({
  cwd: z.string(),
  maxInputBytes: z.number(),
  maxCols: z.number(),
  maxRows: z.number(),
  scrollback: z.number(),
})
const createRequest = z.object({
  id: z.string(),
  shellPath: z.string().optional(),
  cols: z.number(),
  rows: z.number(),
})
const voidResult = z.undefined()

const SYMBOL = '@freddie/freddie-terminal-controller/types'
const SESSION_ID_SYMBOL = '@freddie/freddie-session/types#SessionId'
const SOURCE = { file: 'packages/api/terminal-controller/src/index.js', line: 1, column: 1 }

const agentLookup = {
  name: 'agent',
  wire: 'agentId',
  source: 'lookup',
  lookup: 'agent',
  codec: { mode: 'strict', typeSymbol: SESSION_ID_SYMBOL, schema: sessionId },
}

function json(name, schema, typeSymbol) {
  return { name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol, schema } }
}

function invocation(method, parameters, result, typeSymbol, cancellation = false) {
  const scoped = parameters.some(parameter => parameter.source === 'lookup')
  return {
    id: `@freddie/freddie-terminal-controller#terminal/${method}`,
    service: 'terminalController',
    namespace: 'terminal',
    method,
    invocation: { kind: 'direct' },
    ...(scoped ? { scope: { context: 'agent', wire: agentLookup.wire } } : {}),
    parameters,
    ...(cancellation ? { cancellation: { parameter: 'signal' } } : {}),
    result: { mode: 'strict', typeSymbol, schema: result },
    sourceLocation: SOURCE,
  }
}

export const TYPERT = {
  package: '@freddie/freddie-terminal-controller',
  face: 'host',
  schemas: [],
  invocations: [
    invocation('environment', [agentLookup], environment, `${SYMBOL}#TerminalEnvironment`, true),
    invocation('shells', [agentLookup], z.array(shell), `${SYMBOL}#TerminalShellList`, true),
    invocation('list', [json('sessionId', sessionId, SESSION_ID_SYMBOL)], terminalInfos, `${SYMBOL}#WebTerminalInfoList`),
    invocation('create', [
      agentLookup,
      json('request', createRequest, `${SYMBOL}#TerminalCreateRequest`),
    ], terminalInfo, `${SYMBOL}#WebTerminalInfo`, true),
    invocation('write', [
      agentLookup,
      json('id', terminalId, `${SYMBOL}#WebTerminalId`),
      json('attachmentId', attachmentId, `${SYMBOL}#TerminalAttachmentId`),
      json('data', z.string(), `${SYMBOL}#TerminalInput`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
    invocation('resize', [
      agentLookup,
      json('id', terminalId, `${SYMBOL}#WebTerminalId`),
      json('attachmentId', attachmentId, `${SYMBOL}#TerminalAttachmentId`),
      json('cols', z.number(), `${SYMBOL}#TerminalCols`),
      json('rows', z.number(), `${SYMBOL}#TerminalRows`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
    invocation('close', [
      agentLookup,
      json('id', terminalId, `${SYMBOL}#WebTerminalId`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
  ],
  model: {
    services: [
      {
        description: 'Session-owned user terminals running with the execution environment system-user permissions. retain and follow are Host-only async generators with no unary RPC face.',
        summary: 'Session-owned user terminals.',
        tags: [],
        jsDoc: '/** Session-owned user terminals running with the execution environment system-user permissions. */',
        key: 'terminalController',
        exportName: 'TerminalController',
        members: [
          {
            kind: 'method',
            name: 'environment',
            signature: "@Remote('environment') environment(agent: Agent, signal?: AbortSignal): TerminalEnvironment",
            summary: 'Read the Session working directory and terminal limits.',
            jsDoc: "/** Read the Session working directory and terminal limits without resolving a shell. */",
          },
          {
            kind: 'method',
            name: 'shells',
            signature: "@Remote('shells') shells(agent: Agent, signal?: AbortSignal): Promise<TerminalShell[]>",
            summary: 'Discover installed shells in the execution environment.',
            jsDoc: '/** Discover installed shells in the execution environment. */',
          },
          {
            kind: 'method',
            name: 'list',
            signature: "@Remote('list') list(sessionId: SessionId): WebTerminalInfo[]",
            summary: 'List retained terminals without resolving or activating an Agent.',
            jsDoc: '/** List retained terminals without resolving or activating an Agent. */',
          },
          {
            kind: 'method',
            name: 'create',
            signature: "@Remote('create') create(agent: Agent, request: TerminalCreateRequest, signal?: AbortSignal): Promise<WebTerminalInfo>",
            summary: 'Allocate a user shell once for a caller-generated identity.',
            jsDoc: '/** Allocate a user shell once for a caller-generated identity. */',
          },
          {
            kind: 'method',
            name: 'write',
            signature: "@Remote('write') write(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, data: string): Promise<void>",
            summary: 'Deliver raw input, including Tab completion and control characters.',
            jsDoc: '/** Deliver raw input, including Tab completion and control characters. */',
          },
          {
            kind: 'method',
            name: 'resize',
            signature: "@Remote('resize') resize(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, cols: number, rows: number): Promise<void>",
            summary: 'Update the dimensions of the PTY and recovery screen.',
            jsDoc: '/** Update the dimensions of the PTY and recovery screen. */',
          },
          {
            kind: 'method',
            name: 'close',
            signature: "@Remote('close') close(agent: Agent, id: WebTerminalId): Promise<void>",
            summary: 'Close an identity to future creation and kill its process range.',
            jsDoc: '/** Close an identity to future creation and kill its process range; repeated closes succeed. */',
          },
        ],
        types: [
          {
            name: 'TerminalShell',
            declaration: 'export interface TerminalShell { readonly path: string; readonly name: string; readonly args: readonly string[]; }',
          },
          {
            name: 'TerminalEnvironment',
            declaration: 'export interface TerminalEnvironment { readonly cwd: string; readonly maxInputBytes: number; readonly maxCols: number; readonly maxRows: number; readonly scrollback: number; }',
          },
          {
            name: 'WebTerminalInfo',
            declaration: "export interface WebTerminalInfo { readonly id: WebTerminalId; readonly title: string; readonly shell: TerminalShell; readonly cwd: string; readonly cols: number; readonly rows: number; readonly state: 'running' | 'exited' | 'failed'; readonly exitCode: number | null; readonly error?: string; readonly controllerId?: TerminalAttachmentId; }",
          },
          {
            name: 'TerminalCreateRequest',
            declaration: 'export interface TerminalCreateRequest { readonly shellPath?: string; readonly id: WebTerminalId; readonly cols: number; readonly rows: number; }',
          },
          {
            name: 'WebTerminalId',
            declaration: "export type WebTerminalId = string;",
          },
          {
            name: 'TerminalAttachmentId',
            declaration: 'export type TerminalAttachmentId = string;',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}
