import { useEffect, useRef, useState } from 'react'
import { EmbeddedTerminal } from './EmbeddedTerminal'

interface ClaudeLoginPanelProps {
  /** Absolute path to the `claude` binary, from claude.detect. */
  binaryPath: string
  /** Where to spawn the shell session. We use the user's home so the
   *  embedded session starts in a familiar place. */
  cwd: string
  /** Called when the user wants to abort or has finished. */
  onClose: () => void
  /** Called after the user signals "done" — parent should re-run detection
   *  and decide whether to dismiss the panel or keep it open. */
  onRecheck: () => Promise<void>
}

/**
 * Embedded `claude /login` flow.
 *
 * State machine (driven by sentinels in claude's stdout):
 *
 *   awaiting-prompt → write "/login\r" → awaiting-url
 *   awaiting-url    → shell.openExternal(url) → awaiting-success
 *   awaiting-success → send Ctrl-C → run onRecheck → close (or "needs attention")
 *
 * The old flow wrote /login\r blindly after a 600ms timer, which lost the
 * keystroke when the REPL banner was still rendering. We now wait for the
 * boxed input prompt to render before sending anything.
 *
 * Escape hatch: "Open in Terminal.app" runs the flow in a real terminal and
 * watches ~/.claude.json mtime via repeated recheck.
 */

// Match the framed `│ > ` line claude renders once its REPL accepts input.
// We accept any leading whitespace + the box-drawing character + space.
const PROMPT_SENTINEL = /[│|]\s+>\s/
// Anthropic OAuth URLs. We deliberately don't try to extract the full URL —
// claude wraps long URLs across lines. Instead we detect the prefix in the
// merged buffer and consume up to the next whitespace.
const URL_REGEX =
  /(https?:\/\/(?:console\.anthropic\.com|claude\.ai)\/[^\s]+)/i
// Strings claude prints once authentication completes. Match a few variants
// because the exact wording changes between claude versions.
const SUCCESS_SENTINEL =
  /(Logged in|Successfully (?:authenticated|signed in)|You (?:can|may) close this terminal|Login successful)/i

type Phase =
  | 'awaiting-prompt' // pty just spawned; waiting for `│ >` to appear
  | 'awaiting-url'    // /login sent; waiting for the OAuth URL
  | 'awaiting-success' // URL opened; waiting for "Logged in" sentinel
  | 'verifying'       // Ctrl-C sent; running onRecheck
  | 'failed'          // claude exited or sentinel never fired

