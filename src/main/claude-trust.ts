import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { logger } from './logger'

/**
 * Auto-register a project path as trusted in `~/.claude.json`.
 *
 * Inspired by emdash's `claude-trust-service`. Claude Code stores trust state
 * for each project root under `projects[absolutePath]` in `~/.claude.json`,
 * with two flags:
 *   - hasTrustDialogAccepted: true
 *   - hasCompletedProjectOnboarding: true
 * Writing both means claude won't show the "Do you trust the files in this
 * folder?" dialog when it spawns there.
 *
 * Atomic write via tmp + rename. No-op if claude isn't installed yet
 * (~/.claude.json absent) or if trust is already set. Best-effort: we never
 * throw — the worst case is that the user sees the trust prompt once.
 */

const CONFIG_PATH = join(homedir(), '.claude.json')

// In-flight lock so concurrent calls don't clobber each other. Per-process is
// enough — the only writer in the system is us. Different paths can still
// serialize behind this single lock since the file we're writing is shared.
let chain: Promise<void> = Promise.resolve()

export async function trustProjectForClaude(projectPath: string): Promise<void> {
  const target = resolve(projectPath)
  chain = chain.then(() => doTrust(target), () => doTrust(target))
  return chain
}

async function doTrust(target: string): Promise<void> {
  let raw: string
  try {
    raw = await fs.readFile(CONFIG_PATH, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No config yet → claude hasn't been initialised; bail.
      return
    }
    await logger.warn('claude-trust: read failed', {
      target,
      reason: (err as Error).message,
    })
    return
  }

  let cfg: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!isPlainObject(parsed)) {
      await logger.warn('claude-trust: refusing to rewrite non-object config root')
      return
    }
    cfg = parsed
  } catch (err) {
    await logger.warn('claude-trust: refusing to rewrite corrupt config', {
      reason: (err as Error).message,
    })
    return
  }

  const projects: Record<string, unknown> = isPlainObject(cfg.projects)
    ? (cfg.projects as Record<string, unknown>)
    : {}

  const existing: Record<string, unknown> = isPlainObject(projects[target])
    ? (projects[target] as Record<string, unknown>)
    : {}

  if (existing.hasTrustDialogAccepted === true && existing.hasCompletedProjectOnboarding === true) {
    return // already trusted
  }

  const next = {
    ...cfg,
    projects: {
      ...projects,
      [target]: {
        ...existing,
        hasTrustDialogAccepted: true,
        hasCompletedProjectOnboarding: true,
      },
    },
  }

  const tmp = `${CONFIG_PATH}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
    await fs.rename(tmp, CONFIG_PATH)
    await logger.info('claude-trust: project marked trusted', { target })
  } catch (err) {
    try {
      await fs.rm(tmp, { force: true })
    } catch {
      /* best effort */
    }
    await logger.warn('claude-trust: write failed', {
      target,
      reason: (err as Error).message,
    })
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
