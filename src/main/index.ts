import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ALLOWED_EXTERNAL_HOSTS,
  IPC,
  type LogPayload,
  type PtyCreateOptions,
} from '../shared/ipc'
import { logger } from './logger'
import { forgetProject, listRecentProjects } from './settings'
import { inspectPath, openProjectDialog } from './project'
import { detectClaude } from './claude'
import { listProjectTree } from './fs-list'
import { getGitDiff } from './git-diff'
import { runSmoke } from './smoke'
import {
  createPty,
  killPty,
  killSessionsForWebContents,
  resizePty,
  writePty,
} from './pty'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    show: false,
    title: 'Agent Farm',
    backgroundColor: '#FAFAFA',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    if (mainWindow) {
      killSessionsForWebContents(mainWindow.webContents.id)
    }
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // Open devtools in dev so issues are visible without a key combo.
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isAllowedExternal(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return (ALLOWED_EXTERNAL_HOSTS as readonly string[]).some(
      (host) => u.hostname === host || u.hostname.endsWith('.' + host),
    )
  } catch {
    return false
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.ProjectOpen, async (_e, path?: unknown) => {
    if (typeof path === 'string' && path.length > 0) {
      return inspectPath(path)
    }
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    return openProjectDialog(win)
  })

  ipcMain.handle(IPC.ProjectRecentList, async () => listRecentProjects())

  ipcMain.handle(IPC.ProjectRecentForget, async (_e, path: string) => {
    if (typeof path !== 'string') return listRecentProjects()
    return forgetProject(path)
  })

  ipcMain.handle(IPC.ClaudeDetect, async () => detectClaude())

  ipcMain.handle(IPC.OpenExternal, async (_e, url: string) => {
    if (typeof url !== 'string' || !isAllowedExternal(url)) {
      await logger.warn('shell.openExternal blocked', { url })
      return { ok: false, reason: 'blocked' as const }
    }
    await shell.openExternal(url)
    return { ok: true }
  })

  ipcMain.handle(IPC.FsList, async (_e, path: string, opts?: unknown) => {
    if (typeof path !== 'string' || path.length === 0) {
      return { ok: false, reason: 'path required' }
    }
    return listProjectTree(path, (opts ?? {}) as Parameters<typeof listProjectTree>[1])
  })

  ipcMain.handle(IPC.GitDiff, async (_e, path: string) => {
    if (typeof path !== 'string' || path.length === 0) {
      return { ok: false, reason: 'path required' }
    }
    return getGitDiff(path)
  })

  ipcMain.handle(IPC.RevealInFinder, async (_e, path: string) => {
    if (typeof path !== 'string' || path.length === 0) {
      return { ok: false, reason: 'invalid path' }
    }
    try {
      shell.showItemInFolder(path)
      return { ok: true }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return { ok: false, reason }
    }
  })

  ipcMain.handle(IPC.Log, async (_e, payload: LogPayload) => {
    if (!payload || typeof payload.message !== 'string') return
    await logger.fromRenderer(payload)
  })

  ipcMain.handle(IPC.PtyCreate, async (e, opts: PtyCreateOptions) => {
    return createPty(opts, e.sender.id)
  })

  ipcMain.handle(IPC.PtyWrite, async (_e, sessionId: string, data: string) => {
    writePty(sessionId, data)
  })

  ipcMain.handle(IPC.PtyResize, async (_e, sessionId: string, cols: number, rows: number) => {
    resizePty(sessionId, cols, rows)
  })

  ipcMain.handle(IPC.PtyKill, async (_e, sessionId: string) => {
    killPty(sessionId)
  })
}

app.whenReady().then(async () => {
  if (process.env.AGENTFARM_SMOKE === '1') {
    const code = await runSmoke({ detectClaude, inspectPath })
    app.exit(code)
    return
  }

  registerIpc()
  await logger.info('app ready', { version: app.getVersion(), platform: process.platform })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (err) => {
  void logger.error('uncaughtException', { message: err.message, stack: err.stack })
})
process.on('unhandledRejection', (reason) => {
  void logger.error('unhandledRejection', { reason: String(reason) })
})
