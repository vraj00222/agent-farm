import { dialog, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, join } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  ProjectCloneOptions,
  ProjectCloneResult,
  ProjectInfo,
  ProjectOpenResult,
} from '../shared/ipc'
import { logger } from './logger'
import { rememberProject } from './settings'
import { trustProjectForClaude } from './claude-trust'

const exec = promisify(execFile)

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, timeout: 5000 })
  return stdout.trim()
}

/** Returns the repo top-level if `path` is inside a git working tree. */
async function gitTopLevel(path: string): Promise<string | null> {
  try {
    return await git(['rev-parse', '--show-toplevel'], path)
  } catch {
    return null
  }
}

async function getHeadSha(repoPath: string): Promise<string> {
  try {
    return await git(['rev-parse', 'HEAD'], repoPath)
  } catch {
    // Fresh repo with no commits — perfectly valid.
    return ''
  }
}

async function isDirty(repoPath: string): Promise<boolean> {
  try {
    const out = await git(['status', '--porcelain'], repoPath)
    return out.length > 0
  } catch {
    return false
  }
}

export async function openProjectDialog(
  parent: BrowserWindow | null,
): Promise<ProjectOpenResult> {
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        title: 'Open project',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Open',
      })
    : await dialog.showOpenDialog({
        title: 'Open project',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Open',
      })

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, reason: 'cancelled' }
  }

  const picked = result.filePaths[0]
  return inspectPath(picked)
}

async function hasIndexHtml(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(`${dir}/index.html`)
    return stat.isFile()
  } catch {
    return false
  }
}

export async function inspectPath(path: string): Promise<ProjectOpenResult> {
  try {
    const stat = await fs.stat(path)
    if (!stat.isDirectory()) {
      return { ok: false, reason: 'unreadable', path, message: 'Not a directory' }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'unreadable', path, message }
  }

  const top = await gitTopLevel(path)
  const root = top ?? path
  const isGitRepo = top !== null

  const [baseSha, dirty, indexHtml] = await Promise.all([
    isGitRepo ? getHeadSha(root) : Promise.resolve(''),
    isGitRepo ? isDirty(root) : Promise.resolve(false),
    hasIndexHtml(root),
  ])

  const info: ProjectInfo = {
    path: root,
    repoName: basename(root),
    baseSha,
    isGitRepo,
    dirty,
    hasIndexHtml: indexHtml,
  }

  await rememberProject({ path: info.path, repoName: info.repoName })
  // Mark the project root as trusted in ~/.claude.json so claude doesn't
  // show the per-folder trust dialog when we spawn it here. Best-effort.
  void trustProjectForClaude(info.path)
  await logger.info('open_project ok', {
    path: info.path,
    isGitRepo,
    baseSha,
    dirty,
    hasIndexHtml: indexHtml,
  })
  return { ok: true, project: info }
}

/** Extract the repo name from a git URL.
 *  Examples:
 *    git@github.com:vraj00222/agent-farm.git   → agent-farm
 *    https://github.com/x/y.git                → y
 *    https://github.com/x/y                    → y
 */
function repoNameFromUrl(url: string): string {
  const last = url.replace(/\.git\/?$/, '').split('/').pop() ?? ''
  return last || 'project'
}

export async function cloneProject(opts: ProjectCloneOptions): Promise<ProjectCloneResult> {
  if (!opts.url || !opts.parentPath) {
    return { ok: false, reason: 'url and parentPath are required' }
  }
  // Defensive: require a plausible git URL. We don't want shell-injection
  // via an arbitrary string being passed as `git clone <whatever>`. execFile
  // already avoids shell, but a malicious URL of the form `--upload-pack=...`
  // could still be dangerous, so we sanity-check the prefix.
  const url = opts.url.trim()
  const looksOk =
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('git@') ||
    url.startsWith('ssh://')
  if (!looksOk) {
    return { ok: false, reason: 'unsupported URL scheme — use https://, ssh:// or git@host' }
  }

  const name = repoNameFromUrl(url)
  const target = join(opts.parentPath, name)

  try {
    await fs.mkdir(opts.parentPath, { recursive: true })
    const stat = await fs.stat(target).catch(() => null)
    if (stat) {
      return { ok: false, reason: `target already exists: ${target}` }
    }

    await logger.info('clone start', { url, target })
    await exec('git', ['clone', '--', url, target], {
      cwd: opts.parentPath,
      timeout: 120_000,
    })

    return inspectPath(target) as Promise<ProjectCloneResult>
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await logger.error('clone failed', { url, target, reason })
    return { ok: false, reason }
  }
}
