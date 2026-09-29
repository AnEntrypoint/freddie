import { Session } from '@freddie/freddie-session'

export function seedDescriptorTurn(childId, seed, descriptor) {
  const staged = Session.create(childId, seed)
  staged.append('subagent/descriptor', descriptor)
  return [...staged.events]
}
