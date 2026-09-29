import Schema from '@freddie/schemastery'
import { JsonRpcLineTransport } from '@freddie/freddie-sdk-protocol'
import { HarnessSdkJsonRpcServer } from './server.js'

export * from './server.js'
export { turnContextFor } from './turn-context.js'

export const name = 'sdk-jsonrpc-server'
export const inject = ['agents']

export const Config = Schema.object({
  maxTokensAsSuccess: Schema.boolean().default(false),
})

export function apply(ctx, config) {
  const resolvedConfig = config
  const rootFiber = ctx.root.fiber
  /* v8 ignore next */
  const input = config.input ?? process.stdin
  /* v8 ignore next */
  const output = config.output ?? process.stdout
  /* v8 ignore next */
  const exit = config.exit ?? ((code) => { process.exit(code) })

  const transport = new JsonRpcLineTransport(input, output)
  const server = new HarnessSdkJsonRpcServer(ctx, transport, {
    maxTokensAsSuccess: resolvedConfig.maxTokensAsSuccess,
  })

  let exitTask
  const disposeAndExit = () => {
    exitTask ??= (async () => {
      await Promise.allSettled([Promise.resolve().then(() => transport.flush())])
      await Promise.allSettled([Promise.resolve().then(() => rootFiber.dispose())])
      exit(0)
    })()
    return exitTask
  }

  transport.onRequest(async (method, params) => {
    if (method === 'initialize') await ctx.get('loader')?.await()
    const result = await server.handleRequest(method, params)
    if (method === 'shutdown') {
      setImmediate(() => { void disposeAndExit() })
    }
    return result
  })

  ctx.effect(() => {
    transport.start()
    return async () => {
      await server.shutdown()
      transport.close()
    }
  }, 'jsonrpc.serve')
}
