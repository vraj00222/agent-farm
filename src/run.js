'use strict'

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const {
  slugify,
  git,
  uniqueSlug,
  c,
  fmtElapsed,
  makeTagger,
} = require('./util.js')
const { runAgent } = require('./runner.js')
const { State, statePath, runsDir } = require('./state.js')
const { Semaphore } = require('./queue.js')

const DEFAULT_MAX_CONCURRENT = 3

function checkPrereqs() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new Error('`git` not found in PATH.')
  }
  let claudeVersion
  try {
    const raw = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim()
    // typical output: "2.1.132 (Claude Code)"
    const m = raw.match(/^(\S+)/)
    claudeVersion = m ? m[1] : raw
  } catch {
    throw new Error(
      '`claude` CLI not found in PATH. Install: npm i -g @anthropic-ai/claude-code'
    )
  }
  return { claudeVersion }
}

function checkRepoClean(repoRoot) {
  const out = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const dirty = out.split('\n').filter((line) => line && !line.startsWith('??'))
  if (dirty.length > 0) {
    throw new Error(
      `repo has uncommitted changes to tracked files:\n${dirty.join(
        '\n'
      )}\ncommit or stash, then retry.`
    )
  }
}

function getRepoRoot() {
  try {
    return git(['rev-parse', '--show-toplevel'])
  } catch {
    throw new Error('not inside a git repository.')
  }
}

function isInteractive() {
  return (
    process.stdout.isTTY &&
    process.stdin.isTTY &&
    process.env.TERM !== 'dumb' &&
    !process.env.AGENT_FARM_NO_TUI &&
    !process.env.CI
  )
}

function printUsage() {
  process.stdout.write(
    [
      `${c.bold('agent-farm')} — run claude in isolated git worktrees, in parallel.`,
      '',
      'Usage:',
      `  agent-farm                                  # open the live TUI`,
      `  agent-farm "<prompt>" ["<prompt>" ...]      # open TUI with these tasks queued`,
      `  agent-farm @<id>: "<prompt>"                # override the slug`,
      `  agent-farm --max <N> "<prompt>" ...         # cap parallelism (default ${DEFAULT_MAX_CONCURRENT})`,
      `  agent-farm --model <name> "<prompt>" ...    # claude --model (e.g. opus, sonnet, haiku)`,
      '',
      `  agent-farm status                           # print current session state`,
      `  agent-farm logs <id>                        # print the JSONL run log for an agent`,
      '',
      'TUI keybindings:',
      `  type & enter   spawn a new task`,
      `  esc            clear the input`,
      `  ↑ / ↓          select an agent in the side panel`,
      `  tab            cycle tail → diff (file 1) → diff (file 2) → … → tail`,
      `  shift+tab      cycle the other way`,
      `  ctrl+c         quit (running tasks are SIGTERM'd)`,
      '',
      `Set ${c.dim('AGENT_FARM_NO_TUI=1')} to force the plain log-stream renderer.`,
      '',
    ].join('\n') + '\n'
  )
}

function parseArgs(argv) {
  const out = {
    max: DEFAULT_MAX_CONCURRENT,
    model: null,
    prompts: [],
    help: false,
    command: null,
    commandArg: null,
  }

  if (argv[0] === 'status') {
    if (argv.length !== 1) throw new Error("'status' takes no arguments")
    out.command = 'status'
    return out
  }
  if (argv[0] === 'logs') {
    if (argv.length !== 2) {
      throw new Error("'logs' requires exactly one argument: agent-farm logs <id>")
    }
    out.command = 'logs'
    out.commandArg = argv[1]
    return out
  }

  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a === '-h' || a === '--help') {
      out.help = true
      i++
      continue
    }
    if (a === '--max') {
      const v = argv[i + 1]
      const n = parseInt(v, 10)
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--max requires a positive integer (got ${v})`)
      }
      out.max = n
      i += 2
      continue
    }
    if (a.startsWith('--max=')) {
      const n = parseInt(a.slice('--max='.length), 10)
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--max requires a positive integer (got ${a})`)
      }
      out.max = n
      i++
      continue
    }
    if (a === '--model') {
      const v = argv[i + 1]
      if (!v || v.startsWith('-')) {
        throw new Error('--model requires a value (e.g. opus, sonnet, haiku, or a model id)')
      }
      out.model = v
      i += 2
      continue
    }
    if (a.startsWith('--model=')) {
      const v = a.slice('--model='.length)
      if (!v) throw new Error('--model= requires a value')
      out.model = v
      i++
      continue
    }
    out.prompts.push(a)
    i++
  }

  return out
}

function attachStreamRenderer(state, tagWidth) {
  const taggers = new Map()
  const taggerFor = (id) => {
    if (!taggers.has(id)) taggers.set(id, makeTagger(id, tagWidth))
    return taggers.get(id)
  }
  state.on('line', ({ id, kind, line }) => {
    const tag = taggerFor(id)
    const sink = kind === 'stderr' ? process.stderr : process.stdout
    sink.write(`${tag(line)}\n`)
  })
}

