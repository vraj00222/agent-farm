import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { PtyCreateOptions } from '../../../shared/ipc'

interface EmbeddedTerminalProps {
  /** Spawn config — passed straight through to pty.create. */
  spawn: PtyCreateOptions
  /** Notified when the underlying pty exits (process done). */
  onExit?: (exitCode: number | null, signal: number | null) => void
  /** Notified once the pty session id is allocated. Lets a parent expose actions
   *  like "Send /login" without re-mounting. */
  onSession?: (sessionId: string) => void
  /** Initial input written to the pty after spawn. Useful to auto-trigger
   *  things like `/login` once the prompt is up. */
  initialInput?: string
  /** Delay before sending initialInput. Default 600ms. */
  initialInputDelayMs?: number
  className?: string
}

/**
 * xterm.js + node-pty bridge. Lifecycle:
 *   mount    → ipc.pty.create → subscribe onData/onExit
 *   unmount  → ipc.pty.kill   → unsubscribe → terminal.dispose
 *
 * Theme is tinted B&W to match our design tokens. Auto-fits when the
 * container resizes.
 */
export function EmbeddedTerminal({
  spawn,
  onExit,
  onSession,
  initialInput,
  initialInputDelayMs = 600,
  className,
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = window.agentFarm
    const container = containerRef.current
    if (!api || !container) return

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: isDark
        ? {
            background: '#0E0E0D',
            foreground: '#F2F2F0',
            cursor: '#F2F2F0',
            cursorAccent: '#0E0E0D',
            selectionBackground: '#3A3A36',
            black: '#181816',
            white: '#F2F2F0',
            brightBlack: '#3A3A36',
            brightWhite: '#FAFAF9',
          }
        : {
            background: '#FAFAF9',
            foreground: '#0F0F0E',
            cursor: '#0F0F0E',
            cursorAccent: '#FAFAF9',
            selectionBackground: '#D6D6D2',
            black: '#0F0F0E',
            white: '#FAFAF9',
            brightBlack: '#5C5C56',
            brightWhite: '#FAFAF9',
          },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    // Initial fit before spawn so we send accurate cols/rows.
    let cols = 80
    let rows = 24
    try {
      fit.fit()
      cols = term.cols
      rows = term.rows
    } catch {
      /* container may not have layout yet; fall back to defaults */
    }

    let sessionId: string | null = null
    let unsubData: (() => void) | null = null
    let unsubExit: (() => void) | null = null
    let killed = false

    const inputDisposable = term.onData((data) => {
      if (sessionId) void api.pty.write(sessionId, data)
    })

    const resizeDisposable = term.onResize(({ cols: c, rows: r }) => {
      if (sessionId) void api.pty.resize(sessionId, c, r)
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    })
    ro.observe(container)

    void (async () => {
      const result = await api.pty.create({ ...spawn, cols, rows })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (killed) {
        // Unmounted before spawn returned.
        void api.pty.kill(result.sessionId)
        return
      }
      sessionId = result.sessionId
      onSession?.(sessionId)

      unsubData = api.pty.onData((e) => {
        if (e.sessionId === sessionId) term.write(e.data)
      })
      unsubExit = api.pty.onExit((e) => {
        if (e.sessionId === sessionId) onExit?.(e.exitCode, e.signal)
      })

      if (initialInput) {
        setTimeout(() => {
          if (sessionId && !killed) void api.pty.write(sessionId, initialInput)
        }, initialInputDelayMs)
      }
    })()

    return () => {
      killed = true
      ro.disconnect()
      inputDisposable.dispose()
      resizeDisposable.dispose()
      unsubData?.()
      unsubExit?.()
      if (sessionId) void api.pty.kill(sessionId)
      term.dispose()
    }
    // We deliberately don't depend on onExit/onSession/initialInput — those
    // are called once after spawn and shouldn't re-mount the terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawn.command, spawn.cwd, JSON.stringify(spawn.args), JSON.stringify(spawn.env)])

  if (error) {
    return (
      <div className={'p-4 text-[12px] text-state-failed font-mono ' + (className ?? '')}>
        terminal failed to start: {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={
        'h-full w-full overflow-hidden bg-bone dark:bg-coal ' + (className ?? '')
      }
    />
  )
}
