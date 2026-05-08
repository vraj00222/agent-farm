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
  tagWidth,
  state,
  out,
  err,
}) {
  const tag = makeTagger(id, tagWidth)
  const writeOut = (line) => out.write(`${tag(line)}\n`)
  const writeErr = (line) => err.write(`${tag(line)}\n`)

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

  const result = state.get(id)

  try {
    git(['worktree', 'add', worktreePath, '-b', branch], repoRoot)
  } catch (e) {
    const errMsg = `worktree create failed: ${e.message.split('\n')[0]}`
    state.transition(id, 'failed', { error: errMsg })
    logger.log('error', { message: errMsg })
    logger.close()
    writeErr(c.red(errMsg))
    return state.get(id)
  }

  state.transition(id, 'running', { startedAt })
  writeOut(c.dim(`spawning claude in ${worktreePath}`))

  const proc = spawn(
    'claude',
    ['-p', '--dangerously-skip-permissions', wrapPrompt(prompt)],
    { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  state.transition(id, 'running', { pid: proc.pid })
  logger.log('spawn', { pid: proc.pid, worktree: worktreePath, baseSha })

  const lastLines = []
  const onLine = (kind, sink) => (line) => {
    const clean = stripAnsi(line)
    if (clean.length === 0) return
    sink(clean)
    logger.log(kind, { line: clean })
    lastLines.push(clean)
    if (lastLines.length > 5) lastLines.shift()
  }

  const stdoutBuf = lineBuffer(onLine('stdout', writeOut))
  const stderrBuf = lineBuffer(onLine('stderr', writeErr))
  proc.stdout.on('data', stdoutBuf.push)
  proc.stderr.on('data', stderrBuf.push)

  const exitCode = await new Promise((resolve) => {
    proc.on('exit', (code) => resolve(code === null ? 128 : code))
    proc.on('error', (e) => {
      writeErr(c.red(`spawn error: ${e.message}`))
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
    state.transition(id, 'failed', {
      exitCode,
      endedAt,
      elapsedMs,
      commits,
      filesChanged,
      lastLines: [...lastLines],
    })
    logger.log('exit', { code: exitCode, elapsedMs, commits: commits.length })
    logger.close()
    writeErr(c.red(`claude exited ${exitCode} after ${fmtElapsed(elapsedMs)}`))
    return state.get(id)
  }

  let autoCommitted = false
  if (isWorktreeDirty(worktreePath)) {
    try {
      autoCommit(worktreePath, id)
      autoCommitted = true
      logger.log('autocommit', {})
      writeOut(c.dim(`auto-committed pending changes`))
    } catch (e) {
      const errMsg = `auto-commit failed: ${e.message.split('\n')[0]}`
      state.transition(id, 'failed', {
        exitCode,
        endedAt,
        elapsedMs,
        error: errMsg,
        lastLines: [...lastLines],
      })
      logger.log('error', { message: errMsg })
      logger.close()
      writeErr(c.red(errMsg))
      return state.get(id)
    }
  }

  const commits = commitsSince(worktreePath, baseSha)
  const filesChanged = filesChangedSince(worktreePath, baseSha)
  const finalState = commits.length > 0 ? 'done' : 'noop'

  state.transition(id, finalState, {
    exitCode,
    endedAt,
    elapsedMs,
    commits,
    filesChanged,
    autoCommitted,
    lastLines: [...lastLines],
  })
  logger.log('exit', {
    code: exitCode,
    elapsedMs,
    commits: commits.length,
    autoCommitted,
    state: finalState,
  })
  logger.close()

  const summary =
    finalState === 'done'
      ? c.green(
          `done in ${fmtElapsed(elapsedMs)} · ${commits.length} commit${commits.length === 1 ? '' : 's'} · ${filesChanged.length} file${filesChanged.length === 1 ? '' : 's'}`
        )
      : c.yellow(`no-op in ${fmtElapsed(elapsedMs)} (claude made no changes)`)
  writeOut(summary)

  return state.get(id)
}

module.exports = { runAgent }
