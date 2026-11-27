const fromTools = (service, members) => ({ service, capability: 'tools', source: 'tools', key: null, members, reason: null })
const fromModule = (service, name, members = null) => ({ service, capability: name, source: 'modules', key: name, members, reason: null })
const gap = (reason) => ({ service: null, capability: null, source: null, key: null, members: null, reason })

export const UNREPORTED_TOOLS = Object.freeze({
  AgentSwarm: 'model_visible false in fx tools.zig; the host catalog leaves it out (docs/host-interface.md section 2)',
})

export const UNREPORTED_VERBS = Object.freeze({
  net_fetch: 'backs the global fetch that fx installs in its runtime; fx:host does not list a fetch capability yet (host-interface section 3, net.fetch)',
})

export const VERB_BACKS = Object.freeze({
  process_info: 'process',
  fs_exists: 'fs', fs_stat: 'fs', fs_read: 'fs', fs_write: 'fs', fs_read_range: 'fs', fs_write_at: 'fs',
  fs_readdir: 'fs', fs_mkdir: 'fs', fs_mkdtemp: 'fs', fs_remove: 'fs', fs_rename: 'fs', fs_copy: 'fs',
  fs_realpath: 'fs', fs_readlink: 'fs', fs_symlink: 'fs', fs_link: 'fs', fs_chmod: 'fs', fs_truncate: 'fs',
  watch_start: 'fs', watch_poll: 'fs', watch_close: 'fs',
  run_command: 'child_process',
  proc_spawn: 'child_process', proc_write: 'child_process', proc_close_stdin: 'child_process',
  proc_read: 'child_process', proc_wait: 'child_process', proc_kill: 'child_process',
  random_bytes: 'crypto', hash_digest: 'crypto',
  dns_lookup: 'dns/promises',
  pty_spawn: 'pty', pty_write: 'pty', pty_read: 'pty', pty_wait: 'pty',
  sqlite_open: 'sqlite', sqlite_exec: 'sqlite', sqlite_all: 'sqlite', sqlite_close: 'sqlite',
  serve_listen: 'serve', serve_accept: 'serve', serve_respond: 'serve', ws_send: 'serve', ws_recv: 'serve',
  net_fetch: null,
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
  watch: fromModule('hostWatch', 'fs', ['watch']),
  proc: fromModule('hostProc', 'child_process'),
  process: fromModule('hostProcess', 'process'),
  timers: fromModule('hostTimers', 'timers/promises'),
  crypto: fromModule('hostCrypto', 'crypto'),
  dns: fromModule('hostDns', 'dns/promises', ['lookup', 'resolve']),
  pty: fromModule('hostPty', 'pty', ['spawn']),
  sqlite: fromModule('hostSqlite', 'sqlite', ['open']),
  'net.server': fromModule('hostServe', 'serve', ['serve']),
  'agent.core': gap('fx:host has no agent namespace; the agent runs as run_code and the tools (host-interface section 3.3, planned)'),
  'agent.persistence': gap('fx:host has no agent namespace; sessions reach the host through run_code and the tools (host-interface section 3.3, planned)'),
  'net.fetch': gap('fetch is the global fx installs (verb net_fetch); fx:host has no fetch capability yet (host-interface section 3, net.fetch)'),
  'net.tls': gap('TLS for serve and fetch is planned: serve has no cert option (host-interface section 3, net.tls)'),
  'net.ws': gap('the websocket server is reached through serve, and the websocket client is planned (host-interface section 3, net.ws)'),
  loader: gap('the loader and reload protocol are not built (fx stage 3)'),
  reload: gap('the reload protocol is not built (fx stage 3)'),
})
