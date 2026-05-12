import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeAccount, ClaudeStatus } from '../shared/ipc'
import { logger } from './logger'

const exec = promisify(execFile)
const TIMEOUT_MS = 8_000

/**
 * Common install locations for the `claude` CLI on macOS / Linux. We probe
 * these directly because GUI-launched Electron apps on macOS do not inherit
 * the login shell's PATH, so `which claude` from `process.env.PATH` typically
 * fails even when claude is installed via Homebrew or npm -g.
 */
const CANDIDATE_PATHS: string[] = [
  '/opt/homebrew/bin/claude', // Apple Silicon brew
  '/usr/local/bin/claude', // Intel brew + classic
  '/usr/bin/claude',
  join(homedir(), '.local/bin/claude'),
  join(homedir(), '.npm-global/bin/claude'),
  join(homedir(), '.nvm/versions/node/*/bin/claude'), // glob, expanded below
  join(homedir(), '.claude/local/claude'),
  join(homedir(), 'bin/claude'),
]

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Best-effort: ask the user's login shell where claude is. */
async function loginShellWhich(): Promise<string | null> {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await exec(shell, ['-ilc', 'command -v claude'], {
      timeout: TIMEOUT_MS,
      env: process.env,
    })
    const line = stdout.trim().split('\n').pop() || ''
    return line && line.startsWith('/') ? line : null
  } catch {
    return null
  }
}

/** Expand a single `*` segment by listing its parent directory. */
async function expandGlob(pattern: string): Promise<string[]> {
  if (!pattern.includes('*')) return [pattern]
  const parts = pattern.split('/')
  const starIdx = parts.findIndex((p) => p.includes('*'))
  if (starIdx === -1) return [pattern]
  const parent = parts.slice(0, starIdx).join('/') || '/'
  const tail = parts.slice(starIdx + 1).join('/')
  try {
    const entries = await fs.readdir(parent)
    return entries.map((e) => (tail ? `${parent}/${e}/${tail}` : `${parent}/${e}`))
  } catch {
    return []
  }
}

async function findBinary(): Promise<{ path: string; checked: string[] } | { path: null; checked: string[] }> {
  const checked: string[] = []

  // 1. Try the login shell's resolution (handles asdf, nvm shims, custom PATH).
  const shellHit = await loginShellWhich()
  if (shellHit) {
    checked.push(`shell:${shellHit}`)
    if (await exists(shellHit)) return { path: shellHit, checked }
  }

  // 2. Probe known install locations.
  const expanded: string[] = []
  for (const p of CANDIDATE_PATHS) {
    expanded.push(...(await expandGlob(p)))
  }
  for (const p of expanded) {
    checked.push(p)
    if (await exists(p)) return { path: p, checked }
  }

  return { path: null, checked }
}

async function getVersion(binary: string): Promise<string | null> {
  try {
    const { stdout } = await exec(binary, ['--version'], { timeout: TIMEOUT_MS })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Auth heuristic: Claude Code stores config + credential metadata in
 * `~/.claude.json` (and a `.backup` sibling). On a brand-new machine it does
 * not exist. After `claude login` (or any successful interactive session) it
 * does, and is non-trivial in size. We treat presence + non-tiny size as
 * "this user has authed at some point".
 *
 * We deliberately do not parse the file (the schema changes between versions
 * and is undocumented). A real auth probe will come when we actually spawn
 * `claude -p`; until then this gates the onboarding screen well enough.
 */
async function isAuthed(_binary: string): Promise<boolean> {
  const candidates = [join(homedir(), '.claude.json'), join(homedir(), '.claude.json.backup')]
  for (const p of candidates) {
    try {
      const stat = await fs.stat(p)
      if (stat.size > 64) return true
    } catch {
      /* try next */
    }
  }
  return false
}

/**
 * Best-effort read of the user's account info from `~/.claude.json`. The
 * file is owned by claude itself — schema can change between versions, so we
 * pull only the few fields we want and tolerate them missing.
 */
async function readAccount(): Promise<ClaudeAccount | undefined> {
  const path = join(homedir(), '.claude.json')
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const root = parsed as Record<string, unknown>
  const acct = root['oauthAccount']
  if (!acct || typeof acct !== 'object') return undefined
  const a = acct as Record<string, unknown>
  const pick = (k: string): string | undefined => {
    const v = a[k]
    return typeof v === 'string' && v.length > 0 ? v : undefined
  }
  return {
    displayName: pick('displayName'),
    emailAddress: pick('emailAddress'),
    seatTier: pick('seatTier'),
    organizationName: pick('organizationName'),
    billingType: pick('billingType'),
  }
}

export async function detectClaude(): Promise<ClaudeStatus> {
  const found = await findBinary()
  if (!found.path) {
    await logger.info('claude not found', { checked: found.checked })
    return { state: 'missing', checkedPaths: found.checked }
  }

  const version = await getVersion(found.path)
  if (!version) {
    await logger.warn('claude found but --version failed', { path: found.path })
    return { state: 'error', message: `claude at ${found.path} did not respond to --version` }
  }

  const authed = await isAuthed(found.path)
  await logger.info('claude detected', { path: found.path, version, authed })
  if (!authed) return { state: 'unauthed', binaryPath: found.path, version }
  const account = await readAccount()
  return { state: 'ok', binaryPath: found.path, version, authed: true, account }
}
