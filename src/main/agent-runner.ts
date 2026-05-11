import { spawn, type ChildProcess, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { logger } from './logger'
import { createWorktree, removeWorktree } from './worktree'
import { IPC, type AgentEvent, type AgentSpawnOptions, type AgentSpawnResult } from '../shared/ipc'

const exec = promisify(execFile)

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'to', 'for', 'of', 'and', 'or',
  'with', 'on', 'at', 'by', 'from', 'as', 'is', 'be',
])

function slugify(prompt: string): string {
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

/** Friendly display name. First sentence-ish chunk of the prompt, trimmed. */
function taskName(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 60) return cleaned
  const cutAt = cleaned.lastIndexOf(' ', 57)
  return (cutAt > 30 ? cleaned.slice(0, cutAt) : cleaned.slice(0, 57)) + '…'
}

interface AgentRecord {
  id: string
  projectPath: string
  prompt: string
  branch: string
  worktreePath: string
  baseSha: string
  child: ChildProcess | null
  startedAt: number
  webContentsId: number
  output: string[]
  outputBuffer: string
  flushTimer: NodeJS.Timeout | null
}

const agents = new Map<string, AgentRecord>()

function send(webContentsId: number, ev: AgentEvent): void {
  const wc = BrowserWindow.getAllWindows()
    .map((w) => w.webContents)
    .find((c) => c.id === webContentsId && !c.isDestroyed())
  if (wc) wc.send(IPC.AgentEvent, ev)
}

function flushOutput(rec: AgentRecord): void {
  if (!rec.outputBuffer) return
  const chunk = rec.outputBuffer
  rec.outputBuffer = ''
  send(rec.webContentsId, { kind: 'output', agentId: rec.id, text: chunk })
}

function queueFlush(rec: AgentRecord): void {
  if (rec.flushTimer) return
  rec.flushTimer = setTimeout(() => {
    rec.flushTimer = null
    flushOutput(rec)
  }, 60)
}

export async function spawnAgent(
  opts: AgentSpawnOptions,
  webContentsId: number,
): Promise<AgentSpawnResult> {
  const { projectPath, prompt, model, claudeBinary } = opts
  if (!projectPath || !prompt || !claudeBinary) {
    return { ok: false, reason: 'missing required field' }
  }

  // 1. Slugify + ensure unique id for the session
  const baseSlug = slugify(prompt)
  let slug = baseSlug
  let n = 1
  while ([...agents.values()].some((a) => a.projectPath === projectPath && a.branch === `agent/${slug}`)) {
    n += 1
    slug = `${baseSlug}-${n}`
  }
  const agentId = randomUUID()

  // 2. Create worktree
  const wt = await createWorktree(projectPath, slug)
  if (!wt.ok) {
    return { ok: false, reason: `worktree: ${wt.reason}` }
  }

  // 3. Build the claude command. `-p` (print mode) is non-interactive,
  //    streams to stdout then exits.
  //    --setting-sources project,local tells claude to skip
  //    ~/.claude/settings.json — if the user has malformed permissions
  //    entries there, we don't want every spawn to surface them.
  const args = [
    '-p',
    '--dangerously-skip-permissions',
    '--setting-sources',
    'project,local',
  ]
  if (model && model !== 'default') {
    args.push('--model', model)
  }
  args.push(prompt)

  const startedAt = Date.now()
  let child: ChildProcess
  try {
    child = spawn(claudeBinary, args, {
      cwd: wt.worktreePath,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    await removeWorktree(projectPath, wt.worktreePath, wt.branch)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  const rec: AgentRecord = {
    id: agentId,
    projectPath,
    prompt,
    branch: wt.branch,
    worktreePath: wt.worktreePath,
    baseSha: wt.baseSha,
    child,
    startedAt,
    webContentsId,
    output: [],
    outputBuffer: '',
    flushTimer: null,
  }
  agents.set(agentId, rec)

  // 4. Wire output → renderer (batched)
  const onChunk = (data: Buffer) => {
    const text = data.toString('utf8')
    rec.output.push(text)
    rec.outputBuffer += text
    queueFlush(rec)
  }
  child.stdout?.on('data', onChunk)
  child.stderr?.on('data', onChunk)

  // 5. State: starting → running
  send(webContentsId, {
    kind: 'spawn',
    agentId,
    projectPath,
    branch: wt.branch,
    worktreePath: wt.worktreePath,
    prompt,
    name: taskName(prompt),
    slug,
    startedAt,
    pid: child.pid ?? null,
    baseSha: wt.baseSha,
  })
  send(webContentsId, { kind: 'state', agentId, state: 'running' })

  // 6. On exit
  const finish = async (state: 'done' | 'failed' | 'cancelled', exitCode: number | null) => {
    flushOutput(rec)
    const endedAt = Date.now()

    // Capture file changes + commit list within the worktree
    let filesChanged: string[] = []
    let commits: string[] = []
    try {
      const diffOut = await exec(
        'git',
        ['diff', '--name-only', `${wt.baseSha}..HEAD`],
        { cwd: wt.worktreePath, timeout: 5000 },
      )
      filesChanged = diffOut.stdout.trim().split('\n').filter(Boolean)
    } catch {
      /* no commits yet — ignore */
    }
    try {
      // also include unstaged so we surface work that wasn't auto-committed
      const stat = await exec('git', ['status', '--porcelain'], {
        cwd: wt.worktreePath,
        timeout: 5000,
      })
      const dirty = stat.stdout
        .split('\n')
        .map((l) => l.slice(3))
        .filter(Boolean)
      filesChanged = Array.from(new Set([...filesChanged, ...dirty]))
    } catch {
      /* ignore */
    }
    try {
      const log = await exec(
        'git',
        ['log', '--pretty=oneline', `${wt.baseSha}..HEAD`],
        { cwd: wt.worktreePath, timeout: 5000 },
      )
      commits = log.stdout.trim().split('\n').filter(Boolean)
    } catch {
      /* ignore */
    }

    send(webContentsId, {
      kind: 'state',
      agentId,
      state,
      exitCode,
      endedAt,
      elapsedMs: endedAt - startedAt,
      filesChanged,
      commits,
    })

    await logger.info('agent finished', { agentId, state, exitCode, elapsedMs: endedAt - startedAt, filesChanged: filesChanged.length, commits: commits.length })

    agents.delete(agentId)
  }

  child.on('exit', (code) => {
    void finish(code === 0 ? 'done' : 'failed', code)
  })
  child.on('error', (err) => {
    rec.outputBuffer += `\n[spawn error] ${err.message}\n`
    flushOutput(rec)
    void finish('failed', null)
  })

  await logger.info('agent spawned', { agentId, branch: wt.branch, model })
  return {
    ok: true,
    agentId,
    branch: wt.branch,
    worktreePath: wt.worktreePath,
    baseSha: wt.baseSha,
  }
}

export function killAgent(agentId: string): { ok: boolean; reason?: string } {
  const rec = agents.get(agentId)
  if (!rec) return { ok: false, reason: 'unknown agent' }
  try {
    rec.child?.kill('SIGTERM')
    // SIGKILL fallback after a second so we don't leak
    setTimeout(() => {
      try {
        rec.child?.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, 1000)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Best-effort kill all agents owned by a webContents on window close. */
export function killAgentsForWebContents(webContentsId: number): void {
  for (const [id, rec] of agents) {
    if (rec.webContentsId === webContentsId) {
      try {
        rec.child?.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      agents.delete(id)
    }
  }
}
