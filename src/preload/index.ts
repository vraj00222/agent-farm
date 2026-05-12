import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { homedir } from 'node:os'
import {
  IPC,
  type AgentEvent,
  type AgentFarmApi,
  type AgentSpawnOptions,
  type AgentSpawnResult,
  type ClaudeStatus,
  type FsListOptions,
  type FsListResult,
  type GitDiffResult,
  type GitHubPollResult,
  type GitHubStartFlowResult,
  type GitHubStatus,
  type LogPayload,
  type ProjectCloneOptions,
  type ProjectCloneResult,
  type ProjectOpenResult,
  type PtyCreateOptions,
  type PtyCreateResult,
  type PtyDataEvent,
  type PtyExitEvent,
  type RecentProject,
} from '../shared/ipc'

const api: AgentFarmApi = {
  platform: process.platform,
  arch: process.arch,
  home: homedir(),
  shell: process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh'),
  versions: {
    node: process.versions.node ?? '',
    chrome: process.versions.chrome ?? '',
    electron: process.versions.electron ?? '',
  },

  project: {
    open: (path?: string): Promise<ProjectOpenResult> =>
      ipcRenderer.invoke(IPC.ProjectOpen, path),
    clone: (opts: ProjectCloneOptions): Promise<ProjectCloneResult> =>
      ipcRenderer.invoke(IPC.ProjectClone, opts),
    recent: {
      list: (): Promise<RecentProject[]> => ipcRenderer.invoke(IPC.ProjectRecentList),
      forget: (path: string): Promise<RecentProject[]> =>
        ipcRenderer.invoke(IPC.ProjectRecentForget, path),
    },
  },

  agent: {
    spawn: (opts: AgentSpawnOptions): Promise<AgentSpawnResult> =>
      ipcRenderer.invoke(IPC.AgentSpawn, opts),
    kill: (agentId: string): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke(IPC.AgentKill, agentId),
    onEvent: (cb: (e: AgentEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: AgentEvent) => cb(payload)
      ipcRenderer.on(IPC.AgentEvent, listener)
      return () => ipcRenderer.removeListener(IPC.AgentEvent, listener)
    },
  },

  claude: {
    detect: (): Promise<ClaudeStatus> => ipcRenderer.invoke(IPC.ClaudeDetect),
  },

  github: {
    status: (): Promise<GitHubStatus> => ipcRenderer.invoke(IPC.GitHubStatus),
    onStatus: (cb: (s: GitHubStatus) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: GitHubStatus) => cb(payload)
      ipcRenderer.on(IPC.GitHubStatusEvent, listener)
      return () => ipcRenderer.removeListener(IPC.GitHubStatusEvent, listener)
    },
    startDeviceFlow: (): Promise<GitHubStartFlowResult> =>
      ipcRenderer.invoke(IPC.GitHubStartFlow),
    pollForToken: (deviceCode: string, intervalSeconds: number): Promise<GitHubPollResult> =>
      ipcRenderer.invoke(IPC.GitHubPollForToken, deviceCode, intervalSeconds),
    signOut: (): Promise<void> => ipcRenderer.invoke(IPC.GitHubSignOut),
  },

  fs: {
    list: (path: string, opts?: FsListOptions): Promise<FsListResult> =>
      ipcRenderer.invoke(IPC.FsList, path, opts),
  },

  git: {
    diff: (path: string): Promise<GitDiffResult> => ipcRenderer.invoke(IPC.GitDiff, path),
  },

  pty: {
    create: (opts: PtyCreateOptions): Promise<PtyCreateResult> =>
      ipcRenderer.invoke(IPC.PtyCreate, opts),
    write: (sessionId: string, data: string): Promise<void> =>
      ipcRenderer.invoke(IPC.PtyWrite, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke(IPC.PtyResize, sessionId, cols, rows),
    kill: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.PtyKill, sessionId),
    onData: (cb: (e: PtyDataEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: PtyDataEvent) => cb(payload)
      ipcRenderer.on(IPC.PtyData, listener)
      return () => ipcRenderer.removeListener(IPC.PtyData, listener)
    },
    onExit: (cb: (e: PtyExitEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: PtyExitEvent) => cb(payload)
      ipcRenderer.on(IPC.PtyExit, listener)
      return () => ipcRenderer.removeListener(IPC.PtyExit, listener)
    },
  },

  openExternal: (url: string) => ipcRenderer.invoke(IPC.OpenExternal, url),

  revealInFinder: (path: string) => ipcRenderer.invoke(IPC.RevealInFinder, path),

  log: (payload: LogPayload): Promise<void> => ipcRenderer.invoke(IPC.Log, payload),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('agentFarm', api)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('preload contextBridge error:', error)
  }
} else {
  // @ts-expect-error fallback for non-isolated
  window.agentFarm = api
}

export type { AgentFarmApi }
