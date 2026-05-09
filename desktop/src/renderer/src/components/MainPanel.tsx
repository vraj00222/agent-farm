import clsx from 'clsx'
import type { Agent } from '@/types/agent'
import { fmtElapsed, fmtTokens } from '@/lib/format'

interface MainPanelProps {
  agent: Agent | null
}

/**
 * Right pane — modern Mac-app feel. Soft cards, layered depth, accent
 * gradient on the elapsed badge for the running agent. Event tail uses
 * Linear-style typography hierarchy.
 */
export function MainPanel({ agent }: MainPanelProps) {
  if (!agent) return <EmptyState />

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header agent={agent} />
      <div className="flex-1 overflow-y-auto px-7 py-5">
        <Tail agent={agent} />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col h-full justify-center items-center px-12 py-12">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                        bg-accent-gradient shadow-glow-lg mb-6">
          <Logo />
        </div>
        <h2 className="font-display font-semibold text-3xl text-ink dark:text-ink-dark">
          Spawn your first agent
        </h2>
        <p className="mt-3 text-base text-ink-muted dark:text-ink-dark-muted leading-relaxed">
          Type a task in the bar below. Agent Farm creates an isolated git worktree,
          spawns claude inside it, and shows you exactly what it does — step by step.
        </p>

        <div className="mt-10 grid grid-cols-3 gap-3">
          <Tile
            title="Isolated"
            body="A worktree per task. Claude can't touch your tree."
          />
          <Tile
            title="Parallel"
            body="Up to three at once. The rest queue smoothly."
          />
          <Tile
            title="Reviewable"
            body="See diffs, cherry-pick the wins, drop the rest."
          />
        </div>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      <span className="block w-5 h-[3px] rounded-full bg-white" />
      <span className="block w-5 h-[3px] rounded-full bg-white/70" />
      <span className="block w-5 h-[3px] rounded-full bg-white/40" />
    </div>
  )
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-3 text-left">
      <h4 className="font-display font-medium text-sm">{title}</h4>
      <p className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">
        {body}
      </p>
    </div>
  )
}

function Header({ agent }: { agent: Agent }) {
  return (
    <div className="px-7 pt-6 pb-5 border-b border-border dark:border-border-dark">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StateBadge state={agent.state} />
          </div>
          <h2 className="font-display font-semibold text-3xl tracking-tight text-ink dark:text-ink-dark mt-2 truncate">
            {agent.id}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-xs text-ink-subtle dark:text-ink-dark-subtle">
              {agent.branch}
            </span>
            <span className="text-ink-subtle">·</span>
            <span className="font-mono text-xs text-ink-subtle dark:text-ink-dark-subtle truncate">
              {agent.worktreePath}
            </span>
          </div>
        </div>
        <ElapsedBlock agent={agent} />
      </div>

      {agent.usage && agent.usage.cost != null && (
        <div className="mt-5 grid grid-cols-4 gap-2">
          <Stat label="Turns" value={String(agent.usage.numTurns ?? 0)} />
          <Stat label="Input" value={fmtTokens(agent.usage.inputTokens ?? 0)} />
          <Stat label="Output" value={fmtTokens(agent.usage.outputTokens ?? 0)} />
          <Stat label="Cost" value={`$${agent.usage.cost.toFixed(4)}`} highlight />
        </div>
      )}
    </div>
  )
}

