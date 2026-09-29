import { Service } from '@freddie/cordis'
import { HarnessError } from '@freddie/freddie-llm'

export {
  ESCALATION_TARGETS,
  WIDER_MODES,
  approveEscalation,
  escalationHintMarker,
  sandboxDenialMarker,
  validateEscalationArgs,
} from './escalation.js'
export { canonicalPath, writableRoots } from './roots.js'

export const SANDBOX_UNAVAILABLE = 'SANDBOX_UNAVAILABLE'

export class SandboxUnavailableError extends HarnessError {
  constructor(mode, detail) {
    super(
      `sandbox mode "${mode}" is requested but no sandbox backend is usable on this host; `
      + 'refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing '
      + 'kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL '
      + 'restricted-token runner can start (Windows) — otherwise switch the consumer to '
      + 'danger-full-access.'
      + (detail === undefined ? '' : ` Runner failure: ${detail}`),
      SANDBOX_UNAVAILABLE,
    )
    this.name = 'SandboxUnavailableError'
  }
}

export class SandboxProvider extends Service {
  /* v8 ignore next */
  constructor(ctx) {
    super(ctx, 'sandbox')
  }

  confine(argv, policy) {
    throw new Error('SandboxProvider.confine is abstract and must be implemented by a concrete provider')
  }
}

export default SandboxProvider
