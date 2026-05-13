import { BrowserWindow } from 'electron'
import * as nodePty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { IPC, type PtyCreateOptions, type PtyCreateResult } from '../shared/ipc'
import { logger } from './logger'

interface Session {
  id: string
  pty: nodePty.IPty
  ownerWebContentsId: number
}

const sessions = new Map<string, Session>()

function broadcastTo(webContentsId: number, channel: string, payload: unknown): void {
  const wc = BrowserWindow.getAllWindows()
    .map((w) => w.webContents)
    .find((c) => c.id === webContentsId && !c.isDestroyed())
  if (wc) wc.send(channel, payload)
}

export function createPty(
  opts: PtyCreateOptions,
  ownerWebContentsId: number,
): PtyCreateResult {
  // Defensive validation. The renderer is somewhat trusted (it ran our own
  // bundle through contextIsolation) but the contract is async + serialized
  // so a stray bug shouldn't crash main.
  if (typeof opts?.command !== 'string' || opts.command.length === 0) {
    return { ok: false, message: 'command is required' }
  }
  if (!Array.isArray(opts.args)) {
    return { ok: false, message: 'args must be an array' }
  }
  if (typeof opts.cwd !== 'string' || opts.cwd.length === 0) {
    return { ok: false, message: 'cwd is required' }
  }
  const cols = Number.isFinite(opts.cols) ? Math.max(20, Math.min(500, opts.cols)) : 80
  const rows = Number.isFinite(opts.rows) ? Math.max(5, Math.min(200, opts.rows)) : 24

  const id = randomUUID()
  let pty: nodePty.IPty
  try {
    pty = nodePty.spawn(opts.command, opts.args, {
      name: 'xterm-256color',
      cwd: opts.cwd,
      cols,
      rows,
      env: { ...process.env, ...(opts.env ?? {}), TERM: 'xterm-256color' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    void logger.error('pty spawn failed', { command: opts.command, args: opts.args, message })
    return { ok: false, message }
  }

  const session: Session = { id, pty, ownerWebContentsId }
  sessions.set(id, session)

  pty.onData((data) => {
    broadcastTo(ownerWebContentsId, IPC.PtyData, { sessionId: id, data })
  })

  pty.onExit(({ exitCode, signal }) => {
    broadcastTo(ownerWebContentsId, IPC.PtyExit, {
      sessionId: id,
      exitCode: typeof exitCode === 'number' ? exitCode : null,
      signal: typeof signal === 'number' ? signal : null,
    })
    sessions.delete(id)
    // Signal 1 (SIGHUP) on exit means the parent (renderer) called pty.kill —
    // usually because a React component unmounted. Logging both lets us see
    // WHEN and WHY a session died at a glance in the log file.
    void logger.info('pty exit', {
      id,
      exitCode,
      signal,
      cause: signal === 1 ? 'killed-by-renderer' : 'self-exit',
    })
  })

  void logger.info('pty spawn', {
    id,
    command: opts.command,
    args: opts.args,
    cwd: opts.cwd,
    cols,
    rows,
  })
  return { ok: true, sessionId: id }
}

export function writePty(sessionId: string, data: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  if (typeof data !== 'string') return
  s.pty.write(data)
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const s = sessions.get(sessionId)
  if (!s) return
  const c = Math.max(20, Math.min(500, Math.floor(cols)))
  const r = Math.max(5, Math.min(200, Math.floor(rows)))
  try {
    s.pty.resize(c, r)
  } catch {
    /* terminal might be exiting; safe to ignore */
  }
}

export function killPty(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (!s) {
    void logger.info('pty kill: unknown id (already exited?)', { sessionId })
    return
  }
  void logger.info('pty kill: by request from renderer', { sessionId })
  try {
    s.pty.kill()
  } catch {
    /* already gone */
  }
  sessions.delete(sessionId)
}

/** Kill every PTY owned by a webContents. Call on window close. */
export function killSessionsForWebContents(webContentsId: number): void {
  for (const [id, s] of sessions) {
    if (s.ownerWebContentsId === webContentsId) {
      try {
        s.pty.kill()
      } catch {
        /* ignore */
      }
      sessions.delete(id)
    }
  }
}
