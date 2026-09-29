import {
  createSnapshotStore,
} from '@freddie/freddie-client-runtime/client'

export function createTrajectoryDurationStore() {
  return createSnapshotStore(false, {
    persist: { name: 'dsh.trajectory.duration' },
  })
}
