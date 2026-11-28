import { HarnessError } from '@freddie/freddie-llm'

const SANDBOX_UNAVAILABLE = 'SANDBOX_UNAVAILABLE'

export class SandboxUnavailableError extends HarnessError {
  constructor(mode, detail) {
    super(
      `sandbox mode "${mode}" is requested but no sandbox backend is usable on this host; `
      + 'refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing '
      + 'kernel (Linux), or ensure sandbox-exec is usable (macOS) — otherwise switch the consumer to '
      + 'danger-full-access.'
      + (detail === undefined ? '' : ` Runner failure: ${detail}`),
      SANDBOX_UNAVAILABLE,
    )
    this.name = 'SandboxUnavailableError'
  }
}
