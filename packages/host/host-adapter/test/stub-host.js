export const TOOL_NAMES = [
  'glob_files', 'grep_files', 'read_file', 'ReadMediaFile', 'write_file', 'edit_file', 'FetchURL', 'WebSearch', 'Bash', 'TaskOutput',
  'TaskStop', 'TaskList', 'WaitFor', 'Skill', 'install_skill', 'Agent', 'AgentSwarm', 'superagent', 'AskUserQuestion', 'TodoList',
  'NotifyUser', 'ExitPlanMode', 'vision', 'read_tool_result', 'capability_search', 'select_tools', 'ReadMcpResourceTool',
  'CronCreate', 'CronList', 'CronDelete', 'CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal', 'Browser',
  'TowerInit', 'TowerPlan', 'TowerSpawn', 'TowerMission', 'TowerStatus', 'TowerMerge', 'TowerRebase', 'TowerTeardown',
  'TowerInbox', 'TowerSend', 'TowerFinding', 'TowerReview', 'TowerComplete',
]

export const CAPABILITY_NAMESPACE = {
  'tools.file': 'tools', 'tools.shell': 'tools', 'tools.web': 'tools', 'tools.agent': 'tools', 'tools.session': 'tools',
  'tools.browser': 'tools', 'tools.mcp': 'tools', 'agent.core': 'agent', 'agent.persistence': 'agent',
  'net.fetch': 'fetch', 'net.tls': null, 'net.server': 'serve', 'net.ws': null,
  fs: 'fs', watch: 'watch', proc: 'proc', pty: 'pty', timers: 'timers', dns: 'dns', crypto: 'crypto', sqlite: 'sqlite', loader: 'loader', reload: 'reload',
}

const VERSION = { interface: 1, minor: 0, host: 'fx', hostVersion: 'stub', table: 'stub' }

export function stubHost({ omit = [], extraCapabilities = {}, version = VERSION } = {}) {
  const files = new Map()
  const tools = Object.fromEntries(TOOL_NAMES.map((name) => [name, async (args) => ({ ok: true, text: name + ':' + JSON.stringify(args ?? {}), images: [] })]))
  tools.$list = () => TOOL_NAMES.map((name) => ({ name, description: name, kind: 'tool' }))
  const agent = Object.assign((options) => ({ name: options?.name ?? 'stub', close: async () => {} }), {
    sessions: { list: async () => [{ id: 's1' }], open: (id) => ({ id }), fork: async (id) => id + '-fork', delete: async () => {} },
    hooks: { on: () => () => {} },
    createMemoryPersistence: () => ({ load: async () => ({}), append: async () => ({ cursor: '1' }) }),
  })
  const namespaces = {
    tools,
    agent,
    fetch: async (url) => ({ ok: true, url: String(url) }),
    serve: (options) => ({ port: 0, options, close: async () => {}, reload() {}, upgrade: () => false }),
    fs: {
      exists: async (path) => files.has(path),
      readFile: async (path) => files.get(path),
      writeFile: async (path, data) => { files.set(path, data) },
      readdir: async () => [],
      stat: async () => ({ size: 0, mode: 0o644, type: 'file', mtimeMs: 0 }),
    },
    watch: () => ({ close() {} }),
    proc: { spawn: () => ({ pid: 1 }), exit: () => { throw new Error('exit') }, info: () => ({ pid: 1, platform: 'stub' }) },
    pty: { open: () => ({ write() {}, kill() {} }) },
    timers: { setTimeout, setInterval, clearTimeout, clearInterval, now: () => 0 },
    dns: { lookup: async (hostname) => [{ address: '127.0.0.1', family: 4, hostname }] },
    crypto: { randomBytes: (n) => new Uint8Array(n), hash: () => new Uint8Array(32), hmac: () => new Uint8Array(32), subtle: {} },
    sqlite: { open: () => ({ exec() {}, close() {} }) },
    loader: { root: { path: '/stub', rule: 'project' }, resolve: (specifier) => specifier },
    reload: { markHealthy() {}, dependents: () => [], on: () => () => {} },
  }
  const capabilities = Object.fromEntries(Object.keys(CAPABILITY_NAMESPACE).map((id) => [id, { present: !omit.includes(id), since: 0, status: 'exists' }]))
  const host = { version, capabilities: { ...capabilities, ...extraCapabilities } }
  for (const [id, namespace] of Object.entries(CAPABILITY_NAMESPACE)) {
    if (namespace !== null && !omit.includes(id) && !(namespace in host)) host[namespace] = namespaces[namespace]
  }
  return host
}
