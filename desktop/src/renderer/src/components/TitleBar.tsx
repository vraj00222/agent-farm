import type { SessionMeta } from '@/types/agent'

interface TitleBarProps {
  meta: SessionMeta
  totals: { running: number; done: number; failed: number; queued: number }
}

/**
 * Top chrome. Asymmetric: brand on the left, session metadata typeset
 * inline on the right (no pills, no boxes). Drag region for the window.
 */
export function TitleBar({ meta, totals }: TitleBarProps) {
  return (
    <header
      className="drag flex items-center justify-between
                 bg-bone dark:bg-coal
                 border-b border-line dark:border-line-dark"
      style={{ height: 'var(--titlebar-h)', paddingLeft: 90, paddingRight: 16 }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display font-semibold text-[13px] tracking-tightest text-ink-900 dark:text-chalk">
          Agent Farm
        </span>
        <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          v{__APP_VERSION__}
        </span>
      </div>

      <div className="flex items-baseline gap-5 no-drag">
        <Field label="claude" value={meta.claudeVersion ?? 'unknown'} />
        <Field label="model" value={meta.model ?? 'default'} />
        <Field label="base" value={meta.baseSha.slice(0, 7)} mono />
        <Field label="repo" value={meta.repoName} />
        <span className="w-px h-3 bg-line dark:bg-line-dark" />
        <Counts totals={totals} />
      </div>
    </header>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
        {label}
      </span>
      <span
        className={
          'text-[11px] text-ink-800 dark:text-chalk ' +
          (mono ? 'font-mono' : 'font-medium')
        }
      >
        {value}
      </span>
    </div>
  )
}

function Counts({
  totals,
}: {
  totals: { running: number; done: number; failed: number; queued: number }
}) {
  return (
    <div className="flex items-baseline gap-3.5">
      {totals.running > 0 && <CountBit label="run" n={totals.running} pulse />}
      {totals.done > 0 && <CountBit label="done" n={totals.done} />}
      {totals.failed > 0 && <CountBit label="fail" n={totals.failed} fail />}
      {totals.queued > 0 && <CountBit label="que" n={totals.queued} muted />}
      {totals.running + totals.done + totals.failed + totals.queued === 0 && (
        <span className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle">
          idle
        </span>
      )}
    </div>
  )
}

function CountBit({
  label,
  n,
  pulse,
  fail,
  muted,
}: {
  label: string
  n: number
  pulse?: boolean
  fail?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
        {label}
      </span>
      <span
        className={
          'num text-[12px] font-semibold tabular-nums ' +
          (fail
            ? 'text-state-failed'
            : muted
              ? 'text-ink-400 dark:text-chalk-subtle'
              : 'text-ink-900 dark:text-chalk')
        }
      >
        {String(n).padStart(2, '0')}
      </span>
      {pulse && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-ink-900 dark:bg-chalk
                     animate-ring-ink dark:animate-ring-chalk"
        />
      )}
    </div>
  )
}

declare const __APP_VERSION__: string
