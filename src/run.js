'use strict'

const path = require('path')
const { execFileSync } = require('child_process')
const { slugify, git, uniqueSlug, c, fmtElapsed } = require('./util.js')
const { runAgent } = require('./runner.js')

function checkPrereqs() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new Error('`git` not found in PATH.')
  }
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new Error(
      '`claude` CLI not found in PATH. Install: npm i -g @anthropic-ai/claude-code'
    )
  }
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

function printUsage() {
  process.stdout.write(
    [
      `${c.bold('agent-farm')} — run claude in isolated git worktrees, in parallel.`,
      '',
      'Usage:',
      `  agent-farm "<prompt>"                              # one task`,
      `  agent-farm "<prompt>" "<prompt>" "<prompt>"        # N parallel tasks`,
      `  agent-farm @<id>: "<prompt>"                       # override the slug`,
      '',
      'Each prompt becomes:',
      '  - branch:   agent/<id>',
      '  - worktree: ../<repo>-<id>/    (sibling, off your current HEAD)',
      '  - process:  claude -p --dangerously-skip-permissions <wrapped prompt>',
      '',
      'On exit, agent-farm prints a summary, the cherry-pick commands you',
      'can copy, and the cleanup commands. Worktrees are kept until you',
      'remove them so you can inspect anything that went sideways.',
      '',
    ].join('\n') + '\n'
  )
}

function printStartBanner({ tasks, repoRoot, baseSha }) {
  const repoName = path.basename(repoRoot)
  const idWidth = Math.max(...tasks.map((t) => t.id.length))
  process.stdout.write('\n')
  process.stdout.write(
    `${c.bold('[agent-farm]')} ${tasks.length} task${tasks.length === 1 ? '' : 's'} · base ${c.dim(baseSha.slice(0, 8))} · repo ${c.dim(repoName)}\n`
  )
  for (const t of tasks) {
    const idCol = c.cyan(t.id.padEnd(idWidth, ' '))
    const branchCol = c.dim(t.branch)
    process.stdout.write(`  ${c.dim('▸')} ${idCol}  ${branchCol}\n`)
  }
  process.stdout.write('\n')
}

function printSummary(results, repoRoot) {
  const idWidth = Math.max(...results.map((r) => r.id.length), 'id'.length)
  const stateGlyph = {
    done: c.green('✓'),
    noop: c.yellow('○'),
    failed: c.red('✗'),
    pending: c.dim('?'),
    running: c.dim('?'),
  }

  process.stdout.write('\n')
  process.stdout.write(`${c.bold('[agent-farm]')} summary\n`)
  for (const r of results) {
    const glyph = stateGlyph[r.state] || '?'
    const idCol = r.id.padEnd(idWidth, ' ')
    const elapsed = fmtElapsed(r.elapsedMs).padStart(7, ' ')
    let detail
    if (r.state === 'failed') {
      detail = c.red(
        r.error
          ? r.error
          : `exit ${r.exitCode}` +
              (r.commits.length > 0 ? ` (${r.commits.length} partial commit(s))` : '')
      )
    } else if (r.state === 'noop') {
      detail = c.yellow('no changes')
    } else {
      const auto = r.autoCommitted ? c.dim(' (auto-committed)') : ''
      detail = `${r.commits.length} commit${r.commits.length === 1 ? '' : 's'} · ${r.filesChanged.length} file${r.filesChanged.length === 1 ? '' : 's'}${auto}`
    }
    process.stdout.write(
      `  ${glyph} ${c.cyan(idCol)}  ${c.dim(elapsed)}  ${detail}\n`
    )
    if (r.state === 'failed' && r.lastLines.length > 0) {
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

  process.stdout.write(`\n${c.bold('cleanup:')}\n`)
  for (const r of [...wins, ...losses]) {
    process.stdout.write(
      `  git worktree remove "${r.worktreePath}" && git branch -D ${r.branch}\n`
    )
  }
  process.stdout.write('\n')

  return { wins: wins.length, losses: losses.length }
}

async function run(argv) {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printUsage()
    return
  }

  const prompts = argv.filter((a) => a.trim().length > 0)
  if (prompts.length === 0) {
    printUsage()
    process.exit(1)
  }

  checkPrereqs()

  let repoRoot
  try {
    repoRoot = git(['rev-parse', '--show-toplevel'])
  } catch {
    throw new Error('not inside a git repository.')
  }
  checkRepoClean(repoRoot)
  const baseSha = git(['rev-parse', 'HEAD'], repoRoot)

  const taken = new Set()
  const tasks = prompts.map((prompt) => {
    const baseId = slugify(prompt)
    const slug = uniqueSlug(repoRoot, baseId, taken)
    return { prompt, ...slug }
  })

  printStartBanner({ tasks, repoRoot, baseSha })
  const tagWidth = Math.max(...tasks.map((t) => t.id.length))

  const results = await Promise.all(
    tasks.map((t) =>
      runAgent({
        prompt: t.prompt,
        id: t.id,
        branch: t.branch,
        worktreePath: t.worktreePath,
        baseSha,
        repoRoot,
        tagWidth,
        out: process.stdout,
        err: process.stderr,
      })
    )
  )

  const { wins, losses } = printSummary(results, repoRoot)

  if (wins === 0 && losses > 0) process.exit(1)
}

module.exports = { run }