function printStartBanner({ tasks, repoRoot, baseSha, maxConcurrent }) {
  const repoName = path.basename(repoRoot)
  const idWidth = Math.max(...tasks.map((t) => t.id.length))
  const cap =
    tasks.length > maxConcurrent ? c.dim(` (max ${maxConcurrent} parallel)`) : ''
  process.stdout.write('\n')
  process.stdout.write(
    `${c.bold('[agent-farm]')} ${tasks.length} task${tasks.length === 1 ? '' : 's'}${cap} · base ${c.dim(baseSha.slice(0, 8))} · repo ${c.dim(repoName)}\n`
  )
  for (const t of tasks) {
    const idCol = c.cyan(t.id.padEnd(idWidth, ' '))
    const branchCol = c.dim(t.branch)
    process.stdout.write(`  ${c.dim('▸')} ${idCol}  ${branchCol}\n`)
  }
  process.stdout.write('\n')
}

function printSummary(results) {
  if (results.length === 0) return { wins: 0, losses: 0 }
  const idWidth = Math.max(...results.map((r) => r.id.length), 'id'.length)
  const stateGlyph = {
    done: c.green('✓'),
    noop: c.yellow('○'),
    failed: c.red('✗'),
  }

  process.stdout.write('\n')
  process.stdout.write(`${c.bold('[agent-farm]')} summary\n`)
  for (const r of results) {
    const glyph = stateGlyph[r.state] || c.dim('?')
    const idCol = r.id.padEnd(idWidth, ' ')
    const elapsed = fmtElapsed(r.elapsedMs || 0).padStart(7, ' ')
    let detail
    if (r.state === 'failed') {
      detail = c.red(
        r.error
          ? r.error
          : `exit ${r.exitCode}` +
              ((r.commits || []).length > 0
                ? ` (${r.commits.length} partial commit(s))`
                : '')
      )
    } else if (r.state === 'noop') {
      detail = c.yellow('no changes')
    } else if (r.state === 'running' || r.state === 'queued') {
      detail = c.dim('still running at exit')
    } else {
      const auto = r.autoCommitted ? c.dim(' (auto-committed)') : ''
      detail = `${(r.commits || []).length} commit${(r.commits || []).length === 1 ? '' : 's'} · ${(r.filesChanged || []).length} file${(r.filesChanged || []).length === 1 ? '' : 's'}${auto}`
    }
    process.stdout.write(
      `  ${glyph} ${c.cyan(idCol)}  ${c.dim(elapsed)}  ${detail}\n`
    )
    if (r.state === 'failed' && (r.lastLines || []).length > 0) {
      for (const line of r.lastLines) {
        process.stdout.write(`     ${c.dim('│')} ${c.dim(line)}\n`)
      }
    }
  }

  const wins = results.filter((r) => r.state === 'done')
  const losses = results.filter((r) => r.state === 'failed' || r.state === 'noop')

  if (wins.length > 0) {
    process.stdout.write(`\n${c.bold('cherry-pick:')}\n`)
    for (const r of wins) {
      process.stdout.write(`  git cherry-pick ${r.branch}\n`)
    }
  }

  if (results.length > 0) {
    process.stdout.write(`\n${c.bold('cleanup:')}\n`)
    for (const r of [...wins, ...losses]) {
      process.stdout.write(
        `  git worktree remove "${r.worktreePath}" && git branch -D ${r.branch}\n`
      )
    }
  }
  process.stdout.write('\n')

  return { wins: wins.length, losses: losses.length }
}

function doStatus() {
  const repoRoot = getRepoRoot()
  const state = State.read(repoRoot)
  if (!state) {
    process.stdout.write(
      c.dim('no .agent-farm/state.json — no session has run in this repo yet.\n')
    )
    return
  }
  const agents = state.all()
  if (agents.length === 0) {
    process.stdout.write(c.dim('state.json exists but no agents recorded.\n'))
    return
  }
  const idWidth = Math.max(...agents.map((a) => a.id.length))
  const stateColor = {
    queued: c.dim,
    running: c.cyan,
    done: c.green,
    noop: c.yellow,
    failed: c.red,
  }
  process.stdout.write(
    `\n${c.bold('[agent-farm] status')} · base ${c.dim(state.data.baseSha.slice(0, 8))} · ${agents.length} agent${agents.length === 1 ? '' : 's'}\n`
  )
  for (const a of agents) {
    const colorFn = stateColor[a.state] || ((s) => s)
    const elapsed = a.elapsedMs
      ? fmtElapsed(a.elapsedMs)
      : a.startedAt
        ? `${fmtElapsed(Date.now() - a.startedAt)}+`
        : '-'
    const detail =
      a.state === 'done' || a.state === 'failed' || a.state === 'noop'
        ? `${(a.commits || []).length}c · ${(a.filesChanged || []).length}f`
        : a.pid
          ? `pid ${a.pid}`
          : ''
    process.stdout.write(
      `  ${colorFn(a.state.padEnd(7))}  ${c.cyan(a.id.padEnd(idWidth))}  ${c.dim(elapsed.padStart(8))}  ${c.dim(detail)}\n`
    )
  }
  process.stdout.write('\n')
}

