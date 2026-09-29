# api-gateway

## Rationale

- `$on` / `$dispatch` (`src/client/index.js`): the listener table is keyed by runtime event name, so the per-event argument types `$on`'s signature pins cannot survive in it; `$dispatch` gets the args from the frame the Host emitted for that name. Delivery iterates a snapshot: a listener may subscribe or dispose mid-delivery, and the recipients are those registered when the frame arrived.
- `createNamespace`: methods are installed synchronously inside the namespace fiber's apply, the same window as the service registration, so a dependent the new service unparks runs only after the methods exist.
- `invoke` catch: carrier throws (offline, abort, a rejected result payload) are outcomes of the call, not assembly faults, so they take the same error branch (`carrierFailure`).
- Void results (`src/index.js`): a weak descriptor declares no return type, so an `undefined` return is a void result; a strict descriptor keeps its schema, so there `undefined` must be a declared result. A void or absent result carries no `value` field in the RPC envelope: JSON has no `undefined`, and the envelope's optional slot is the one absence representation args and results share.
- `resolveParameter` / `assertExactArguments`: a JSON field may be omitted when the strict descriptor declares absence (`acceptsUndefined`), and always under SRC (`src-json`): a weak descriptor reads parameter names from the JavaScript signature and cannot see which are optional, so LIB is where an omitted required argument is caught. Lookup ids are never omissible; a present-but-undefined field is not JSON-safe input and still fails decode.
