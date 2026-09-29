import z from '@freddie/schemastery'

export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation'

export const BUSY_ENTER_FIELD = 'busyEnter'

export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer']

export const DEFAULT_BUSY_ENTER_BEHAVIOR = 'queue'

export const ConversationSettingsSchema = z.object({
  [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR),
})
