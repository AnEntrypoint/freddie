import { applyDiff } from '@freddie/webjsx'
import { createSlotRenderer } from './scoped-slots.js'
import { buildRenderApp } from './app.js'

export const inject = ['slots', 'sessions']

function mountApp(container, render) {
  applyDiff(container, render())
}

export function apply(ctx) {
  ctx.slots.install(createSlotRenderer())
  ctx.reflect.provide('uiRenderer', {
    mount: (container) => {
      const { render, dispose } = buildRenderApp({ ctx })
      let mounted = false
      const mountWhenRooted = () => {
        if (mounted || ctx.slots.entries('root').length === 0) return
        mounted = true
        mountApp(container, render)
      }
      const unsubscribe = ctx.slots.subscribe('root', mountWhenRooted)
      mountWhenRooted()
      return () => {
        unsubscribe()
        dispose()
        if (mounted) applyDiff(container, [])
      }
    },
  })
}
