'use strict'

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

const STATE_VERSION = 1

function stateDir(repoRoot) {
  return path.join(repoRoot, '.agent-farm')
}

function statePath(repoRoot) {
  return path.join(stateDir(repoRoot), 'state.json')
}

function runsDir(repoRoot) {
  return path.join(stateDir(repoRoot), 'runs')
}

function ensureDirs(repoRoot) {
  fs.mkdirSync(runsDir(repoRoot), { recursive: true })
}

function atomicWrite(filepath, contents) {
  const tmp = `${filepath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, contents)
  fs.renameSync(tmp, filepath)
}

class State extends EventEmitter {
  constructor(repoRoot, data) {
    super()
    this.repoRoot = repoRoot
    this.data = data
  }

  static init({ repoRoot, baseSha, maxConcurrent }) {
    ensureDirs(repoRoot)
    const data = {
      version: STATE_VERSION,
      createdAt: Date.now(),
      repoRoot,
      baseSha,
      maxConcurrent,
      agents: {},
    }
    const s = new State(repoRoot, data)
    s.flush()
    return s
  }

  static read(repoRoot) {
    const p = statePath(repoRoot)
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf8')
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
    return new State(repoRoot, data)
  }

  putAgent(agent) {
    this.data.agents[agent.id] = { ...agent }
    this.flush()
    this.emit('change', { id: agent.id, kind: 'put' })
  }

  transition(id, newState, patch = {}) {
    const a = this.data.agents[id]
    if (!a) throw new Error(`unknown agent: ${id}`)
    a.state = newState
    Object.assign(a, patch)
    this.flush()
    this.emit('change', { id, kind: 'transition', state: newState })
    return a
  }

  appendLine(id, kind, line) {
    const a = this.data.agents[id]
    if (!a) return
    a.lastLines = a.lastLines || []
    a.lastLines.push(line)
    if (a.lastLines.length > 5) a.lastLines.shift()
    // Don't flush state.json on every line — too noisy. Just emit for live UI.
    this.emit('line', { id, kind, line })
  }

  get(id) {
    return this.data.agents[id]
  }

  all() {
    return Object.values(this.data.agents)
  }

  flush() {
    atomicWrite(statePath(this.repoRoot), JSON.stringify(this.data, null, 2))
  }
}

module.exports = { State, statePath, runsDir, stateDir }
