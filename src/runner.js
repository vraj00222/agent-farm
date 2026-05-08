'use strict'

const { execFileSync, spawn } = require('child_process')
const { git, stripAnsi, lineBuffer, fmtElapsed } = require('./util.js')
const { loggerFor } = require('./logger.js')

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
  state,
}) {
  const startedAt = Date.now()
  const { logger, filepath: logFile } = loggerFor(repoRoot, id, startedAt)

  state.putAgent({
    id,
    branch,
    worktreePath,
    prompt,
    state: 'queued',
    pid: null,
    startedAt: null,
    endedAt: null,
    elapsedMs: null,
    exitCode: null,
    lastLines: [],
    commits: [],
    filesChanged: [],
    autoCommitted: false,
    logFile,
  })

  try {
    git(['worktree', 'add', worktreePath, '-b', branch], repoRoot)
  } catch (e) {
    const errMsg = `worktree create failed: ${e.message.split('\n')[0]}`
    state.appendLine(id, 'stderr', errMsg)
    state.transition(id, 'failed', { error: errMsg, endedAt: Date.now(), elapsedMs: Date.now() - startedAt })
    logger.log('error', { message: errMsg })
    logger.close()
    return state.get(id)
  }

  state.transition(id, 'running', { startedAt })
  state.appendLine(id, 'info', `spawning claude in ${worktreePath}`)

  const proc = spawn(
    'claude',
    ['-p', '--dangerously-skip-permissions', wrapPrompt(prompt)],
    { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  state.transition(id, 'running', { pid: proc.pid })
  logger.log('spawn', { pid: proc.pid, worktree: worktreePath, baseSha })

  const onLine = (kind) => (line) => {
    const clean = stripAnsi(line)
    if (clean.length === 0) return
    state.appendLine(id, kind, clean)
    logger.log(kind, { line: clean })
  }

  const stdoutBuf = lineBuffer(onLine('stdout'))
  const stderrBuf = lineBuffer(onLine('stderr'))
  proc.stdout.on('data', stdoutBuf.push)
  proc.stderr.on('data', stderrBuf.push)

  const exitCode = await new Promise((resolve) => {
    proc.on('exit', (code) => resolve(code === null ? 128 : code))
    proc.on('error', (e) => {
      state.appendLine(id, 'stderr', `spawn error: ${e.message}`)
      logger.log('error', { message: e.message })
      resolve(127)
    })
  })
  stdoutBuf.flush()
  stderrBuf.flush()

  const endedAt = Date.now()
  const elapsedMs = endedAt - startedAt

  if (exitCode !== 0) {
    const commits = commitsSince(worktreePath, baseSha)
    const filesChanged = filesChangedSince(worktreePath, baseSha)
    state.appendLine(id, 'info', `claude exited ${exitCode} after ${fmtElapsed(elapsedMs)}`)
    state.transition(id, 'failed', {
      exitCode,
      endedAt,
      elapsedMs,
      commits,
      filesChanged,
    })
    logger.log('exit', { code: exitCode, elapsedMs, commits: commits.length })
    logger.close()
    return state.get(id)
  }

  let autoCommitted = false
  if (isWorktreeDirty(worktreePath)) {
    try {
      autoCommit(worktreePath, id)
      autoCommitted = true
      logger.log('autocommit', {})
      state.appendLine(id, 'info', `auto-committed pending changes`)
    } catch (e) {
      const errMsg = `auto-commit failed: ${e.message.split('\n')[0]}`
      state.appendLine(id, 'stderr', errMsg)
      state.transition(id, 'failed', {
        exitCode,
        endedAt,
        elapsedMs,
        error: errMsg,
      })
      logger.log('error', { message: errMsg })
      logger.close()
      return state.get(id)
    }
  }

  const commits = commitsSince(worktreePath, baseSha)
  const filesChanged = filesChangedSince(worktreePath, baseSha)
  const finalState = commits.length > 0 ? 'done' : 'noop'

  const summary =
    finalState === 'done'
      ? `done in ${fmtElapsed(elapsedMs)} · ${commits.length} commit${commits.length === 1 ? '' : 's'} · ${filesChanged.length} file${filesChanged.length === 1 ? '' : 's'}`
      : `no-op in ${fmtElapsed(elapsedMs)} (claude made no changes)`
  state.appendLine(id, 'info', summary)

  state.transition(id, finalState, {
    exitCode,
    endedAt,
    elapsedMs,
    commits,
    filesChanged,
    autoCommitted,
  })
  logger.log('exit', {
    code: exitCode,
    elapsedMs,
    commits: commits.length,
    autoCommitted,
    state: finalState,
  })
  logger.close()

  return state.get(id)
}

module.exports = { runAgent }
