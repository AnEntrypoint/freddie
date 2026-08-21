// Plan mode plugin — registers enter_plan_mode and exit_plan_mode tools
import { _enterPlanMode, _exitPlanMode } from './handler.js';
import { setFreddieHomeGetter } from './state.js';

export default {
  name: 'plan-mode',
  version: '1.0.0',
  surfaces: 'pi',
  async register({ pi, log, config, host }) {
    // Wire up freddie home getter for plan file paths BEFORE registering the
    // tools (host.js's makePluginLoader awaits every plugin's register(), so
    // an async register here is safe and already the documented contract).
    // A fire-and-forget .then() used to race state.js's getPlanFilePath(): its
    // first call for a given sessionId permanently caches whichever path was
    // available at that moment (_planFiles.set, never invalidated), so a tool
    // call landing before this import resolved would lock that session onto
    // the wrong /plans/<id>.md browser-fallback path forever, even once the
    // real getter became available moments later. Awaiting here eliminates
    // the race outright — package.json's "type":"module" means require is
    // undefined regardless of Node vs browser, and src/home.js is pure ESM
    // (createRequire can't load it synchronously either), so a plain awaited
    // dynamic import is the correct fix, not a synchronous-require workaround.
    try {
      const mod = await import('../../src/home.js');
      if (mod?.getFreddieHome) setFreddieHomeGetter(mod.getFreddieHome);
    } catch { /* browser: src/home.js's node builtins fail to load, fall back to state.js's own virtual-path default */ }

    pi.tools.register(_enterPlanMode);
    pi.tools.register(_exitPlanMode);
    log.info('plan-mode plugin registered');
  },
};