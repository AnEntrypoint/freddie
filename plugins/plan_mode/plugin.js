// Plan mode plugin — registers enter_plan_mode and exit_plan_mode tools
import { _enterPlanMode, _exitPlanMode } from './handler.js';
import { setFreddieHomeGetter } from './state.js';

export default {
  name: 'plan-mode',
  version: '1.0.0',
  surfaces: 'pi',
  register({ pi, log, config, host }) {
    // Try to wire up freddie home getter for plan file paths.
    // Node.js: use require (sync). Browser: require is undefined, fall back
    // to dynamic import (fire-and-forget — the getter is set asynchronously).
    const wireHome = (mod) => {
      if (mod?.getFreddieHome) setFreddieHomeGetter(mod.getFreddieHome);
    };
    try {
      // Node.js path: synchronous require.
      const mod = require('../../src/home.js');
      wireHome(mod);
    } catch {
      // Browser path: require is not defined, try dynamic import.
      // src/home.js itself uses node builtins and will fail in browser,
      // but the .catch() handles that gracefully.
      import('../../src/home.js').then(wireHome).catch(() => {});
    }

    pi.tools.register(_enterPlanMode);
    pi.tools.register(_exitPlanMode);
    log.info('plan-mode plugin registered');
  },
};