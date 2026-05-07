'use strict'

const path = require('path')
const { execFileSync, spawn } = require('child_process')
const { existsSync } = require('fs')

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'to', 'for', 'of', 'and', 'or',
  'with', 'on', 'at', 'by', 'from', 'as', 'is', 'be',
])

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function gitTry(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function slugify(prompt) {
  const override = prompt.match(/^@([a-z0-9][a-z0-9-]*):/i)
  if (override) return override[1].toLowerCase()

  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w))
    .slice(0, 4)
    .join('-')

  return slug || 'task'
}

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

function uniqueBranchAndPath(repoRoot, baseId) {
  const repoName = path.basename(repoRoot)
  let id = baseId
  let i = 2
  while (true) {
    const branch = `agent/${id}`
    const wtPath = path.resolve(repoRoot, '..', `${repoName}-${id}`)
    const branchExists = gitTry(['rev-parse', '--verify', branch], repoRoot)
    const pathExists = existsSync(wtPath)
    if (!branchExists && !pathExists) {
      return { id, branch, worktreePath: wtPath }
    }
    id = `${baseId}-${i++}`
  }
}

function printUsage() {
  process.stdout.write(
    [
      'agent-farm — run claude in an isolated git worktree.',
      '',
      'Usage:',
      '  agent-farm "<prompt>"',
      '  agent-farm @<id>: "<prompt>"   # override the slug',
      '',
      'Behavior:',
      '  - creates ../<repo>-<id>/ as a sibling worktree on branch agent/<id>',
      '  - branches off your current HEAD',
      '  - spawns: claude -p --dangerously-skip-permissions "<prompt>"',
      '  - on exit, prints the diff and the cherry-pick command',
      '',
    ].join('\n') + '\n'
  )
}

async function run(argv) {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printUsage()
    return
  }

  const prompt = argv.join(' ').trim()
  if (!prompt) {
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
  const baseId = slugify(prompt)
  const { id, branch, worktreePath } = uniqueBranchAndPath(repoRoot, baseId)

  process.stdout.write(
    [
      `[agent-farm] task:     ${prompt}`,
      `[agent-farm] id:       ${id}`,
      `[agent-farm] branch:   ${branch}`,
      `[agent-farm] worktree: ${worktreePath}`,
      `[agent-farm] base:     ${baseSha.slice(0, 8)}`,
      '',
    ].join('\n') + '\n'
  )

  git(['worktree', 'add', worktreePath, '-b', branch], repoRoot)

  const startedAt = Date.now()
  process.stdout.write(`[${id}] spawning claude...\n`)

  const proc = spawn(
    'claude',
    ['-p', '--dangerously-skip-permissions', prompt],
    { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const tag = (stream) => (chunk) => {
    chunk
      .toString()
      .split('\n')
      .forEach((line) => {
        if (line.length > 0) stream.write(`[${id}] ${line}\n`)
      })
  }
  proc.stdout.on('data', tag(process.stdout))
  proc.stderr.on('data', tag(process.stderr))

  const exitCode = await new Promise((resolve) => proc.on('exit', resolve))
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)

  process.stdout.write(`\n[agent-farm] exit ${exitCode} after ${elapsedSec}s\n`)

  if (exitCode === 0) {
    const diff = execFileSync('git', ['diff', `${baseSha}..HEAD`], {
      cwd: worktreePath,
      encoding: 'utf8',
    })
    const commits = execFileSync(
      'git',
      ['log', '--oneline', `${baseSha}..HEAD`],
      { cwd: worktreePath, encoding: 'utf8' }
    ).trim()

    process.stdout.write(
      [
        '',
        `[agent-farm] commits on ${branch}:`,
        commits || '(no new commits — claude may not have committed)',
        '',
        `[agent-farm] diff (${baseSha.slice(0, 8)}..HEAD):`,
        '',
      ].join('\n') + '\n'
    )
    process.stdout.write(diff || '(no changes)\n')

    process.stdout.write(
      [
        '',
        `[agent-farm] worktree kept at: ${worktreePath}`,
        `[agent-farm] cherry-pick:      git cherry-pick ${branch}`,
        `[agent-farm] cleanup:          git worktree remove "${worktreePath}" && git branch -D ${branch}`,
        '',
      ].join('\n') + '\n'
    )
  } else {
    process.stderr.write(
      `[agent-farm] claude failed. worktree kept for inspection: ${worktreePath}\n`
    )
    process.exit(exitCode || 1)
  }
}

module.exports = { run, slugify }
