const fromTools = (service, members) => ({ service, capability: 'tools', source: 'tools', key: null, members, reason: null })
const fromModule = (service, name) => ({ service, capability: name, source: 'modules', key: name, members: null, reason: null })
const gap = (reason) => ({ service: null, capability: null, source: null, key: null, members: null, reason })

export const UNREPORTED_TOOLS = Object.freeze({
  AgentSwarm: 'model_visible false in fx tools.zig; the host catalog leaves it out (docs/host-interface.md section 2)',
})

export const VERB_BACKS = Object.freeze({
  process_info: 'process',
  fs_exists: 'fs', fs_stat: 'fs', fs_read: 'fs', fs_write: 'fs', fs_read_range: 'fs', fs_write_at: 'fs',
  fs_readdir: 'fs', fs_mkdir: 'fs', fs_mkdtemp: 'fs', fs_remove: 'fs', fs_rename: 'fs', fs_copy: 'fs',
  fs_realpath: 'fs', fs_readlink: 'fs', fs_symlink: 'fs', fs_link: 'fs', fs_chmod: 'fs', fs_truncate: 'fs',
  run_command: 'child_process',
  random_bytes: 'crypto', hash_digest: 'crypto',
})

export default Object.freeze({
  'tools.file': fromTools('hostFileTools', ['read_file', 'write_file', 'edit_file', 'glob_files', 'grep_files', 'ReadMediaFile']),
  'tools.shell': fromTools('hostShellTools', ['Bash', 'TaskOutput', 'TaskStop', 'TaskList', 'WaitFor']),
  'tools.web': fromTools('hostWebTools', ['FetchURL', 'WebSearch']),
  'tools.agent': fromTools('hostAgentTools', ['Agent', 'AgentSwarm', 'superagent']),
  'tools.session': fromTools('hostSessionTools', [
    'TodoList', 'Skill', 'install_skill', 'read_tool_result', 'AskUserQuestion', 'NotifyUser', 'ExitPlanMode', 'vision',
    'CronCreate', 'CronList', 'CronDelete', 'CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal',
    'TowerInit', 'TowerPlan', 'TowerSpawn', 'TowerMission', 'TowerStatus', 'TowerMerge', 'TowerRebase', 'TowerTeardown',
    'TowerInbox', 'TowerSend', 'TowerFinding', 'TowerReview', 'TowerComplete',
  ]),
  'tools.browser': fromTools('hostBrowserTools', ['Browser']),
  'tools.mcp': fromTools('hostMcpTools', ['capability_search', 'select_tools', 'ReadMcpResourceTool']),
  verbs: { service: 'hostVerbs', capability: 'verbs', source: 'verbs', key: null, members: null, reason: null },
  fs: fromModule('hostFs', 'fs'),
  proc: fromModule('hostProc', 'child_process'),
  process: fromModule('hostProcess', 'process'),
  timers: fromModule('hostTimers', 'timers/promises'),
  crypto: fromModule('hostCrypto', 'crypto'),
  'agent.core': gap('fx:host has no agent namespace; the agent runs as run_code and the tools (host-interface section 3.3, planned)'),
  'agent.persistence': gap('fx:host has no agent namespace; sessions reach the host through run_code and the tools (host-interface section 3.3, planned)'),
  'net.fetch': gap('fetch is planned; tools.FetchURL is the text tool (host-interface section 3.4)'),
  'net.tls': gap('TLS fetch and serve are planned (host-interface section 3.4)'),
  'net.server': gap('node:net provides isIP only; serve is planned'),
  'net.ws': gap('the WebSocket client and server are planned'),
  watch: gap('watch is not provided by fx:host yet (host-interface section 3, status row watch)'),
  pty: gap('pty is not exposed by fx:host; it lives in src/core/terminal/native_session.zig'),
  dns: gap('dns is not provided; dns/promises is a gap row of the host module table'),
  sqlite: gap('sqlite is not provided by fx:host yet'),
  loader: gap('the loader and reload protocol are not built (fx stage 3)'),
  reload: gap('the reload protocol is not built (fx stage 3)'),
})
