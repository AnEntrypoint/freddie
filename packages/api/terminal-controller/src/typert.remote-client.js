import { z } from 'zod'
import { jsonParameter } from './typert-parameter.js'

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

const agentId = {
  name: 'agent',
  wire: 'agentId',
  source: 'lookup',
  lookup: 'agent',
  codec: { mode: 'strict', typeSymbol: SESSION_ID_SYMBOL, schema: sessionId },
}

function descriptor(method, parameters, result, typeSymbol, cancellation = false) {
  return {
    id: `@freddie/freddie-terminal-controller#terminal/${method}`,
    service: 'terminalController',
    namespace: 'terminal',
    method,
    invocation: { kind: 'direct' },
    parameters,
    ...(cancellation ? { cancellation: { parameter: 'signal' } } : {}),
    result: { mode: 'strict', typeSymbol, schema: result },
    sourceLocation: SOURCE,
  }
}

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-terminal-controller',
  descriptors: [
    descriptor('environment', [agentId], environment, `${SYMBOL}#TerminalEnvironment`, true),
    descriptor('shells', [agentId], z.array(shell), `${SYMBOL}#TerminalShellList`, true),
    descriptor('list', [jsonParameter('sessionId', sessionId, SESSION_ID_SYMBOL)], terminalInfos, `${SYMBOL}#WebTerminalInfoList`),
    descriptor('create', [
      agentId,
      jsonParameter('request', createRequest, `${SYMBOL}#TerminalCreateRequest`),
    ], terminalInfo, `${SYMBOL}#WebTerminalInfo`, true),
    descriptor('write', [
      agentId,
      jsonParameter('id', terminalId, `${SYMBOL}#WebTerminalId`),
      jsonParameter('attachmentId', attachmentId, `${SYMBOL}#TerminalAttachmentId`),
      jsonParameter('data', z.string(), `${SYMBOL}#TerminalInput`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
    descriptor('resize', [
      agentId,
      jsonParameter('id', terminalId, `${SYMBOL}#WebTerminalId`),
      jsonParameter('attachmentId', attachmentId, `${SYMBOL}#TerminalAttachmentId`),
      jsonParameter('cols', z.number(), `${SYMBOL}#TerminalCols`),
      jsonParameter('rows', z.number(), `${SYMBOL}#TerminalRows`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
    descriptor('close', [
      agentId,
      jsonParameter('id', terminalId, `${SYMBOL}#WebTerminalId`),
    ], voidResult, `${SYMBOL}#TerminalVoid`),
  ],
}

export default TYPERT_REMOTE
