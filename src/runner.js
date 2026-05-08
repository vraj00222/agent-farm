'use strict'

const { execFileSync, spawn } = require('child_process')
const { git, stripAnsi, lineBuffer, fmtElapsed } = require('./util.js')
const { loggerFor } = require('./logger.js')
const { parseEvent } = require('./streamparser.js')

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
  model,
}) {
  const startedAt = Date.now()
  const { logger, filepath: logFile } = loggerFor(repoRoot, id, startedAt)

  state.putAgent({
    id,
    branch,
    worktreePath,
    prompt,
    model: model || null,
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

  // Build the actual claude command. We use stream-json + verbose so we get
  // structured events (tool_use, tool_result, assistant text, final result)
  // that we can render as a clean, informative tail in the TUI.
  const claudeArgs = [
    '-p',
    '--dangerously-skip-permissions',
    '--output-format',
    'stream-json',
    '--verbose',
  ]
  if (model) claudeArgs.push('--model', model)
  const wrappedPrompt = wrapPrompt(prompt)

  state.transition(id, 'running', { startedAt })
  // Echo a readable command (without the noisy stream-json flags) so the
  // user sees what claude is being asked to do.
  const promptPreview = prompt.length > 80 ? prompt.slice(0, 77) + '…' : prompt
  const visibleCmd = ['$ claude -p --dangerously-skip-permissions']
  if (model) visibleCmd.push(`--model ${model}`)
  visibleCmd.push(`"${promptPreview}"`)
  state.appendLine(id, 'info', visibleCmd.join(' '))
  state.appendLine(id, 'info', `worktree: ${worktreePath}`)

  const proc = spawn('claude', [...claudeArgs, wrappedPrompt], {
    cwd: worktreePath,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  state.transition(id, 'running', { pid: proc.pid })
  logger.log('spawn', {
    pid: proc.pid,
    worktree: worktreePath,
    baseSha,
    model: model || null,
  })

  let capturedUsage = null

  const onStdoutLine = (line) => {
    if (!line) return
    // Try to parse as a stream-json event. Fall back to raw text on parse
    // error so we never silently lose claude output.
    let event
    try {
      event = JSON.parse(line)
    } catch {
      const clean = stripAnsi(line)
      if (clean.length > 0) {
        state.appendLine(id, 'stdout', clean)
        logger.log('stdout', { line: clean })
      }
      return
    }
    const { lines, usage } = parseEvent(event)
    if (usage) capturedUsage = usage
    for (const text of lines) {
      state.appendLine(id, 'event', text)
      logger.log('event', { eventType: event.type, text })
    }
  }

  const onStderrLine = (line) => {
    const clean = stripAnsi(line)
    if (clean.length === 0) return
    state.appendLine(id, 'stderr', clean)
    logger.log('stderr', { line: clean })
  }

  const stdoutBuf = lineBuffer(onStdoutLine)
  const stderrBuf = lineBuffer(onStderrLine)
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
      usage: capturedUsage,
    })
    logger.log('exit', {
      code: exitCode,
      elapsedMs,
      commits: commits.length,
      usage: capturedUsage,
    })
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
    usage: capturedUsage,
  })
  logger.log('exit', {
    code: exitCode,
    elapsedMs,
    commits: commits.length,
    autoCommitted,
    state: finalState,
    usage: capturedUsage,
  })
  logger.close()

  return state.get(id)
}

module.exports = { runAgent }
