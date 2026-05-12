import { useEffect, useRef, useState } from 'react'
import type { GitHubDeviceFlowStart } from '../../../shared/ipc'

interface GitHubLoginPanelProps {
  onClose: () => void
  onSuccess: () => void
  /** Latest status pushed from main via the github:status event. If it
   *  flips to 'ok' while we're awaiting, the panel auto-dismisses
   *  regardless of what our local poll Promise is doing. Optional so
   *  React HMR's transient mounts with stale props don't crash. */
  externalStatus?: import('../../../shared/ipc').GitHubStatus
}

type FlowState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'awaiting'; flow: GitHubDeviceFlowStart; secondsLeft: number }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

/**
 * GitHub Device Flow sign-in panel. Mirrors the layout of ClaudeLoginPanel
 * — bottom slab with title bar and primary action. Shows the 8-char user
 * code with copy button and opens the verification URL.
 */
export function GitHubLoginPanel({ onClose, onSuccess, externalStatus }: GitHubLoginPanelProps) {
  const [state, setState] = useState<FlowState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  /** Set after the user clicks "Open GitHub & enter code" — flips the
   *  status line from "Open GitHub" to "Waiting for confirmation…". */
  const [opened, setOpened] = useState(false)
  const [checking, setChecking] = useState(false)
  /** Last check-now result message, surfaced under the buttons. Cleared
   *  when the user takes any further action. */
  const [hint, setHint] = useState<string | null>(null)
  // Track whether a poll is in flight so a fast remount doesn't double-poll.
  const polling = useRef(false)

  const start = async () => {
    const api = window.agentFarm
    if (!api) return
    setState({ kind: 'starting' })
    const res = await api.github.startDeviceFlow()
    if (!res.ok) {
      setState({ kind: 'error', message: res.reason })
      return
    }
    setState({ kind: 'awaiting', flow: res.flow, secondsLeft: res.flow.expiresIn })
    void api.openExternal(res.flow.verificationUri)
    if (polling.current) return
    polling.current = true
    try {
      const poll = await api.github.pollForToken(res.flow.deviceCode, res.flow.interval)
      if (poll.ok) {
        setState({ kind: 'success' })
        setTimeout(onSuccess, 1200)
      } else {
        setState({ kind: 'error', message: poll.reason })
      }
    } finally {
      polling.current = false
    }
  }

  // Auto-start on mount. The user already clicked "Connect GitHub" to get
  // here — they shouldn't have to click again.
  useEffect(() => {
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown tick.
  useEffect(() => {
    if (state.kind !== 'awaiting') return
    const id = setInterval(() => {
      setState((s) => {
        if (s.kind !== 'awaiting') return s
        const next = s.secondsLeft - 1
        return { ...s, secondsLeft: Math.max(0, next) }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state.kind])

  // Esc to cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const handleCopy = async () => {
    if (state.kind !== 'awaiting') return
    try {
      await navigator.clipboard.writeText(state.flow.userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignored — fallback is the displayed code itself */
    }
  }

  const handleOpenVerify = () => {
    if (state.kind !== 'awaiting') return
    void window.agentFarm?.openExternal(state.flow.verificationUri)
    setOpened(true)
  }

  const handleCheckNow = async () => {
    if (state.kind !== 'awaiting' || checking) return
    setChecking(true)
    setHint(null)
    try {
      const api = window.agentFarm
      if (!api) {
        setHint('IPC bridge unavailable — relaunch the app.')
        return
      }
      const res = await api.github.checkOnce(state.flow.deviceCode)
      if (res.ok) {
        setState({ kind: 'success' })
        setTimeout(onSuccess, 1000)
        return
      }
      // Stay in awaiting state; show the reason so the user knows what happened.
      setHint(res.reason)
      // eslint-disable-next-line no-console
      console.warn('[github checkOnce]', res.reason)
    } catch (err) {
      // The most common failure here is "No handler registered for
      // 'github:check-once'" — happens if the main process is still the
      // old build because electron-vite didn't auto-restart on the main
      // file change. Surface clearly so the user knows to relaunch.
      const message = err instanceof Error ? err.message : String(err)
      setHint(
        message.includes('No handler')
          ? 'Main process is stale — Cmd+Q and `npm run dev` to reload it.'
          : `Check failed: ${message}`,
      )
      // eslint-disable-next-line no-console
      console.error('[github checkOnce] threw', err)
    } finally {
      setChecking(false)
    }
  }

  // Belt-and-braces: dismiss the panel the moment github-auth broadcasts ok,
  // even if our local poll Promise is still pending (e.g. mid-interval sleep).
  const externalState = externalStatus?.state
  useEffect(() => {
    if (externalState === 'ok' && state.kind !== 'success') {
      setState({ kind: 'success' })
      setTimeout(onSuccess, 600)
    }
  }, [externalState, state.kind, onSuccess])

  return (
    <div
      className="no-drag absolute inset-x-0 bottom-0 z-50 flex flex-col bg-bone dark:bg-coal"
      style={{ top: 'var(--titlebar-h)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="no-drag flex items-center justify-between gap-4 px-5 py-3
                   border-b border-line dark:border-line-dark"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-display font-semibold text-[14px] tracking-tightest
                       text-ink-900 dark:text-chalk shrink-0"
          >
            Connect to GitHub
          </span>
          <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle truncate">
            device flow · repo + read:user
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            onMouseDown={(e) => e.preventDefault()}
            className="no-drag px-3 py-1.5 rounded-md font-display text-[12px]
                       border border-line dark:border-line-dark
                       text-ink-700 dark:text-chalk-dim
                       hover:border-ink-500 dark:hover:border-chalk-dim
                       hover:text-ink-900 dark:hover:text-chalk
                       transition-all duration-150 cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            Cancel <kbd className="ml-1 font-mono text-[10px] opacity-60">esc</kbd>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-10 flex flex-col items-center justify-center">
        {state.kind === 'idle' || state.kind === 'starting' ? (
          <p className="font-mono text-[12px] text-ink-500 dark:text-chalk-dim">
            Requesting code from GitHub…
          </p>
        ) : state.kind === 'awaiting' ? (
          <div className="flex flex-col items-center gap-7 max-w-[520px] w-full">
            <p className="text-[13px] text-ink-700 dark:text-chalk-dim text-center leading-relaxed">
              Open GitHub and enter the code below to authorize{' '}
              <span className="font-display font-semibold">Agent Farm</span>.
              <br />
              We requested <span className="font-mono">repo</span> and{' '}
              <span className="font-mono">read:user</span> — enough to clone your
              private repos and show your name in the title bar.
            </p>

            <div className="flex items-center gap-3">
              <code
                className="font-mono font-semibold text-[26px] tracking-[0.25em]
                           text-ink-900 dark:text-chalk
                           bg-ink-900/[0.03] dark:bg-chalk/[0.04]
                           border border-line dark:border-line-dark rounded-md
                           px-5 py-3"
              >
                {state.flow.userCode}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="no-drag px-3 py-2 rounded-md font-display text-[12px]
                           border border-line dark:border-line-dark
                           text-ink-700 dark:text-chalk-dim
                           hover:border-ink-500 dark:hover:border-chalk-dim
                           hover:text-ink-900 dark:hover:text-chalk
                           transition-all duration-150 cursor-pointer"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleOpenVerify}
                className="no-drag inline-flex items-center gap-2 px-4 py-2 rounded-md
                           border border-ink-900/30 dark:border-chalk/30
                           hover:border-ink-900 dark:hover:border-chalk
                           hover:-translate-y-0.5 hover:shadow-sm
                           active:scale-[0.985] active:translate-y-0
                           transition-all duration-200 ease-quart-out
                           font-display font-semibold text-[12.5px]
                           text-ink-900 dark:text-chalk bg-bone dark:bg-coal cursor-pointer"
              >
                Open GitHub & enter code
              </button>
              {opened && (
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void handleCheckNow()}
                  className="no-drag inline-flex items-center gap-2 px-3 py-2 rounded-md
                             border border-line dark:border-line-dark
                             text-ink-700 dark:text-chalk-dim
                             hover:border-ink-500 dark:hover:border-chalk-dim
                             hover:text-ink-900 dark:hover:text-chalk
                             transition-all duration-150
                             font-display text-[12px]
                             disabled:opacity-60 cursor-pointer"
                >
                  {checking ? 'Checking…' : 'I just authorized — check now'}
                </button>
              )}
            </div>

            <p className="font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
              {opened
                ? 'Waiting for GitHub to confirm your authorization…'
                : `Code expires in ${formatCountdown(state.secondsLeft)} · polling every ${state.flow.interval}s`}
            </p>
            {hint && (
              <p
                className="font-mono text-[11px] text-state-failed text-center max-w-[480px]"
                role="status"
              >
                {hint}
              </p>
            )}
          </div>
        ) : state.kind === 'success' ? (
          <p className="text-[14px] font-display font-semibold text-ink-900 dark:text-chalk">
            Signed in ✓
          </p>
        ) : (
          <div className="flex flex-col items-center gap-5 max-w-[440px] w-full">
            <p className="text-[13px] text-state-failed text-center">{state.message}</p>
            <button
              type="button"
              onClick={() => void start()}
              className="no-drag inline-flex items-center gap-2 px-4 py-2 rounded-md
                         border border-ink-900/30 dark:border-chalk/30
                         hover:border-ink-900 dark:hover:border-chalk
                         transition-all duration-200 ease-quart-out
                         font-display font-semibold text-[12.5px]
                         text-ink-900 dark:text-chalk bg-bone dark:bg-coal cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
