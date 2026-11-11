# util/ — low-level shared utilities

These packages provide small primitives shared by multiple capability families, zero-dependency except where a primitive is inherently transport-level (`http-proxy` depends on `undici`). Business semantics remain with each consuming capability.

| Package | Role |
|---|---|
| [`brand/`](brand/README.md) | Provides nominally branded types |
| [`paths/`](home-paths/README.md) | Resolves the Harness data root and shared paths |
| [`timeout/`](timeout/README.md) | Provides deadline and timeout classification primitives |
| [`retention/`](output-retention/README.md) | Bounds retained text and item collections |
| [`atomic-write/`](atomic-write/README.md) | Replaces files atomically |
| [`native-command/`](native-command/README.md) | Runs host-native commands without a shell |
| [`values/`](values/README.md) | Closed-union, lossless-JSON, deep-freeze, and weak-map-with-values helpers |
| [`deque/`](deque/README.md) | Circular deque with O(1) push/pop at both ends |
| [`time/`](time/README.md) | Validates and canonicalizes IANA time zones at wire boundaries |
| [`crypto/`](crypto/README.md) | Insecure-context-safe UUID minting and chunked base64 encoding |
| [`http-proxy/`](http-proxy/README.md) | Resolves and installs outbound HTTP proxy policy from the launch environment |
