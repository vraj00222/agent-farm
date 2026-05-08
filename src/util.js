'use strict'

const path = require('path')
const { execFileSync } = require('child_process')
const { existsSync } = require('fs')

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'to', 'for', 'of', 'and', 'or',
  'with', 'on', 'at', 'by', 'from', 'as', 'is', 'be',
])

function slugify(prompt) {
  const override = prompt.match(/^@([a-z0-9][a-z0-9-]*):/i)
  if (override) return override[1].toLowerCase()

  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w))
    .slice(0, 4)
    .join('-')

  return slug || 'task'
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function gitTry(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function uniqueSlug(repoRoot, baseId, taken = new Set()) {
  const repoName = path.basename(repoRoot)
  let id = baseId
  let i = 2
  while (true) {
    const branch = `agent/${id}`
    const wtPath = path.resolve(repoRoot, '..', `${repoName}-${id}`)
    const collide =
      taken.has(id) ||
      gitTry(['rev-parse', '--verify', branch], repoRoot) ||
      existsSync(wtPath)
    if (!collide) {
      taken.add(id)
      return { id, branch, worktreePath: wtPath }
    }
    id = `${baseId}-${i++}`
  }
}

const SUPPORTS_COLOR =
  process.stdout.isTTY && process.env.TERM !== 'dumb' && !process.env.NO_COLOR

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function paint(code, s) {
  if (!SUPPORTS_COLOR) return s
  return `${code}${s}${ANSI.reset}`
}

const c = {
  bold: (s) => paint(ANSI.bold, s),
  dim: (s) => paint(ANSI.dim, s),
  red: (s) => paint(ANSI.red, s),
  green: (s) => paint(ANSI.green, s),
  yellow: (s) => paint(ANSI.yellow, s),
  blue: (s) => paint(ANSI.blue, s),
  magenta: (s) => paint(ANSI.magenta, s),
  cyan: (s) => paint(ANSI.cyan, s),
  gray: (s) => paint(ANSI.gray, s),
}

const TAG_PALETTE = [ANSI.cyan, ANSI.magenta, ANSI.yellow, ANSI.green, ANSI.blue, ANSI.red]

function tagColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}

function makeTagger(id, width) {
  const code = tagColor(id)
  const padded = id.padEnd(width, ' ')
  const tag = SUPPORTS_COLOR ? `${code}[${padded}]${ANSI.reset}` : `[${padded}]`
  return (line) => `${tag} ${line}`
}

const ANSI_STRIP_RE = /\x1b\[[0-9;]*[a-zA-Z]/g
function stripAnsi(s) {
  return s.replace(ANSI_STRIP_RE, '')
}

function lineBuffer(handler) {
  let buf = ''
  const flush = () => {
    if (buf.length > 0) {
      handler(buf)
      buf = ''
    }
  }
  const push = (chunk) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) handler(line)
  }
  return { push, flush }
}

function fmtElapsed(ms) {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}m${String(r).padStart(2, '0')}s`
}

module.exports = {
  slugify,
  git,
  gitTry,
  uniqueSlug,
  c,
  ANSI,
  SUPPORTS_COLOR,
  tagColor,
  makeTagger,
  stripAnsi,
  lineBuffer,
  fmtElapsed,
}
