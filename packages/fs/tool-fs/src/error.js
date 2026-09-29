import { FsError } from '@freddie/freddie-fs'

const REMEDIES = {
  FS_STALE_VERSION: 're-read the file, then retry',
  FS_NOT_OBSERVED: 'read the file, then retry',
}

export function remediateFsError(error) {
  if (!(error instanceof FsError)) return error
  const remedy = REMEDIES[error.code]
  if (!remedy) return error
  return new FsError(`${error.message} — ${remedy}`, error.code, { cause: error })
}