function doLogs(id) {
  const repoRoot = getRepoRoot()
  const dir = runsDir(repoRoot)
  if (!fs.existsSync(dir)) {
    throw new Error(`no logs directory at ${dir}`)
  }
  const matches = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${id}-`) && f.endsWith('.log'))
    .sort()
  if (matches.length === 0) {
    throw new Error(`no run logs for "${id}" in ${dir}`)
  }
  const latest = path.join(dir, matches[matches.length - 1])
  process.stdout.write(c.dim(`# ${latest}\n`))
  const raw = fs.readFileSync(latest, 'utf8')
  for (const line of raw.split('\n')) {
    if (!line) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      process.stdout.write(line + '\n')
      continue
    }
    const ts = new Date(ev.t).toISOString().slice(11, 23)
    const type = ev.type
    const rest = Object.keys(ev)
      .filter((k) => k !== 't' && k !== 'type')
      .map((k) => {
        const v = ev[k]
        return `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`
      })
      .join(' ')
    const colorFn =
      type === 'stderr' || type === 'error'
        ? c.red
        : type === 'exit'
          ? c.green
          : type === 'spawn'
            ? c.cyan
            : type === 'autocommit'
              ? c.yellow
              : (s) => s
    process.stdout.write(`${c.dim(ts)} ${colorFn(type.padEnd(8))} ${rest}\n`)
  }
}

async function run(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (e) {
    process.stderr.write(`agent-farm: ${e.message}\n`)
    process.exit(1)
  }

  if (args.help) {
    printUsage()
    return
  }

  if (args.command === 'status') return doStatus()
  if (args.command === 'logs') return doLogs(args.commandArg)

  const { claudeVersion } = checkPrereqs()
  const repoRoot = getRepoRoot()
  checkRepoClean(repoRoot)
  const baseSha = git(['rev-parse', 'HEAD'], repoRoot)
  const repoName = path.basename(repoRoot)

  const initialPrompts = args.prompts.filter((p) => p.trim().length > 0)
  const tuiMode = isInteractive()

  // Stream mode requires at least one initial prompt — there's no input box.
  if (!tuiMode && initialPrompts.length === 0) {
    process.stderr.write(
      'agent-farm: no TTY detected and no prompts given. Pass prompts as args, or run in a real terminal for the TUI.\n'
    )
    process.exit(1)
  }

  const state = State.init({ repoRoot, baseSha, maxConcurrent: args.max })
  const sema = new Semaphore(args.max)
  const takenIds = new Set()
  const pendingTasks = []
  const queuePromises = []

  const queueTask = (prompt) => {
    const baseId = slugify(prompt)
    const slug = uniqueSlug(repoRoot, baseId, takenIds)
    pendingTasks.push(slug.id)
    const p = sema
      .run(() =>
        runAgent({
          prompt,
          id: slug.id,
          branch: slug.branch,
          worktreePath: slug.worktreePath,
          baseSha,
          repoRoot,
          state,
          model: args.model,
        })
      )
      .catch((e) => {
        // runAgent handles its own errors; this is for runner crashes
        try {
          state.appendLine(slug.id, 'stderr', `runner crashed: ${e.message}`)
        } catch {
          /* ignore */
        }
      })
    queuePromises.push(p)
    return slug.id
  }

  if (tuiMode) {
    // TUI takes over — initial prompts are queued, then user can submit more.
    for (const p of initialPrompts) queueTask(p)
    const { renderTui } = require('./ui.js')
    await renderTui({
      state,
      baseSha,
      repoName,
      queueTask,
      claudeVersion,
      model: args.model,
    })
    // After Ink unmounts, child processes may still be running — wait for them
    // briefly so state.json reflects final outcomes before printSummary reads it.
    await Promise.race([
      Promise.all(queuePromises),
      new Promise((r) => setTimeout(r, 200)),
    ])
  } else {
    // Stream mode: print banner, attach stream renderer, run, await, print summary.
    const tasks = initialPrompts.map((prompt) => {
      const baseId = slugify(prompt)
      return { prompt, ...uniqueSlug(repoRoot, baseId, new Set()) }
    })
    const tagWidth = Math.max(...tasks.map((t) => t.id.length))
    printStartBanner({
      tasks,
      repoRoot,
      baseSha,
      maxConcurrent: Math.min(args.max, tasks.length),
    })
    attachStreamRenderer(state, tagWidth)
    for (const t of tasks) {
      takenIds.add(t.id)
      queuePromises.push(
        sema.run(() =>
          runAgent({
            prompt: t.prompt,
            id: t.id,
            branch: t.branch,
            worktreePath: t.worktreePath,
            baseSha,
            repoRoot,
            state,
            model: args.model,
          })
        )
      )
    }
    await Promise.all(queuePromises)
  }

  const { wins, losses } = printSummary(state.all())

  process.stdout.write(c.dim(`state: ${statePath(repoRoot)}\n`))
  process.stdout.write(c.dim(`logs:  ${runsDir(repoRoot)}\n\n`))

  if (wins === 0 && losses > 0) process.exit(1)
}

module.exports = { run }
