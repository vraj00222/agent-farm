import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentFarmApi,
  type ClaudeStatus,
  type LogPayload,
  type ProjectOpenResult,
  type RecentProject,
} from '../shared/ipc'

const api: AgentFarmApi = {
  platform: process.platform,
  arch: process.arch,
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

  openExternal: (url: string) => ipcRenderer.invoke(IPC.OpenExternal, url),

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
