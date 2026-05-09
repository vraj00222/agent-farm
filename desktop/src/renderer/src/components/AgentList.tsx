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
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'row-base group flex items-start gap-3 rounded-md px-2.5 py-2.5',
        selected
          ? 'bg-ink-900 text-bone dark:bg-chalk dark:text-coal'
          : 'hover:bg-bone-raised dark:hover:bg-coal-raised'
      )}
    >
      <span
        className={clsx(
          'num w-6 pt-[3px] text-[10.5px] font-mono tabular-nums',
          selected
            ? 'text-bone/55 dark:text-coal/55'
            : 'text-ink-400 dark:text-chalk-subtle'
        )}
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              'font-display font-medium text-[13px] truncate transition-colors',
              selected
                ? 'text-bone dark:text-coal'
                : 'text-ink-900 dark:text-chalk group-hover:text-ink-900'
            )}
          >
            {agent.id}
          </span>
          <ElapsedTag agent={agent} selected={selected} />
        </div>

        <div className="mt-1 flex items-center gap-2">
          <StateGlyph state={agent.state} selected={selected} />
          <span
            className={clsx(
              'text-[11px]',
              selected
                ? 'text-bone/65 dark:text-coal/65'
                : 'text-ink-500 dark:text-chalk-dim'
            )}
          >
            {labelFor(agent)}
          </span>
        </div>

        {(agent.commits.length > 0 || agent.usage?.cost != null) && (
          <div className="mt-1.5 flex items-baseline gap-3 font-mono text-[10.5px]">
            {agent.commits.length > 0 && (
              <span
                className={clsx(
                  selected
                    ? 'text-bone/70 dark:text-coal/70'
                    : 'text-ink-500 dark:text-chalk-dim'
                )}
              >
                <b
                  className={clsx(
                    'tabular-nums',
                    selected
                      ? 'text-bone dark:text-coal'
                      : 'text-ink-900 dark:text-chalk'
                  )}
                >
                  {agent.commits.length}
                </b>
                <span className="ml-1">c</span>
                <span className="mx-1.5 opacity-40">·</span>
                <b
                  className={clsx(
                    'tabular-nums',
                    selected
                      ? 'text-bone dark:text-coal'
                      : 'text-ink-900 dark:text-chalk'
                  )}
                >
                  {agent.filesChanged.length}
                </b>
                <span className="ml-1">f</span>
              </span>
            )}
            {agent.usage?.cost != null && (
              <span
                className={clsx(
                  'tabular-nums',
                  selected
                    ? 'text-bone/55 dark:text-coal/55'
                    : 'text-ink-400 dark:text-chalk-subtle'
                )}
              >
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
    return (
      <span className={clsx('text-[10.5px] font-mono', selected ? 'text-bone/45' : 'text-ink-300')}>
        —
      </span>
    )
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
        selected
          ? 'text-bone/75 dark:text-coal/75'
          : 'text-ink-500 dark:text-chalk-dim'
      )}
    >
      {fmtElapsed(ms)}
    </span>
  )
}

function StateGlyph({ state, selected }: { state: Agent['state']; selected: boolean }) {
  if (state === 'running') {
    return (
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          selected
            ? 'bg-bone animate-ring-chalk'
            : 'bg-ink-900 dark:bg-chalk animate-ring-ink dark:animate-ring-chalk'
        )}
      />
    )
  }
  if (state === 'done') {
    return (
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          selected ? 'bg-bone' : 'bg-ink-700 dark:bg-chalk-dim'
        )}
      />
    )
  }
  if (state === 'failed') return <span className="w-1.5 h-1.5 rounded-full bg-state-failed" />
  if (state === 'noop')
    return (
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full border bg-transparent',
          selected ? 'border-bone' : 'border-ink-400 dark:border-chalk-subtle'
        )}
      />
    )
  return <span className={clsx('w-1.5 h-1.5 rounded-full', selected ? 'bg-bone/40' : 'bg-ink-200')} />
}

function labelFor(agent: Agent): string {
  if (agent.state === 'queued') return 'Queued'
  if (agent.state === 'running') return agent.pid ? `Running, pid ${agent.pid}` : 'Starting'
  if (agent.state === 'done') return 'Done'
  if (agent.state === 'noop') return 'No changes'
  if (agent.state === 'failed') return agent.error || 'Failed'
  return agent.state
}
