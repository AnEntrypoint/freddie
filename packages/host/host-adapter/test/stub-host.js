export const TOOL_NAMES = [
  'glob_files', 'grep_files', 'read_file', 'ReadMediaFile', 'write_file', 'edit_file',
  'FetchURL', 'WebSearch', 'Bash', 'TaskOutput', 'TaskStop', 'TaskList',
  'WaitFor', 'Skill', 'install_skill', 'Agent', 'superagent', 'AskUserQuestion',
  'TodoList', 'NotifyUser', 'ExitPlanMode', 'vision', 'read_tool_result', 'capability_search',
  'select_tools', 'ReadMcpResourceTool', 'CronCreate', 'CronList', 'CronDelete', 'CreateGoal',
  'GetGoal', 'SetGoalBudget', 'UpdateGoal', 'Browser', 'TowerInit', 'TowerPlan',
  'TowerSpawn', 'TowerMission', 'TowerStatus', 'TowerMerge', 'TowerRebase', 'TowerTeardown',
  'TowerInbox', 'TowerSend', 'TowerFinding', 'TowerReview', 'TowerComplete',
]

export const VERB_NAMES = [
  'dns_lookup', 'fs_chmod', 'fs_copy', 'fs_exists', 'fs_link',
  'fs_mkdir', 'fs_mkdtemp', 'fs_read', 'fs_read_range', 'fs_readdir',
  'fs_readlink', 'fs_realpath', 'fs_remove', 'fs_rename', 'fs_stat',
  'fs_symlink', 'fs_truncate', 'fs_write', 'fs_write_at', 'hash_digest',
  'net_fetch', 'proc_close_stdin', 'proc_kill', 'proc_read', 'proc_spawn',
  'proc_wait', 'proc_write', 'process_info', 'pty_read', 'pty_spawn',
  'pty_wait', 'pty_write', 'random_bytes', 'run_command', 'serve_accept',
  'serve_listen', 'serve_respond', 'sqlite_all', 'sqlite_close', 'sqlite_exec',
  'sqlite_open', 'watch_close', 'watch_poll', 'watch_start', 'ws_close',
  'ws_connect', 'ws_recv', 'ws_send',
]

export const MODULE_NAMES = [
  'agent', 'child_process', 'crypto', 'dns/promises', 'fetch', 'fs',
  'fs/promises',
  'loader', 'net', 'os', 'path', 'process', 'pty',
  'serve', 'sqlite', 'string_decoder', 'timers/promises', 'url', 'util',
  'util/types', 'ws',
]

export const CAPABILITY_NAMES = ['tools', 'verbs', ...MODULE_NAMES]

const VERSION = { interface: 1, minor: 0, host: 'fx' }

export function stubHost({ omit = [], extraCapabilities = [], version = VERSION } = {}) {
  const files = new Map()
  const tools = Object.fromEntries(TOOL_NAMES.map((name) => [name, async (args) => ({ ok: true, text: name + ':' + JSON.stringify(args ?? {}), images: [] })]))
  const verbs = Object.fromEntries(VERB_NAMES.map((name) => [name, (args) => ({ ok: true, verb: name, args: args ?? null })]))
  const modules = Object.fromEntries(MODULE_NAMES.map((name) => [name, {}]))
  modules.agent = { core: (options) => ({ name: options?.name ?? 'stub', close: async () => {} }) }
  modules.fetch = { fetch: async (url) => ({ ok: true, url: String(url) }) }
  modules.fs = {
    existsSync: (path) => files.has(path),
    readFileSync: (path) => files.get(path),
    writeFileSync: (path, data) => { files.set(path, data) },
    watch: () => ({ close() {} }),
  }
  modules.crypto = { randomBytes: (n) => new Uint8Array(n) }
  modules.process = { platform: 'stub', env: {} }
  modules.serve = { serve: (options) => ({ port: options?.port ?? 0, accept: () => ({ method: 'GET', path: '/', upgrade: false, body: '', respond() {}, websocket: { send() {}, recv: () => '' } }) }) }
  modules.pty = { spawn: () => ({ pid: 1 }) }
  modules.sqlite = { open: () => ({ close() {} }) }
  modules['dns/promises'] = { lookup: async (hostname) => ({ address: '127.0.0.1', family: 4, hostname }) }
  modules.ws = { connect: () => ({ send() {}, recv: () => '', close() {} }) }
  modules.loader = { reload: async (path) => ({ path: String(path) }) }
  return {
    version,
    capabilities: [...CAPABILITY_NAMES.filter((name) => !omit.includes(name)), ...extraCapabilities],
    tools,
    verbs,
    modules,
  }
}
