import clsx from 'clsx'
import type { Agent } from '@/types/agent'
import { fmtElapsed } from '@/lib/format'

interface AgentListProps {
  agents: Agent[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * Left rail — Linear-school: rounded selected pill, soft hover, animated
 * pulsing dot for running, vibrant accent on selected.
 */
export function AgentList({ agents, selectedId, onSelect }: AgentListProps) {
  if (agents.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="px-2 py-3">
      <SectionHeader count={agents.length} />
      <ul className="flex flex-col gap-1">
        {agents.map((agent, i) => (
          <li
            key={agent.id}
            className="animate-slideIn"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <Row
              agent={agent}
              selected={selectedId === agent.id}
              onClick={() => onSelect(agent.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between px-3 pt-1 pb-3">
      <span className="label">Sessions</span>
      <span className="text-[11px] text-ink-subtle dark:text-ink-dark-subtle font-mono tabular-nums">
        {count}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-2 px-3 pb-3">
        <span className="label">Sessions</span>
        <span className="text-[11px] text-ink-subtle font-mono">0</span>
      </div>
      <div className="card p-4">
        <h3 className="font-display font-medium text-base text-ink dark:text-ink-dark">
          No sessions yet
        </h3>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-dark-muted leading-relaxed">
          Type a task in the bar below. It spawns claude in an isolated worktree.
        </p>
      </div>
    </div>
  )
}

function Row({
  agent,
  selected,
  onClick,
}: {
  agent: Agent
  selected: boolean
  onClick: () => void
}) {
  const isRunning = agent.state === 'running'

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-2.5 rounded-md transition-all duration-150 no-drag',
        'group relative',
        selected
          ? 'bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/30 shadow-sm'
          : 'hover:bg-surface-raised dark:hover:bg-surface-dark-raised'
      )}
    >
      {/* Active indicator bar on the left when selected */}
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
      )}

      <div className="flex items-start gap-3">
        <div className="pt-1.5">
          <StateGlyph state={agent.state} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={clsx(
                'font-display font-medium text-[13.5px] truncate',
                selected ? 'text-accent dark:text-accent-300' : 'text-ink dark:text-ink-dark'
              )}
            >
              {agent.id}
            </span>
            <ElapsedBadge agent={agent} />
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
              {labelFor(agent)}
            </span>
            {isRunning && agent.pid && (
              <>
                <span className="text-ink-subtle">·</span>
                <span className="font-mono text-[10.5px] text-ink-subtle dark:text-ink-dark-subtle">
                  pid {agent.pid}
                </span>
              </>
            )}
          </div>

          {(agent.commits.length > 0 || agent.usage?.cost != null) && (
            <div className="mt-2 flex items-center gap-2">
              {agent.commits.length > 0 && (
                <Pill
                  label={`${agent.commits.length}c · ${agent.filesChanged.length}f`}
                />
              )}
              {agent.usage?.cost != null && (
                <Pill label={`$${agent.usage.cost.toFixed(3)}`} mono />
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function ElapsedBadge({ agent }: { agent: Agent }) {
  if (agent.state === 'queued') {
    return <span className="text-[11px] text-ink-subtle">—</span>
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
        'numeral text-[11px] font-mono',
        agent.state === 'running'
          ? 'text-accent dark:text-accent-300'
          : 'text-ink-muted dark:text-ink-dark-muted'
      )}
    >
      {fmtElapsed(ms)}
    </span>
  )
}

function Pill({ label, mono }: { label: string; mono?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-1.5 py-0.5 rounded',
        'bg-surface-sunk dark:bg-surface-dark-sunk',
        'border border-border dark:border-border-dark',
        'text-[10.5px] text-ink-muted dark:text-ink-dark-muted',
        mono && 'font-mono tabular-nums'
      )}
    >
      {label}
    </span>
  )
}

function StateGlyph({ state }: { state: Agent['state'] }) {
  if (state === 'running') return <span className="dot-active" />
  if (state === 'done') return <span className="dot-done" />
  if (state === 'failed') return <span className="dot-failed" />
  if (state === 'noop') return <span className="dot-noop" />
  return <span className="dot-idle" />
}

function labelFor(agent: Agent): string {
  if (agent.state === 'queued') return 'Queued'
  if (agent.state === 'running') return 'Running'
  if (agent.state === 'done') return 'Done'
  if (agent.state === 'noop') return 'No changes'
  if (agent.state === 'failed') return agent.error || 'Failed'
  return agent.state
}
