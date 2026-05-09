import type { SessionMeta } from '@/types/agent'

interface TitleBarProps {
  meta: SessionMeta
  totals: { running: number; done: number; failed: number; queued: number }
}

/**
 * Top chrome — drag region for the window. Brand wordmark + logo mark
 * left, session metadata + counts right. Tightly packed but breathable.
 */
export function TitleBar({ meta, totals }: TitleBarProps) {
  return (
    <header
      className="drag flex items-center justify-between
                 bg-bg/80 dark:bg-bg-dark/80
                 backdrop-blur-xl
                 border-b border-border dark:border-border-dark"
      style={{ height: 'var(--titlebar-height)', paddingLeft: 96, paddingRight: 14 }}
    >
      <div className="flex items-center gap-2">
        <Mark />
        <span className="font-display font-semibold text-[14px] tracking-tight">
          Agent Farm
        </span>
        <span className="ml-1 text-[11px] text-ink-subtle dark:text-ink-dark-subtle font-mono">
          v{__APP_VERSION__}
        </span>
      </div>

      <div className="flex items-center gap-2 no-drag">
        <MetaPill label="claude" value={meta.claudeVersion ?? '—'} />
        <MetaPill label="model" value={meta.model ?? 'default'} />
        <MetaPill label="base" value={meta.baseSha.slice(0, 7)} mono />
        <MetaPill label="repo" value={meta.repoName} />
        <div className="w-px h-4 bg-border dark:bg-border-dark mx-1" />
        <Counter label="running" count={totals.running} accent />
        <Counter label="done" count={totals.done} success />
        {totals.failed > 0 && <Counter label="failed" count={totals.failed} danger />}
      </div>
    </header>
  )
}

function Mark() {
  // Three stacked rectangles — visual stand-in for parallel agents.
  return (
    <div className="flex flex-col gap-[2px]" aria-hidden="true">
      <div className="w-[10px] h-[2.5px] rounded-full bg-accent" />
      <div className="w-[10px] h-[2.5px] rounded-full bg-accent/70" />
      <div className="w-[10px] h-[2.5px] rounded-full bg-accent/40" />
    </div>
  )
}

function MetaPill({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md
                    bg-surface-raised dark:bg-surface-dark-raised
                    border border-border dark:border-border-dark">
      <span className="text-[10px] uppercase tracking-cap text-ink-subtle dark:text-ink-dark-subtle">
        {label}
      </span>
      <span className={`text-[11px] text-ink dark:text-ink-dark ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function Counter({
  label,
  count,
  accent,
  success,
  danger,
}: {
  label: string
  count: number
  accent?: boolean
  success?: boolean
  danger?: boolean
}) {
  const color = danger
    ? 'text-danger'
    : accent && count > 0
      ? 'text-accent'
      : success
        ? 'text-success'
        : 'text-ink dark:text-ink-dark'
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md">
      <span className="text-[10px] uppercase tracking-cap text-ink-subtle dark:text-ink-dark-subtle">
        {label}
      </span>
      <span className={`numeral text-[12.5px] font-semibold ${color}`}>
        {String(count).padStart(2, '0')}
      </span>
    </div>
  )
}

declare const __APP_VERSION__: string
