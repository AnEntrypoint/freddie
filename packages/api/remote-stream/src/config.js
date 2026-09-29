/**
 * Wire and lifecycle bounds for the Remote frame-stream carrier.
 *
 * @module @freddie/freddie-remote-stream/config
 */

/** Remote namespace carrying the carrier's own endpoints. */
export const REMOTE_STREAM_NAMESPACE = 'stream'

/** Hard ceiling on one poll's wait, so a poll never outlives a proxy timeout. */
export const REMOTE_STREAM_MAX_POLL_MS = 20_000

/** Hard ceiling on concurrently registered Host streams. */
export const REMOTE_STREAM_MAX_OPEN_STREAMS = 128

/** Default frames retained per stream before its producer is paused. */
export const REMOTE_STREAM_MAX_BUFFERED_FRAMES = 256

/** Default frames returned by one poll. */
export const REMOTE_STREAM_MAX_FRAMES_PER_POLL = 64

/** Default idle window after which an unpolled stream is destroyed. */
export const REMOTE_STREAM_IDLE_TIMEOUT_MS = 30_000
