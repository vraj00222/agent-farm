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
  /** Absolute path to the project root. For git repos this is the repo
   *  top-level (`git rev-parse --show-toplevel`); for non-git folders it's
   *  exactly the path the user picked. */
  path: string
  /** Last segment of `path`. Used as a display name. */
  repoName: string
  /** HEAD SHA at open time. Empty for non-git or fresh git repos. */
  baseSha: string
  /** True if the folder is a git working tree. Non-git folders open with
   *  reduced affordances — you can preview / edit but worktree-based agent
   *  spawning needs a git repo. The session view should offer
   *  "Initialize as git" if this is false. */
  isGitRepo: boolean
  /** True if `git status --porcelain` returned anything. False for non-git. */
  dirty: boolean
  /** True if the folder contains an `index.html` at the root — drives the
   *  preview affordance. */
  hasIndexHtml: boolean
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

// ── Filesystem listing ───────────────────────────────────────────────

export interface FsEntry {
  /** Just the basename (e.g. "src", "package.json"). */
  name: string
  /** Absolute path. */
  path: string
  kind: 'dir' | 'file'
  /** Populated for directories that were recursed into. Empty for files. */
  children?: FsEntry[]
  /** True if recursion stopped here because we hit the depth cap. */
  truncated?: boolean
}

export interface FsListOptions {
  /** Hard cap on recursion depth from the root. Default 3. */
  maxDepth?: number
  /** Hard cap on total entries returned. Default 600. */
  maxEntries?: number
}

export type FsListResult =
  | { ok: true; root: FsEntry; totalEntries: number; capped: boolean }
  | { ok: false; reason: string }

// ── Git diff ─────────────────────────────────────────────────────────

export type GitDiffResult =
  | { ok: true; diff: string; filesChanged: number }
  | { ok: false; reason: string }

// ── Agent runner (per-task spawn) ────────────────────────────────────

export interface AgentSpawnOptions {
  projectPath: string
  prompt: string
  /** Model alias or full name. 'default' = pass nothing. */
  model: string
  /** Absolute path to the claude CLI, from claude.detect. */
  claudeBinary: string
}

export type AgentSpawnResult =
  | {
      ok: true
      agentId: string
      branch: string
      worktreePath: string
      baseSha: string
    }
  | { ok: false; reason: string }

export type AgentEvent =
  | {
      kind: 'spawn'
      agentId: string
      projectPath: string
      branch: string
      worktreePath: string
      prompt: string
      startedAt: number
      pid: number | null
      baseSha: string
    }
  | { kind: 'state'; agentId: string; state: 'running' }
  | {
      kind: 'state'
      agentId: string
      state: 'done' | 'failed' | 'cancelled'
      exitCode: number | null
      endedAt: number
      elapsedMs: number
      filesChanged: string[]
      commits: string[]
    }
  | { kind: 'output'; agentId: string; text: string }

// ── Project clone ────────────────────────────────────────────────────

export interface ProjectCloneOptions {
  /** GitHub URL or any git remote URL. */
  url: string
  /** Parent directory. The cloned repo will be placed at parentPath/repoName. */
  parentPath: string
}

export type ProjectCloneResult =
  | { ok: true; project: ProjectInfo }
  | { ok: false; reason: string }

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
  ProjectClone: 'project:clone',
  ProjectRecentList: 'project:recent:list',
  ProjectRecentForget: 'project:recent:forget',
  ClaudeDetect: 'claude:detect',
  OpenExternal: 'shell:open-external',
  RevealInFinder: 'shell:reveal',
  FsList: 'fs:list',
  GitDiff: 'git:diff',
  AgentSpawn: 'agent:spawn',
  AgentKill: 'agent:kill',
  AgentEvent: 'agent:event',
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
    clone(opts: ProjectCloneOptions): Promise<ProjectCloneResult>
    recent: {
      list(): Promise<RecentProject[]>
      forget(path: string): Promise<RecentProject[]>
    }
  }

  agent: {
    spawn(opts: AgentSpawnOptions): Promise<AgentSpawnResult>
    kill(agentId: string): Promise<{ ok: boolean; reason?: string }>
    onEvent(cb: (e: AgentEvent) => void): () => void
  }

  claude: {
    detect(): Promise<ClaudeStatus>
  }

  fs: {
    list(path: string, opts?: FsListOptions): Promise<FsListResult>
  }

  git: {
    diff(path: string): Promise<GitDiffResult>
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

  /** Reveals a local path in Finder (macOS) / Explorer (Windows). */
  revealInFinder(path: string): Promise<{ ok: boolean; reason?: string }>

  log(payload: LogPayload): Promise<void>
}
