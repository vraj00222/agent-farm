import { useState } from 'react'
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
 * Embedded `claude /login` flow. Spawns the claude REPL, auto-types `/login`,
 * lets the user complete the OAuth handshake in their browser, paste the code
 * back here, and then ask us to re-check.
 */
export function ClaudeLoginPanel({
  binaryPath,
  cwd,
  onClose,
  onRecheck,
}: ClaudeLoginPanelProps) {
  const [exited, setExited] = useState<{ exitCode: number | null } | null>(null)
  const [rechecking, setRechecking] = useState(false)

  return (
    <div
      className="no-drag absolute inset-x-0 bottom-0 z-30 flex flex-col bg-bone dark:bg-coal"
      style={{ top: 'var(--titlebar-h)' }}
    >
      <div
        className="flex items-center justify-between gap-4 px-5 py-3
                   border-b border-line dark:border-line-dark"
      >
        <div className="flex items-baseline gap-3">
          <span
            className="font-display font-semibold text-[14px] tracking-tightest
                       text-ink-900 dark:text-chalk"
          >
            Sign in to Claude
          </span>
          <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
            {binaryPath}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md font-display text-[12px]
                       border border-line dark:border-line-dark
                       text-ink-700 dark:text-chalk-dim
                       hover:border-ink-500 dark:hover:border-chalk-dim
                       hover:text-ink-900 dark:hover:text-chalk
                       transition-all duration-150"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={rechecking}
            onClick={async () => {
              setRechecking(true)
              try {
                await onRecheck()
              } finally {
                setRechecking(false)
              }
            }}
            className="px-3 py-1.5 rounded-md font-display font-semibold text-[12px]
                       border border-ink-900/30 dark:border-chalk/30
                       text-ink-900 dark:text-chalk
                       hover:border-ink-900 dark:hover:border-chalk
                       hover:-translate-y-px hover:shadow-sm
                       active:translate-y-0
                       transition-all duration-150
                       disabled:opacity-60"
          >
            {rechecking ? 'Checking…' : 'Done — recheck'}
          </button>
        </div>
      </div>

      <div className="px-5 py-2 border-b border-line dark:border-line-dark">
        <p className="font-mono text-[11px] text-ink-500 dark:text-chalk-dim">
          {exited
            ? `claude exited (code ${exited.exitCode ?? '?'}). Click "Done — recheck" to update auth state, or Cancel to close.`
            : 'A browser tab will open. Complete sign-in there, paste the code back into this terminal, then click "Done — recheck".'}
        </p>
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
          initialInput={'/login\r'}
          onExit={(exitCode) => setExited({ exitCode })}
        />
      </div>
    </div>
  )
}