function StateBadge({ state }: { state: Agent['state'] }) {
  const cfg = {
    queued: { color: 'bg-ink-subtle/15 text-ink-muted', label: 'Queued', dot: 'bg-ink-subtle' },
    running: { color: 'bg-accent/12 text-accent dark:text-accent-300', label: 'Running', dot: 'bg-accent animate-pulse' },
    done: { color: 'bg-success/12 text-success', label: 'Done', dot: 'bg-success' },
    noop: { color: 'bg-warn/12 text-warn', label: 'No changes', dot: 'bg-warn' },
    failed: { color: 'bg-danger/12 text-danger', label: 'Failed', dot: 'bg-danger' },
  }[state]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium',
        cfg.color
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function ElapsedBlock({ agent }: { agent: Agent }) {
  const value =
    agent.elapsedMs != null
      ? fmtElapsed(agent.elapsedMs)
      : agent.startedAt
        ? fmtElapsed(Date.now() - agent.startedAt)
        : '—'
  const isRunning = agent.state === 'running'
  return (
    <div
      className={clsx(
        'rounded-xl px-4 py-3 text-right shrink-0',
        isRunning
          ? 'bg-accent-gradient text-white shadow-glow'
          : 'bg-surface-raised dark:bg-surface-dark-raised border border-border dark:border-border-dark'
      )}
    >
      <p
        className={clsx(
          'text-2xs uppercase tracking-cap',
          isRunning ? 'text-white/70' : 'text-ink-muted dark:text-ink-dark-muted'
        )}
      >
        Elapsed
      </p>
      <p className="numeral text-2xl font-semibold mt-0.5">{value}</p>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={clsx(
        'rounded-md px-3 py-2',
        highlight
          ? 'bg-accent/8 dark:bg-accent/15 border border-accent/20'
          : 'bg-surface-raised dark:bg-surface-dark-raised border border-border dark:border-border-dark'
      )}
    >
      <p className="text-2xs uppercase tracking-cap text-ink-muted dark:text-ink-dark-muted">
        {label}
      </p>
      <p
        className={clsx(
          'numeral text-base font-semibold mt-0.5',
          highlight ? 'text-accent dark:text-accent-300' : 'text-ink dark:text-ink-dark'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Tail({ agent }: { agent: Agent }) {
  if (agent.lastLines.length === 0) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink-muted dark:text-ink-dark-muted">
        <span className="dot-active" />
        Waiting for first event…
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      {agent.lastLines.map((line, i) => (
        <EventLine key={i} line={line} />
      ))}
    </div>
  )
}

function EventLine({ line }: { line: string }) {
  if (line.startsWith('$ ')) {
    return (
      <p className="font-mono text-xs leading-relaxed text-ink dark:text-ink-dark">
        <span className="text-accent font-bold">$</span>
        <span className="ml-2">{line.slice(2)}</span>
      </p>
    )
  }
  if (line.startsWith('→ ')) {
    const rest = line.slice(2)
    const m = rest.match(/^(\S+)\s+(.*)$/)
    return (
      <p className="font-mono text-xs leading-relaxed">
        <span className="text-accent font-semibold">→</span>
        {m ? (
          <>
            <span className="ml-2 font-semibold text-ink dark:text-ink-dark">{m[1]}</span>
            <span className="ml-3 text-ink-muted dark:text-ink-dark-muted">{m[2]}</span>
          </>
        ) : (
          <span className="ml-2">{rest}</span>
        )}
      </p>
    )
  }
  if (line.startsWith('← ')) {
    return (
      <p className="font-mono text-xs leading-relaxed pl-5 text-ink-muted dark:text-ink-dark-muted">
        <span className="text-ink-subtle">←</span>
        <span className="ml-2">{line.slice(2)}</span>
      </p>
    )
  }
  if (line.startsWith('✓ ')) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md
                      bg-success/10 border border-success/20">
        <span className="text-success font-bold">✓</span>
        <span className="font-mono text-xs text-success font-medium">{line.slice(2)}</span>
      </div>
    )
  }
  if (line.startsWith('✗ ')) {
    return (
      <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md
                      bg-danger/10 border border-danger/20">
        <span className="text-danger font-bold">✗</span>
        <span className="font-mono text-xs text-danger">{line.slice(2)}</span>
      </div>
    )
  }
  if (line.startsWith('💭 ')) {
    return (
      <p className="font-mono text-xs italic text-ink-subtle dark:text-ink-dark-subtle leading-relaxed">
        {line}
      </p>
    )
  }
  return (
    <p className="font-display text-sm text-ink/85 dark:text-ink-dark/85 leading-relaxed py-1">
      {line}
    </p>
  )
}
