import { settingsNamespace } from '@freddie/freddie-settings'
import { CONVERSATION_SETTINGS_NAMESPACE, ConversationSettingsSchema } from './submission-settings.js'

export {
  BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE,
  DEFAULT_BUSY_ENTER_BEHAVIOR,
} from './submission-settings.js'

export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(CONVERSATION_SETTINGS_NAMESPACE),
      ConversationSettingsSchema,
    )
  })
}
