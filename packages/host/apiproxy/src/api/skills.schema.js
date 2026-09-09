/**
 * skills domain request/response shapes. Previously zod schemas; validation
 * has been removed repo-wide (malformed requests now fail differently
 * downstream rather than being rejected at this boundary). skill.list has no
 * transform logic of its own (payload is just { sessionId }, value is just
 * { skills }), so there is nothing left to validate or reshape here.
 *
 * skillListRequestSchema / skillListValueSchema are kept as trivial
 * pass-through stand-ins (still exposing .parse/.safeParse) only because
 * fetch/handler.js and fetch/client.js are being converted to drop schema
 * validation in a separate, concurrent pass over the shared UNARY_ROUTES /
 * VALUE_SCHEMAS registries — once those call sites stop calling
 * schema.safeParse/schema.parse, these exports can be deleted outright.
 */

function passthrough(value) {
  return { success: true, data: value }
}

/** skill.list request payload — pass-through until handler.js's route registry drops schema.safeParse. */
export const skillListRequestSchema = {
  parse: (value) => value,
  safeParse: passthrough,
}

/** skill.list response value — pass-through until client.js's VALUE_SCHEMAS registry drops schema.parse. */
export const skillListValueSchema = {
  parse: (value) => value,
  safeParse: passthrough,
}
