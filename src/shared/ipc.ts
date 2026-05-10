/**
 * Single source of truth for the IPC surface between main, preload, and
 * renderer. Every channel name and every request/response shape lives here.
 *
 * Imported by:
 *   - src/main/index.ts        (registers handlers)
 *   - src/preload/index.ts     (wraps ipcRenderer.invoke)
 *   - src/renderer/...         (calls window.agentFarm.*)
 */

// ── Project lifecycle ────────────────────────────────────────────────

export interface ProjectInfo {
  /** Absolute path to the repo root (`git rev-parse --show-toplevel`). */
  path: string
  /** Last segment of `path`. Used as a display name. */
  repoName: string
  /** HEAD SHA at open time. Empty string for a freshly-init'd repo with no commits. */
  baseSha: string
  /** True if `git status --porcelain` returned anything. */
  dirty: boolean
}

export interface RecentProject {
  path: string
  repoName: string
  /** Epoch ms of last open. Drives the welcome screen ordering. */
  lastOpenedAt: number
}

export type ProjectOpenResult =
  | { ok: true; project: ProjectInfo }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'not_a_git_repo'; path: string }
  | { ok: false; reason: 'unreadable'; path: string; message: string }

// ── Claude detection ─────────────────────────────────────────────────

export type ClaudeStatus =
  | { state: 'ok'; binaryPath: string; version: string; authed: true }
  | { state: 'unauthed'; binaryPath: string; version: string }
  | { state: 'missing'; checkedPaths: string[] }
  | { state: 'error'; message: string }

// ── External links ───────────────────────────────────────────────────

/** Hosts we allow `shell.openExternal` to navigate to. Defense in depth. */
export const ALLOWED_EXTERNAL_HOSTS = [
  'claude.ai',
  'docs.claude.com',
  'docs.anthropic.com',
  'www.anthropic.com',
  'github.com',
] as const

// ── Embedded PTY ─────────────────────────────────────────────────────

export interface PtyCreateOptions {
  /** Absolute binary path. Required — we don't search PATH inside main. */
  command: string
  /** Args. */
  args: string[]
  /** Working directory. */
  cwd: string
  /** Initial terminal size in cells. */
  cols: number
  rows: number
  /** Optional env merged onto process.env. */
  env?: Record<string, string>
}

export type PtyCreateResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string }

export interface PtyDataEvent {
  sessionId: string
  data: string
}

export interface PtyExitEvent {
  sessionId: string
  exitCode: number | null
  signal: number | null
}

// ── Logging ──────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogPayload {
  level: LogLevel
  message: string
  /** JSON-stable extra context (no functions, no circular). */
  data?: Record<string, unknown>
}

// ── Channel names ────────────────────────────────────────────────────
// Convention: `<noun>:<verb>`. Keep in sync with the surface below.

export const IPC = {
  ProjectOpen: 'project:open',
  ProjectRecentList: 'project:recent:list',
  ProjectRecentForget: 'project:recent:forget',
  ClaudeDetect: 'claude:detect',
  OpenExternal: 'shell:open-external',
  Log: 'log:write',
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyKill: 'pty:kill',
  /** Event channels (main → renderer). */
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
} as const

// ── Renderer surface (the window.agentFarm.* contract) ───────────────

/** Mirror of NodeJS.Platform — kept here so the renderer doesn't need @types/node. */
export type Platform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export interface AgentFarmApi {
  platform: Platform
  arch: string
  /** Absolute path to the user's home directory. Renderer-safe convenience. */
  home: string
  versions: { node: string; chrome: string; electron: string }

  project: {
    /** With no arg, shows native folder picker. With a path, skips the dialog. */
    open(path?: string): Promise<ProjectOpenResult>
    recent: {
      list(): Promise<RecentProject[]>
      forget(path: string): Promise<RecentProject[]>
    }
  }

  claude: {
    detect(): Promise<ClaudeStatus>
  }

  pty: {
    create(opts: PtyCreateOptions): Promise<PtyCreateResult>
    write(sessionId: string, data: string): Promise<void>
    resize(sessionId: string, cols: number, rows: number): Promise<void>
    kill(sessionId: string): Promise<void>
    onData(cb: (e: PtyDataEvent) => void): () => void
    onExit(cb: (e: PtyExitEvent) => void): () => void
  }

  /** Opens an external URL via shell.openExternal after host allowlist check. */
  openExternal(url: string): Promise<{ ok: boolean; reason?: string }>

  log(payload: LogPayload): Promise<void>
}
