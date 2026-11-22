import { z } from 'zod'
import { jsonParameter } from './typert-parameter.js'
import { process } from '@freddie/freddie-runtime/process'

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
    invocation('list', [jsonParameter('sessionId', sessionId, SESSION_ID_SYMBOL)], terminalInfos, `${SYMBOL}#WebTerminalInfoList`),
    invocation('create', [
      agentLookup,
      jsonParameter('request', createRequest, `${SYMBOL}#TerminalCreateRequest`),
    ], terminalInfo, `${SYMBOL}#WebTerminalInfo`, true),
    invocation('write', [
      agentLookup,
      jsonParameter('id', terminalId, `${SYMBOL}#WebTerminalId`),
      jsonParameter('attachmentId', attachmentId, `${SYMBOL}#TerminalAttachmentId`),
      jsonParameter('data', z.string(), `${SYMBOL}#TerminalInput`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
    invocation('resize', [
      agentLookup,
      jsonParameter('id', terminalId, `${SYMBOL}#WebTerminalId`),
      jsonParameter('attachmentId', attachmentId, `${SYMBOL}#TerminalAttachmentId`),
      jsonParameter('cols', z.number(), `${SYMBOL}#TerminalCols`),
      jsonParameter('rows', z.number(), `${SYMBOL}#TerminalRows`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
    invocation('close', [
      agentLookup,
      jsonParameter('id', terminalId, `${SYMBOL}#WebTerminalId`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
  ],
}
