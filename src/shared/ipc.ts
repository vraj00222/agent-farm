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

/** Account info read from ~/.claude.json after `claude login`. All fields
 *  optional — claude may stash partial data depending on flow. */
export interface ClaudeAccount {
  /** Display name, e.g. "Vraj Patel". Falls back to local-part of email. */
  displayName?: string
  emailAddress?: string
  /** "pro" | "max" | "team" | "free" — claude calls this `seatTier`. */
  seatTier?: string
  organizationName?: string
  billingType?: string
}

export type ClaudeStatus =
  | { state: 'ok'; binaryPath: string; version: string; authed: true; account?: ClaudeAccount }
  | { state: 'unauthed'; binaryPath: string; version: string }
  | { state: 'missing'; checkedPaths: string[] }
  | { state: 'error'; message: string }

// ── GitHub auth (Device Flow) ────────────────────────────────────────

/** Public-facing account info shown in the title bar + onboarding. The
 *  access token NEVER leaves main — renderer only ever sees these fields. */
export interface GitHubAccount {
  /** GitHub login handle, e.g. "vrajpatel". */
  login: string
  /** Display name from GitHub profile. May be null if user didn't set one. */
  name: string | null
  /** Avatar URL from GitHub. May be null in theory; usually present. */
  avatarUrl: string | null
}

export type GitHubStatus =
  | { state: 'loading' }
  | { state: 'unauthed' }
  | { state: 'ok'; account: GitHubAccount }
  | { state: 'error'; message: string }

/** Result of the initial POST /login/device/code. The renderer renders
 *  `userCode` for the user and opens `verificationUri` in the browser. */
export interface GitHubDeviceFlowStart {
  userCode: string
  verificationUri: string
  /** Internal handle; renderer just passes it back to pollForToken. */
  deviceCode: string
  /** Polling interval in seconds (set by GitHub; usually 5). */
  interval: number
  /** Seconds until `deviceCode` expires (set by GitHub; usually 900). */
  expiresIn: number
}

export type GitHubStartFlowResult =
  | { ok: true; flow: GitHubDeviceFlowStart }
  | { ok: false; reason: string }

export type GitHubPollResult =
  | { ok: true; account: GitHubAccount }
  | { ok: false; reason: string }

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
      /** The prompt the user typed, verbatim. */
      prompt: string
      /** Human-friendly task name derived from the prompt (truncated). */
      name: string
      /** Slug used for the branch + worktree path. */
      slug: string
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
  ClaudeOpenLoginInTerminal: 'claude:open-login-in-terminal',
  GitHubStatus: 'github:status',
  GitHubStartFlow: 'github:start-flow',
  GitHubPollForToken: 'github:poll-for-token',
  GitHubSignOut: 'github:sign-out',
  /** Event channel (main → renderer) — emits GitHubStatus updates. */
  GitHubStatusEvent: 'github:status-event',
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
  /** User's login shell (`$SHELL`), falling back to `/bin/zsh` on macOS. */
  shell: string
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
    /** Escape hatch when the embedded login flow hangs. On macOS, opens
     *  Terminal.app and runs `claude /login`. Returns ok+pid or a reason. */
    openLoginInTerminal(): Promise<{ ok: boolean; reason?: string }>
  }

  github: {
    /** One-shot read of current status (uses cached account from settings). */
    status(): Promise<GitHubStatus>
    /** Subscribe to status changes (sign-in / sign-out events). */
    onStatus(cb: (s: GitHubStatus) => void): () => void
    /** Begin Device Flow: returns the code the user must enter on github.com. */
    startDeviceFlow(): Promise<GitHubStartFlowResult>
    /** Poll until the user approves (or until expired/denied). Long-lived. */
    pollForToken(deviceCode: string, intervalSeconds: number): Promise<GitHubPollResult>
    /** Clear stored token + account. */
    signOut(): Promise<void>
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
