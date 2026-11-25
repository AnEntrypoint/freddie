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
  'process_info', 'fs_exists', 'fs_stat', 'fs_read', 'fs_write', 'fs_read_range', 'fs_write_at', 'fs_readdir', 'fs_mkdir', 'fs_mkdtemp',
  'fs_remove', 'fs_rename', 'fs_copy', 'fs_realpath', 'fs_readlink', 'fs_symlink', 'fs_link', 'fs_chmod', 'fs_truncate', 'run_command',
  'random_bytes', 'hash_digest',
]

export const MODULE_NAMES = [
  'child_process', 'crypto', 'fs', 'fs/promises', 'net', 'os', 'path', 'process', 'string_decoder', 'timers/promises', 'url', 'util', 'util/types',
]

export const CAPABILITY_NAMES = ['tools', 'verbs', ...MODULE_NAMES]

const VERSION = { interface: 1, minor: 0, host: 'fx' }

export function stubHost({ omit = [], extraCapabilities = [], version = VERSION } = {}) {
  const files = new Map()
  const tools = Object.fromEntries(TOOL_NAMES.map((name) => [name, async (args) => ({ ok: true, text: name + ':' + JSON.stringify(args ?? {}), images: [] })]))
  const verbs = Object.fromEntries(VERB_NAMES.map((name) => [name, (args) => ({ ok: true, verb: name, args: args ?? null })]))
  const modules = Object.fromEntries(MODULE_NAMES.map((name) => [name, {}]))
  modules.fs = {
    existsSync: (path) => files.has(path),
    readFileSync: (path) => files.get(path),
    writeFileSync: (path, data) => { files.set(path, data) },
  }
  modules.crypto = { randomBytes: (n) => new Uint8Array(n) }
  modules.process = { platform: 'stub', env: {} }
  return {
    version,
    capabilities: [...CAPABILITY_NAMES.filter((name) => !omit.includes(name)), ...extraCapabilities],
    tools,
    verbs,
    modules,
  }
}
