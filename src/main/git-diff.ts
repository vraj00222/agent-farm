import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitDiffResult } from '../shared/ipc'

const exec = promisify(execFile)

/** Cap diff output so a runaway repo doesn't OOM the renderer. */
const MAX_BYTES = 512 * 1024 // 512 KB

async function isGitRepo(path: string): Promise<boolean> {
  try {
    await exec('git', ['rev-parse', '--show-toplevel'], { cwd: path, timeout: 3000 })
    return true
  } catch {
    return false
  }
}

export async function getGitDiff(path: string): Promise<GitDiffResult> {
  if (!(await isGitRepo(path))) {
    return { ok: false, reason: 'not a git repo' }
  }

  let filesChanged = 0
  try {
    const { stdout } = await exec(
      'git',
      ['status', '--porcelain'],
      { cwd: path, timeout: 5000 },
    )
    filesChanged = stdout.trim().split('\n').filter(Boolean).length
  } catch {
    /* no-op — diff itself is the authoritative output */
  }

  try {
    // Include untracked files so the panel actually shows them.
    const { stdout } = await exec(
      'git',
      [
        '--no-pager',
        'diff',
        'HEAD',
        '--no-color',
        '--no-ext-diff',
      ],
      {
        cwd: path,
        timeout: 10_000,
        maxBuffer: MAX_BYTES + 1024,
      },
    )
    const diff =
      stdout.length > MAX_BYTES
        ? stdout.slice(0, MAX_BYTES) + `\n\n… diff truncated at ${MAX_BYTES} bytes`
        : stdout
    return { ok: true, diff, filesChanged }
  } catch (err) {
    // Most likely cause: HEAD doesn't exist (fresh repo, no commits yet).
    // Fall back to diffing against the empty tree.
    try {
      const { stdout: emptyTree } = await exec('git', ['hash-object', '-t', 'tree', '/dev/null'], { cwd: path, timeout: 3000 })
      const empty = emptyTree.trim()
      const { stdout } = await exec(
        'git',
        ['--no-pager', 'diff', empty, '--no-color', '--no-ext-diff'],
        { cwd: path, timeout: 10_000, maxBuffer: MAX_BYTES + 1024 },
      )
      const diff =
        stdout.length > MAX_BYTES
          ? stdout.slice(0, MAX_BYTES) + `\n\n… diff truncated at ${MAX_BYTES} bytes`
          : stdout
      return { ok: true, diff, filesChanged }
    } catch (innerErr) {
      const reason = innerErr instanceof Error ? innerErr.message : String(innerErr)
      return { ok: false, reason }
    }
  }
}
