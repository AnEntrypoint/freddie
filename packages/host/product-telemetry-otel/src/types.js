/**
 * Wire vocabulary of the explicit product-event channel. Types only — this
 * module carries no runtime identity, so a browser-side caller can import it
 * without pulling the host's OTel pipeline into a client bundle.
 * @module @freddie/freddie-host-product-telemetry-otel/types
 */

/**
 * @typedef {string|number|boolean} ProductTelemetryScalar
 */

/**
 * A scalar, or one level of object over scalars. Deeper structures are not an
 * OTLP `AnyValue` the collector's product schema accepts.
 * @typedef {ProductTelemetryScalar|Record<string, ProductTelemetryScalar>} ProductTelemetryAttribute
 */

/**
 * One explicitly selected product event.
 * @typedef {object} ProductTelemetryRecord
 * @property {string} name - The product event name; travels as the `event.name` attribute.
 * @property {string} body - One-line human summary; becomes the log record body.
 * @property {number} [time] - Occurrence time in epoch milliseconds; submission time when omitted.
 * @property {'info'|'warn'|'error'} [severity] - Defaults to `info`.
 * @property {Record<string, ProductTelemetryAttribute>} [attributes] - Approved analytics fields only.
 */
