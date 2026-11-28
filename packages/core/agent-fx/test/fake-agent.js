export function fakeAgent(script) {
  const record = { created: undefined, sessionId: undefined, sessionOptions: undefined, prompts: [] }
  const createAgent = (options) => {
    record.created = options
    return {
      session(id, sessionOptions) {
        record.sessionId = id
        record.sessionOptions = sessionOptions
        return {
          prompt(input, promptOptions) {
            record.prompts.push({ input, promptOptions })
            return turnOf(script, options, promptOptions.signal)
          },
        }
      },
    }
  }
  return { createAgent, record }
}

function turnOf(script, options, signal) {
  let resolve
  let reject
  const result = new Promise((done, fail) => { resolve = done; reject = fail })
  result.catch(() => {})
  const execute = (name, input, executionId) => options.tools.find(tool => tool.name === name).execute(input, { executionId, signal })
  return {
    result,
    async *[Symbol.asyncIterator]() {
      try {
        resolve(yield* script({ options, signal, execute }))
      } catch (error) {
        reject(error)
        throw error
      }
    },
  }
}
