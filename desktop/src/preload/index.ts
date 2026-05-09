import { contextBridge } from 'electron'

// Typed surface exposed to the renderer. We start with the bare minimum
// (platform info) and add IPC channels in subsequent rungs as we wire up
// the runner / state / pty / git layer.
const api = {
  platform: process.platform,
  arch: process.arch,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('agentFarm', api)
  } catch (error) {
    console.error('preload contextBridge error:', error)
  }
} else {
  // @ts-expect-error fallback for non-isolated
  window.agentFarm = api
}

export type AgentFarmApi = typeof api
