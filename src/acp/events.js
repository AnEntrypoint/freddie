export function emitEvent(send, kind, payload) { send({ jsonrpc: '2.0', method: 'event/' + kind, params: payload }) }
export const Events = {
    toolStart: (send, p) => emitEvent(send, 'tool.start', p),
    toolProgress: (send, p) => emitEvent(send, 'tool.progress', p),
    toolComplete: (send, p) => emitEvent(send, 'tool.complete', p),
    messageDelta: (send, p) => emitEvent(send, 'message.delta', p),
    messageComplete: (send, p) => emitEvent(send, 'message.complete', p),
    permissionRequest: (send, p) => emitEvent(send, 'permission.request', p),
    sessionEnded: (send, p) => emitEvent(send, 'session.ended', p),
}
