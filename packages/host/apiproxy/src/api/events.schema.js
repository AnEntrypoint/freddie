/**
 * events domain frame shapes: MuxFrame / HostFrame unions (payload slot of a
 * mux-stream / host-stream ServerRequest). Validation was removed repo-wide;
 * these are documentation-only shape notes now, not runtime-checked schemas.
 * A frame is the payload slot of the ServerRequest full form; the SessionEvent inside
 * a session/event frame reuses sessions.schema's strict-envelope + wide-data passthrough branch.
 */
