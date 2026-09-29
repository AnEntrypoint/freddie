import z from '@freddie/schemastery'
import { settingsNamespace } from '@freddie/freddie-settings'

const ONBOARDING_SETTINGS_NAMESPACE = 'ui-onboarding'

const OnboardingSettingsSchema = z.object({
  welcomeNoticeVersion: z.string(),
})

export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(ONBOARDING_SETTINGS_NAMESPACE),
      OnboardingSettingsSchema,
    )
  })
}
