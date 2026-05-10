import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { RecentProject } from '../shared/ipc'

const SETTINGS_VERSION = 1
const RECENTS_MAX = 8

interface SettingsShape {
  version: number
  recentProjects: RecentProject[]
}

const DEFAULTS: SettingsShape = {
  version: SETTINGS_VERSION,
  recentProjects: [],
}

let cache: SettingsShape | null = null
let writeChain: Promise<void> = Promise.resolve()

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

async function read(): Promise<SettingsShape> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SettingsShape>
    cache = {
      version: SETTINGS_VERSION,
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter(isRecentProject)
        : [],
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Corrupt file. Back it up so we don't silently lose user state.
      try {
        await fs.rename(settingsPath(), settingsPath() + '.corrupt')
      } catch {
        /* best-effort */
      }
    }
    cache = { ...DEFAULTS }
  }
  return cache
}

function isRecentProject(v: unknown): v is RecentProject {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.path === 'string' &&
    typeof r.repoName === 'string' &&
    typeof r.lastOpenedAt === 'number'
  )
}

/** Atomic write: tmp file + rename. Serialized so concurrent writers don't race. */
async function persist(next: SettingsShape): Promise<void> {
  cache = next
  const file = settingsPath()
  const tmp = file + '.tmp-' + process.pid
  writeChain = writeChain.then(async () => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
    await fs.rename(tmp, file)
  })
  return writeChain
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  const s = await read()
  return [...s.recentProjects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

export async function rememberProject(p: {
  path: string
  repoName: string
}): Promise<RecentProject[]> {
  const s = await read()
  const now = Date.now()
  const filtered = s.recentProjects.filter((r) => r.path !== p.path)
  filtered.unshift({ path: p.path, repoName: p.repoName, lastOpenedAt: now })
  const next: SettingsShape = {
    ...s,
    recentProjects: filtered.slice(0, RECENTS_MAX),
  }
  await persist(next)
  return next.recentProjects
}

export async function forgetProject(path: string): Promise<RecentProject[]> {
  const s = await read()
  const next: SettingsShape = {
    ...s,
    recentProjects: s.recentProjects.filter((r) => r.path !== path),
  }
  await persist(next)
  return next.recentProjects
}
