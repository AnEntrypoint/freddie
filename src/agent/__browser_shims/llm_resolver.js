export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const br = globalThis.__freddieRuntimeBridge
        if (!br || !br.callLLM) throw new Error('freddie-runtime: __freddieRuntimeBridge.callLLM not set')
        return await br.callLLM({ ...input, provider, model: model || input.model })
    }
}
export const matrixUsable = () => false