export function ClaudeLoginPanel({
  binaryPath,
  cwd,
  onClose,
  onRecheck,
}: ClaudeLoginPanelProps) {
  const [phase, setPhase] = useState<Phase>('awaiting-prompt')
  const [exited, setExited] = useState<{ exitCode: number | null } | null>(null)
  // Buffer of output, stripped of ANSI for sentinel matching. Cap at 16KB so
  // long-running sessions don't grow unbounded.
  const bufferRef = useRef('')
  const sessionIdRef = useRef<string | null>(null)
  const phaseRef = useRef<Phase>(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const advance = (next: Phase) => {
    setPhase(next)
    phaseRef.current = next
  }

  const handleOutput = (chunk: string) => {
    // Append to buffer with ANSI escapes stripped — sentinels are easier to
    // match against plain text.
    const plain = stripAnsi(chunk)
    const buf = (bufferRef.current + plain).slice(-16_384)
    bufferRef.current = buf

    if (phaseRef.current === 'awaiting-prompt' && PROMPT_SENTINEL.test(buf)) {
      // Reset buffer so the URL regex doesn't match against banner text.
      bufferRef.current = ''
      advance('awaiting-url')
      const id = sessionIdRef.current
      if (id) void window.agentFarm?.pty.write(id, '/login\r')
      return
    }

    if (phaseRef.current === 'awaiting-url') {
      const m = buf.match(URL_REGEX)
      if (m) {
        const url = m[1]
        // Don't re-trigger if the same URL appears again.
        bufferRef.current = ''
        advance('awaiting-success')
        void window.agentFarm?.openExternal(url)
        return
      }
    }

    if (phaseRef.current === 'awaiting-success' && SUCCESS_SENTINEL.test(buf)) {
      bufferRef.current = ''
      advance('verifying')
      const id = sessionIdRef.current
      // \x03 = Ctrl-C; tells the REPL to exit cleanly so it flushes to disk.
      if (id) void window.agentFarm?.pty.write(id, '\x03')
      // Give claude ~1.5s to write ~/.claude.json before we re-detect.
      setTimeout(() => {
        void onRecheck()
      }, 1500)
    }
  }

  const handleSession = (id: string) => {
    sessionIdRef.current = id
  }

  // Keyboard escape hatches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void onRecheck()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, onRecheck])

  // If we're stuck awaiting-prompt for 8s, surface the escape hatch more
  // prominently. The prompt sentinel might not match for users with custom
  // claude config or older CLI versions.
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    if (phase !== 'awaiting-prompt') return
    const id = setTimeout(() => setStuck(true), 8_000)
    return () => clearTimeout(id)
  }, [phase])

  const handleOpenInTerminal = async () => {
    const res = await window.agentFarm?.claude.openLoginInTerminal()
    if (res?.ok) {
      // We can't watch ~/.claude.json from the renderer, so the user clicks
      // "Done — recheck" when they're back. Same flow, but they own the term.
      advance('awaiting-success')
    }
  }

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
            Sign in to Claude
          </span>
          <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle truncate">
            {binaryPath}
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
          <button
            type="button"
            disabled={phase === 'verifying'}
            onClick={() => void onRecheck()}
            onMouseDown={(e) => e.preventDefault()}
            className="no-drag px-3 py-1.5 rounded-md font-display font-semibold text-[12px]
                       border border-ink-900/30 dark:border-chalk/30
                       text-ink-900 dark:text-chalk
                       hover:border-ink-900 dark:hover:border-chalk
                       hover:-translate-y-px hover:shadow-sm
                       active:translate-y-0
                       transition-all duration-150
                       disabled:opacity-60 cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {phase === 'verifying' ? 'Checking…' : (
              <>
                Done — recheck{' '}
                <kbd className="ml-1 font-mono text-[10px] opacity-60">⌘↵</kbd>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="px-5 py-2 border-b border-line dark:border-line-dark flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-ink-500 dark:text-chalk-dim">
          {exited
            ? `claude exited (code ${exited.exitCode ?? '?'}). Click "Done — recheck" or press Esc to close.`
            : statusLine(phase)}
        </p>
        {(stuck || phase === 'failed') && (
          <button
            type="button"
            onClick={() => void handleOpenInTerminal()}
            className="no-drag px-2.5 py-1 rounded font-display text-[11px]
                       border border-line dark:border-line-dark
                       text-ink-700 dark:text-chalk-dim
                       hover:border-ink-500 dark:hover:border-chalk-dim
                       hover:text-ink-900 dark:hover:text-chalk
                       transition-all duration-150 cursor-pointer whitespace-nowrap"
          >
            Open in Terminal.app
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 p-3">
        <EmbeddedTerminal
          spawn={{
            command: binaryPath,
            args: [],
            cwd,
            cols: 100,
            rows: 28,
          }}
          onSession={handleSession}
          onOutput={handleOutput}
          onExit={(exitCode) => {
            setExited({ exitCode })
            if (phaseRef.current !== 'verifying') advance('failed')
          }}
        />
      </div>
    </div>
  )
}

function statusLine(phase: Phase): string {
  switch (phase) {
    case 'awaiting-prompt':
      return 'Waiting for the claude prompt to appear…'
    case 'awaiting-url':
      return 'Sent /login — waiting for the sign-in URL…'
    case 'awaiting-success':
      return 'Browser opened. Complete sign-in there; I’ll detect it automatically.'
    case 'verifying':
      return 'Sign-in detected — verifying with claude…'
    case 'failed':
      return 'Something went wrong. Try "Open in Terminal.app" or press Esc to cancel.'
  }
}

/** Cheap ANSI strip. Drops CSI/OSC sequences which are the only things the
 *  claude REPL emits that would confuse our text-based sentinels. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\][^]*/g, '')
}
