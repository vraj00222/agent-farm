import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'

const exec = promisify(execFile)

/**
 * Escape hatch for the embedded `claude /login` flow. When the in-app PTY
 * approach gets stuck (race conditions with the REPL's startup banner, paste
 * issues, etc.), the user can fall back to running claude in their own
 * Terminal.app window. Once they're done, the renderer polls `claude detect`
 * and proceeds normally.
 *
 * macOS-only for v1 — the desktop app is mac-only per electron-builder.yml.
 */
export async function openClaudeLoginInTerminal(): Promise<{
  ok: boolean
  reason?: string
}> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'Terminal.app fallback is macOS-only' }
  }
  // Quote-safe: the inner command runs inside an AppleScript string, then
  // AppleScript hands it to Terminal which evaluates it as shell input.
  const inner = `claude /login`
  const script = `tell application "Terminal" to do script "${inner}"\nactivate application "Terminal"`
  try {
    await exec('osascript', ['-e', script])
    await logger.info('claude-auth: opened login in Terminal.app')
    return { ok: true }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await logger.error('claude-auth: failed to open Terminal.app', { reason })
    return { ok: false, reason }
  }
}
