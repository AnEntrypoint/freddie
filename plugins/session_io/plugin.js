import { _exportSession, _importSession, _sessionMerge } from './handler.js'

export default {
    name: 'session-io',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(_exportSession)
        pi.tools.register(_importSession)
        pi.tools.register(_sessionMerge)
    },
}