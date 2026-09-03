export { bootHook } from './boot.js'
export { presenceInboundHook, isOnline, presenceMap } from './presence.js'
export { broadcastHook, addSubscriber } from './broadcast.js'
export { routingHook } from './routing.js'
export { denyHook } from './deny.js'
import { bootHook } from './boot.js'
import { presenceInboundHook } from './presence.js'
import { broadcastHook } from './broadcast.js'
import { routingHook } from './routing.js'
import { denyHook } from './deny.js'
export function registerBuiltinHooks(gateway) {
    gateway.addHook('inbound', presenceInboundHook)
    gateway.addHook('inbound', denyHook)
    gateway.addHook('inbound', bootHook)
    gateway.addHook('inbound', routingHook)
    gateway.addHook('outbound', broadcastHook)
}
