import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  GitDiffResult,
  GitDiffStructuredOptions,
  GitDiffStructuredResult,
} from '../shared/ipc'

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

// ── Structured diff ───────────────────────────────────────────────────

/** Run `git diff` and parse the unified output into structured hunks.
 *  `baseSha` empty/undefined → diff working tree against HEAD. */
export async function getGitDiffStructured(
  opts: GitDiffStructuredOptions,
): Promise<GitDiffStructuredResult> {
  if (!opts || typeof opts.path !== 'string' || opts.path.length === 0) {
    return { ok: false, reason: 'path required' }
  }
  if (!(await isGitRepo(opts.path))) {
    return { ok: false, reason: 'not a git repo' }
  }

  const baseSha = typeof opts.baseSha === 'string' ? opts.baseSha.trim() : ''
  // When baseSha is set we want `<base>..HEAD` (all commits since the agent
  // forked) PLUS any uncommitted changes in the worktree — agents may or may
  // not commit. Easiest: include working-tree state via `git diff <base>`.
  const args = [
    '--no-pager',
    'diff',
    baseSha || 'HEAD',
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
  ]

  let stdout = ''
  try {
    const out = await exec('git', args, {
      cwd: opts.path,
      timeout: 15_000,
      maxBuffer: MAX_BYTES + 4096,
    })
    stdout = out.stdout
  } catch (err) {
    // Fresh repo with no commits → fall back to diffing against the empty tree.
    if (!baseSha) {
      try {
        const { stdout: emptyTree } = await exec(
          'git',
          ['hash-object', '-t', 'tree', '/dev/null'],
          { cwd: opts.path, timeout: 3000 },
        )
        const empty = emptyTree.trim()
        const { stdout: out2 } = await exec(
          'git',
          ['--no-pager', 'diff', empty, '--no-color', '--no-ext-diff', '--find-renames'],
          { cwd: opts.path, timeout: 15_000, maxBuffer: MAX_BYTES + 4096 },
        )
        stdout = out2
      } catch (innerErr) {
        return {
          ok: false,
          reason: innerErr instanceof Error ? innerErr.message : String(innerErr),
        }
      }
    } else {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) }
    }
  }

  const truncated = stdout.length > MAX_BYTES
  if (truncated) stdout = stdout.slice(0, MAX_BYTES)
  return { ok: true, files: parseDiff(stdout), truncated }
}

/**
 * Parse `git diff` unified output into typed file/hunk structures.
 *
 * We deliberately keep this tolerant: any line we don't recognize is treated
 * as a context line of the current hunk. That way a malformed run (or one
 * we truncated mid-stream) still surfaces partial data instead of crashing.
 */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  let currentHunk: DiffHunk | null = null

  const flushHunk = () => {
    if (currentHunk && current) current.hunks.push(currentHunk)
    currentHunk = null
  }
  const flushFile = () => {
    flushHunk()
    if (current) files.push(current)
    current = null
  }

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // New file header — `diff --git a/<old> b/<new>`
    if (line.startsWith('diff --git ')) {
      flushFile()
      // Pull both paths from the header. Robust enough for paths without
      // spaces; git quotes paths with spaces, which is a rarer edge case.
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      const oldPath = m ? m[1] : ''
      const newPath = m ? m[2] : ''
      current = {
        path: newPath || oldPath,
        oldPath: oldPath || newPath,
        kind: 'modified',
        binary: false,
        addedLines: 0,
        removedLines: 0,
        hunks: [],
      }
      continue
    }
    if (!current) continue

    // File-level metadata that refines `kind`.
    if (line.startsWith('new file mode')) {
      current.kind = 'added'
      continue
    }
    if (line.startsWith('deleted file mode')) {
      current.kind = 'deleted'
      continue
    }
    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      current.kind = 'renamed'
      continue
    }
    if (line.startsWith('Binary files ')) {
      current.binary = true
      // Heuristic: if the line ends with "differ" without "added"/"deleted",
      // treat as modified — close enough for display.
      continue
    }

    // Hunk header — `@@ -oldStart,oldCount +newStart,newCount @@ context`
    if (line.startsWith('@@')) {
      flushHunk()
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (!m) continue
      currentHunk = {
        header: line,
        oldStart: Number(m[1]),
        oldCount: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newCount: m[4] ? Number(m[4]) : 1,
        lines: [],
      }
      continue
    }

    // Ignore the index / mode / +++ / --- lines outside hunks.
    if (!currentHunk) continue

    // Body line of the current hunk.
    const body = parseBodyLine(line)
    if (body) {
      currentHunk.lines.push(body)
      if (body.kind === 'add') current!.addedLines += 1
      else if (body.kind === 'del') current!.removedLines += 1
    }
  }

  flushFile()
  return files
}

function parseBodyLine(line: string): DiffLine | null {
  // Empty trailing line after split('\n') — drop silently.
  if (line === '') return null
  // "\ No newline at end of file" — annotative; render as context-ish.
  if (line.startsWith('\\')) return null
  const first = line.charAt(0)
  if (first === '+') return { kind: 'add', text: line.slice(1) }
  if (first === '-') return { kind: 'del', text: line.slice(1) }
  if (first === ' ') return { kind: 'context', text: line.slice(1) }
  // Unrecognized — keep as context so we don't lose visibility.
  return { kind: 'context', text: line }
}
