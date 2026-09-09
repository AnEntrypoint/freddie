/**
 * Shared wire protocol for the Freddie SDK runtime: the
 * newline-delimited JSON-RPC stdio transport plus the named request, result,
 * and notification types both wire ends speak. The runtime server plugin
 * (`@freddie/freddie-sdk-jsonrpc-server`) serves this protocol; SDK clients
 * (`@freddie/freddie-sdk-client`, the Python SDK) drive it.
 *
 * @module @freddie/freddie-sdk-protocol
 */

export { JsonRpcLineTransport, JsonRpcResponseError } from './transport.js'
