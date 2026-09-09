/**
 * Durable command event vocabulary and the registry's Cordis event
 * declaration, shared with type-only consumers. Client-safe: nothing here
 * reaches a Host-only symbol, so a Client compilation face reads the same
 * `commands/change` signature the Host emits.
 *
 * This module carries no runtime exports — every declaration here was a
 * TypeScript-only type, interface, or module augmentation with zero
 * runtime value.
 *
 * @module @freddie/freddie-commands/types
 */
