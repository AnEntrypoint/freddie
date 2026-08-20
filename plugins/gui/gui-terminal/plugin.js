import { execCommand, terminalStatus } from './handler.js';

export default {
    name: 'gui-terminal',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('POST', '/api/terminal/exec', execCommand);
        gui.route('GET', '/api/terminal/status', terminalStatus);
    },
};