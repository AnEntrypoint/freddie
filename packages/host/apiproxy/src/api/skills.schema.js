function passthrough(value) {
  return { success: true, data: value }
}

export const skillListRequestSchema = {
  parse: (value) => value,
  safeParse: passthrough,
}

export const skillListValueSchema = {
  parse: (value) => value,
  safeParse: passthrough,
}
