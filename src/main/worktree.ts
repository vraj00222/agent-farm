import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { logger } from './logger'

const exec = promisify(execFile)

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, timeout: 15_000 })
  return stdout
}

/** Where worktrees live. Keeping them outside the user's project tree so a
 *  ten-deep `git worktree add` doesn't pollute their directory listings. */
function worktreeRoot(): string {
  return join(homedir(), '.agent-farm', 'worktrees')
}

function worktreePathFor(projectPath: string, slug: string): string {
  return join(worktreeRoot(), `${basename(projectPath)}-${slug}`)
}

export interface CreateWorktreeResult {
  ok: true
  worktreePath: string
  branch: string
  baseSha: string
}

export interface CreateWorktreeError {
  ok: false
  reason: string
}

/** True if a branch with that name already exists in this repo. */
async function branchExists(projectPath: string, branch: string): Promise<boolean> {
  try {
    await git(['show-ref', '--verify', `refs/heads/${branch}`], projectPath)
    return true
  } catch {
    return false
  }
}

export async function createWorktree(
  projectPath: string,
  slug: string,
): Promise<CreateWorktreeResult | CreateWorktreeError> {
  try {
    await fs.mkdir(worktreeRoot(), { recursive: true })

    // base SHA — what we branch off
    const baseSha = (await git(['rev-parse', 'HEAD'], projectPath)).trim()

    // Avoid colliding with stale branches from previous runs. If
    // `agent/<slug>` is taken, try `agent/<slug>-2`, `-3`, …, `-50`.
    let branch = `agent/${slug}`
    let worktreePath = worktreePathFor(projectPath, slug)
    let suffix = 1
    while (await branchExists(projectPath, branch)) {
      suffix += 1
      if (suffix > 50) {
        return { ok: false, reason: `branch agent/${slug} already exists (and 50 numbered variants)` }
      }
      branch = `agent/${slug}-${suffix}`
      worktreePath = worktreePathFor(projectPath, `${slug}-${suffix}`)
    }

    // git worktree add --detach? we want a real branch so the user can
    // cherry-pick / push later.
    await git(['worktree', 'add', '-b', branch, worktreePath, baseSha], projectPath)

    await logger.info('worktree created', { projectPath, branch, worktreePath, baseSha })
    return { ok: true, worktreePath, branch, baseSha }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await logger.error('worktree create failed', { projectPath, slug, reason })
    return { ok: false, reason }
  }
}

export async function removeWorktree(
  projectPath: string,
  worktreePath: string,
  branch: string,
  opts: { keepBranch?: boolean } = {},
): Promise<{ ok: boolean; reason?: string }> {
  try {
    // --force so a dirty worktree doesn't block cleanup.
    await git(['worktree', 'remove', '--force', worktreePath], projectPath).catch(async () => {
      // worktree might already be unlinked; rm the path manually.
      await fs.rm(worktreePath, { recursive: true, force: true })
      await git(['worktree', 'prune'], projectPath).catch(() => {})
    })

    if (!opts.keepBranch) {
      await git(['branch', '-D', branch], projectPath).catch(() => {})
    }

    await logger.info('worktree removed', { worktreePath, branch })
    return { ok: true }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await logger.warn('worktree remove failed', { worktreePath, reason })
    return { ok: false, reason }
  }
}
