import { dialog, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename } from 'node:path'
import { promises as fs } from 'node:fs'
import type { ProjectInfo, ProjectOpenResult } from '../shared/ipc'
import { logger } from './logger'
import { rememberProject } from './settings'

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
  await logger.info('open_project ok', {
    path: info.path,
    isGitRepo,
    baseSha,
    dirty,
    hasIndexHtml: indexHtml,
  })
  return { ok: true, project: info }
}
