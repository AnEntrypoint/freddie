import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { applyHomeOverride } from './home.js'

const REGISTRY_PATH = path.join(os.homedir(), '.freddie', 'projects.json')

const DEFAULT_REGISTRY = {
    active: 'default',
    projects: [
        { name: 'default', path: path.join(os.homedir(), '.freddie'), created_at: new Date().toISOString() },
    ],
}

function ensureRegistry() {
    const dir = path.dirname(REGISTRY_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(REGISTRY_PATH)) {
        fs.writeFileSync(REGISTRY_PATH, JSON.stringify(DEFAULT_REGISTRY, null, 2))
    }
}

export function loadRegistry() {
    ensureRegistry()
    try {
        const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
        if (!raw.projects || !Array.isArray(raw.projects)) return DEFAULT_REGISTRY
        if (!raw.projects.find(p => p.name === 'default')) raw.projects.unshift(DEFAULT_REGISTRY.projects[0])
        if (!raw.active) raw.active = 'default'
        return raw
    } catch { return DEFAULT_REGISTRY }
}

function saveRegistry(reg) {
    ensureRegistry()
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2))
}

export function listProjects() { return loadRegistry().projects }

export function getActiveProject() {
    const reg = loadRegistry()
    return reg.projects.find(p => p.name === reg.active) || reg.projects[0]
}

export function createProject({ name, projectPath }) {
    if (!name || !projectPath) throw new Error('name and path are required')
    if (!path.isAbsolute(projectPath)) throw new Error('path must be absolute')
    const reg = loadRegistry()
    if (reg.projects.find(p => p.name === name)) throw new Error('project name already exists')
    if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true })
    reg.projects.push({ name, path: projectPath, created_at: new Date().toISOString() })
    saveRegistry(reg)
    return reg.projects[reg.projects.length - 1]
}

export function deleteProject(name) {
    if (name === 'default') throw new Error('cannot delete default project')
    const reg = loadRegistry()
    reg.projects = reg.projects.filter(p => p.name !== name)
    if (reg.active === name) reg.active = 'default'
    saveRegistry(reg)
}

export function setActiveProject(name) {
    const reg = loadRegistry()
    const proj = reg.projects.find(p => p.name === name)
    if (!proj) throw new Error('unknown project: ' + name)
    reg.active = name
    saveRegistry(reg)
    applyHomeOverride(proj.path)
    return proj
}

export function applyActiveProjectFromRegistry() {
    const proj = getActiveProject()
    if (proj) applyHomeOverride(proj.path)
    return proj
}
