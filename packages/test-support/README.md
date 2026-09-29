# test-support/ — development and test infrastructure

This group is reserved for packages that support repository development, tests, and examples rather than product APIs. Their compatibility follows the development need they serve. It currently holds no packages.

The development-time runtime-contract assertion package lives in [`runtime-diagnostics/invariants/`](../runtime-diagnostics/invariants/README.md), and its contract is documented in [docs/subsystems/invariants.md](../../docs/subsystems/invariants.md).

A package belongs here only while it serves development alone; it moves out when it gains a product contract and product consumers.
