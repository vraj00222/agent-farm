'use strict'

const { execFileSync, spawn } = require('child_process')
const {
  git,
  c,
  makeTagger,
  stripAnsi,
  lineBuffer,
  fmtElapsed,
} = require('./util.js')

function wrapPrompt(prompt) {
  return `${prompt}

When you're finished, commit your work in this worktree with a clear one-line message:

  git add -A && git commit -m "<short summary of what you changed>"

Do not push. Do not switch branches. Just commit on the current branch.`
}

function isWorktreeDirty(cwd) {
  const out = execFileSync('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
  })
  return out.length > 0
}

function autoCommit(cwd, id) {
  execFileSync('git', ['add', '-A'], { cwd, stdio: 'ignore' })
  execFileSync(
    'git',
    ['commit', '-m', `agent-farm: ${id} (auto-commit)`, '--no-verify'],
    { cwd, stdio: 'ignore' }
  )
}

function commitsSince(cwd, baseSha) {
  const out = execFileSync('git', ['log', '--oneline', `${baseSha}..HEAD`], {
    cwd,
    encoding: 'utf8',
  }).trim()
  if (!out) return []
  return out.split('\n')
}

function filesChangedSince(cwd, baseSha) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', `${baseSha}..HEAD`],
    { cwd, encoding: 'utf8' }
  ).trim()
  if (!out) return []
  return out.split('\n')
}

async function runAgent({
  prompt,
  id,
  branch,
  worktreePath,
  baseSha,
  repoRoot,
  tagWidth,
  out,
  err,
}) {
  const tag = makeTagger(id, tagWidth)
  const writeOut = (line) => out.write(`${tag(line)}\n`)
  const writeErr = (line) => err.write(`${tag(line)}\n`)

  const result = {
    id,
    branch,
    worktreePath,
    state: 'pending',
    exitCode: null,
    elapsedMs: 0,
    commits: [],
    filesChanged: [],
    autoCommitted: false,
    error: null,
    lastLines: [],
  }

  try {
    git(['worktree', 'add', worktreePath, '-b', branch], repoRoot)
  } catch (e) {
    result.state = 'failed'
    result.error = `worktree create failed: ${e.message.split('\n')[0]}`
    writeErr(c.red(result.error))
    return result
  }

  result.state = 'running'
  writeOut(c.dim(`spawning claude in ${worktreePath}`))

  const startedAt = Date.now()
  const proc = spawn(
    'claude',
    ['-p', '--dangerously-skip-permissions', wrapPrompt(prompt)],
    { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const onLine = (sink) => (line) => {
    const clean = stripAnsi(line)
    if (clean.length === 0) return
    sink(clean)
    result.lastLines.push(clean)
    if (result.lastLines.length > 5) result.lastLines.shift()
  }

  const stdoutBuf = lineBuffer(onLine(writeOut))
  const stderrBuf = lineBuffer(onLine(writeErr))
  proc.stdout.on('data', stdoutBuf.push)
  proc.stderr.on('data', stderrBuf.push)

  const exitCode = await new Promise((resolve) => {
    proc.on('exit', (code, signal) => resolve(code === null ? 128 : code))
    proc.on('error', (e) => {
      writeErr(c.red(`spawn error: ${e.message}`))
      resolve(127)
    })
  })
  stdoutBuf.flush()
  stderrBuf.flush()

  result.exitCode = exitCode
  result.elapsedMs = Date.now() - startedAt

  if (exitCode !== 0) {
    result.state = 'failed'
    writeErr(c.red(`claude exited ${exitCode} after ${fmtElapsed(result.elapsedMs)}`))
    result.commits = commitsSince(worktreePath, baseSha)
    result.filesChanged = filesChangedSince(worktreePath, baseSha)
    return result
  }

  if (isWorktreeDirty(worktreePath)) {
    try {
      autoCommit(worktreePath, id)
      result.autoCommitted = true
      writeOut(c.dim(`auto-committed pending changes`))
    } catch (e) {
      result.state = 'failed'
      result.error = `auto-commit failed: ${e.message.split('\n')[0]}`
      writeErr(c.red(result.error))
      return result
    }
  }

  result.commits = commitsSince(worktreePath, baseSha)
  result.filesChanged = filesChangedSince(worktreePath, baseSha)
  result.state = result.commits.length > 0 ? 'done' : 'noop'

  const summary =
    result.state === 'done'
      ? c.green(
          `done in ${fmtElapsed(result.elapsedMs)} · ${result.commits.length} commit${result.commits.length === 1 ? '' : 's'} · ${result.filesChanged.length} file${result.filesChanged.length === 1 ? '' : 's'}`
        )
      : c.yellow(`no-op in ${fmtElapsed(result.elapsedMs)} (claude made no changes)`)
  writeOut(summary)

  return result
}

module.exports = { runAgent }
