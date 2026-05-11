import clsx from 'clsx'
import type { Agent } from '@/types/agent'
import { fmtElapsed } from '@/lib/format'

interface AgentListProps {
  agents: Agent[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * Side panel. Pure tinted B/W. Selected row uses a full background tint
 * (no banned side-stripe). Hover lifts the row with a subtle bg shift.
 * Numbered index sits left for visual rhythm without being a card grid.
 */
export function AgentList({ agents, selectedId, onSelect }: AgentListProps) {
  if (agents.length === 0) return <EmptyState />

  return (
    <div className="px-3 py-3">
      <div className="flex items-baseline justify-between px-2 pt-1 pb-3">
        <span className="label">Sessions</span>
        <span className="font-mono text-[10.5px] tabular-nums text-ink-400 dark:text-chalk-subtle">
          {String(agents.length).padStart(2, '0')}
        </span>
      </div>
      <ul className="flex flex-col gap-px">
        {agents.map((agent, i) => (
          <li
            key={agent.id}
            className="animate-rise"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <Row
              agent={agent}
              index={i + 1}
              selected={selectedId === agent.id}
              onClick={() => onSelect(agent.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col px-5 pt-8">
      <span className="label">Sessions</span>
      <p className="mt-3 text-[13px] text-ink-500 dark:text-chalk-dim leading-relaxed max-w-[16rem]">
        No sessions yet. Type a task in the bar below. Each task spawns
        claude in an isolated worktree.
      </p>
    </div>
  )
}

function Row({
  agent,
  index,
  selected,
  onClick,
}: {
  agent: Agent
  index: number
  selected: boolean
  onClick: () => void
}) {
  // Selected = subtle bg tint + bolder weight on the title.
  // No full color inversion, no side-stripe (banned).
  // The row itself stays in the canvas's color world.
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'row-base group flex items-start gap-3 rounded-md px-2.5 py-2.5',
        selected
          ? 'bg-ink-900/[0.05] dark:bg-chalk/[0.07]'
          : 'hover:bg-ink-900/[0.025] dark:hover:bg-chalk/[0.04]'
      )}
    >
      <span
        className={clsx(
          'num w-6 pt-[3px] text-[10.5px] font-mono tabular-nums transition-colors',
          selected ? 'text-ink-700 dark:text-chalk-dim' : 'text-ink-400 dark:text-chalk-subtle'
        )}
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              'font-display text-[13px] truncate transition-all duration-150',
              selected
                ? 'font-semibold text-ink-900 dark:text-chalk'
                : 'font-semibold text-ink-700 dark:text-chalk-dim group-hover:text-ink-900 dark:group-hover:text-chalk'
            )}
            title={agent.prompt}
          >
            {agent.name || agent.slug || agent.id}
          </span>
          <ElapsedTag agent={agent} selected={selected} />
        </div>

        <div className="mt-1 flex items-center gap-2 min-w-0">
          <StateDot state={agent.state} />
          <BranchTag branch={agent.branch} selected={selected} />
          <span
            className={clsx(
              'text-[11px] shrink-0',
              selected ? 'text-ink-600 dark:text-chalk-dim' : 'text-ink-500 dark:text-chalk-dim'
            )}
          >
            {labelFor(agent)}
          </span>
        </div>

        {(agent.commits.length > 0 || agent.usage?.cost != null) && (
          <div className="mt-1.5 flex items-baseline gap-3 font-mono text-[10.5px]">
            {agent.commits.length > 0 && (
              <span className="text-ink-500 dark:text-chalk-dim">
                <b className="tabular-nums text-ink-900 dark:text-chalk">
                  {agent.commits.length}
                </b>
                <span className="ml-1">c</span>
                <span className="mx-1.5 opacity-40">·</span>
                <b className="tabular-nums text-ink-900 dark:text-chalk">
                  {agent.filesChanged.length}
                </b>
                <span className="ml-1">f</span>
              </span>
            )}
            {agent.usage?.cost != null && (
              <span className="tabular-nums text-ink-400 dark:text-chalk-subtle">
                ${agent.usage.cost.toFixed(3)}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

function ElapsedTag({ agent, selected }: { agent: Agent; selected: boolean }) {
  if (agent.state === 'queued') {
    return <span className="text-[10.5px] font-mono text-ink-300 dark:text-chalk-subtle">—</span>
  }
  const ms =
    agent.elapsedMs != null
      ? agent.elapsedMs
      : agent.startedAt
        ? Date.now() - agent.startedAt
        : 0
  return (
    <span
      className={clsx(
        'num text-[10.5px] font-mono tabular-nums',
        selected ? 'text-ink-700 dark:text-chalk' : 'text-ink-500 dark:text-chalk-dim'
      )}
    >
      {fmtElapsed(ms)}
    </span>
  )
}

function StateDot({ state }: { state: Agent['state'] }) {
  // Green for done, red for failed, animated for running. Tinted gray for
  // queued / noop so they don't compete visually.
  const base = 'inline-block w-2 h-2 rounded-full shrink-0'
  if (state === 'running') {
    return (
      <span
        className={clsx(base, 'bg-ink-900 dark:bg-chalk animate-ring-ink dark:animate-ring-chalk')}
        aria-label="running"
      />
    )
  }
  if (state === 'done') {
    return (
      <span
        className={clsx(base, 'bg-emerald-600 dark:bg-emerald-400')}
        aria-label="done"
      />
    )
  }
  if (state === 'failed') {
    return <span className={clsx(base, 'bg-state-failed')} aria-label="failed" />
  }
  if (state === 'noop') {
    return <span className={clsx(base, 'bg-ink-300 dark:bg-chalk-subtle')} aria-label="no changes" />
  }
  return <span className={clsx(base, 'bg-ink-200 dark:bg-coal-raised')} aria-label="queued" />
}

function BranchTag({ branch, selected }: { branch: string; selected: boolean }) {
  return (
    <span
      title={branch}
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] min-w-0 max-w-[12rem]',
        'border border-line/70 dark:border-line-dark',
        selected
          ? 'text-ink-800 dark:text-chalk'
          : 'text-ink-500 dark:text-chalk-dim',
      )}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden className="shrink-0">
        <circle cx="3" cy="3" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="3" cy="9" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="9" cy="6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 4.6 V7.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 6 C3 4 5 4 7.4 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="truncate">{branch}</span>
    </span>
  )
}

function labelFor(agent: Agent): string {
  if (agent.state === 'queued') return 'Queued'
  if (agent.state === 'running') return agent.pid ? `Running, pid ${agent.pid}` : 'Starting'
  if (agent.state === 'done') return 'Done'
  if (agent.state === 'noop') return 'No changes'
  if (agent.state === 'failed') return agent.error || 'Failed'
  return agent.state
}
