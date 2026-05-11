import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { homedir } from 'node:os'
import {
  IPC,
  type AgentFarmApi,
  type ClaudeStatus,
  type LogPayload,
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
  versions: {
    node: process.versions.node ?? '',
    chrome: process.versions.chrome ?? '',
    electron: process.versions.electron ?? '',
  },

  project: {
    open: (path?: string): Promise<ProjectOpenResult> =>
      ipcRenderer.invoke(IPC.ProjectOpen, path),
    recent: {
      list: (): Promise<RecentProject[]> => ipcRenderer.invoke(IPC.ProjectRecentList),
      forget: (path: string): Promise<RecentProject[]> =>
        ipcRenderer.invoke(IPC.ProjectRecentForget, path),
    },
  },

  claude: {
    detect: (): Promise<ClaudeStatus> => ipcRenderer.invoke(IPC.ClaudeDetect),
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
