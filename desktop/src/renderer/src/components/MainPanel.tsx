import clsx from 'clsx'
import type { Agent } from '@/types/agent'
import { fmtElapsed, fmtTokens } from '@/lib/format'

interface MainPanelProps {
  agent: Agent | null
}

/**
 * Right pane. Pure tinted B/W. No hero-metric template (no big elapsed
 * gradient + 4-stat grid). Header is a single editorial line. Stats
 * sit inline as small typeset values, not boxed cards.
 */
export function MainPanel({ agent }: MainPanelProps) {
  if (!agent) return <EmptyState />

  return (
    <div key={agent.id} className="flex flex-col h-full overflow-hidden animate-fade-in">
      <Header agent={agent} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Tail agent={agent} />
      </div>
    </div>
  )
}

function EmptyState() {
  // Asymmetric. Not centered. Not a card grid.
  return (
    <div className="h-full flex flex-col justify-between px-10 py-10">
      <div>
        <p className="label">no session</p>
        <h2 className="font-display text-4xl font-medium tracking-tightest mt-3 max-w-[16ch] leading-[1.05] text-ink-900 dark:text-chalk">
          Type a task<br />in the bar below.
        </h2>
        <p className="mt-5 text-base text-ink-500 dark:text-chalk-dim leading-relaxed max-w-[42ch]">
          Each task spawns claude in a fresh git worktree. Up to three
          run at once; the rest queue automatically.
        </p>
      </div>

      {/* Inline numbered list, not a card grid */}
      <ol className="text-[12.5px] text-ink-500 dark:text-chalk-dim leading-relaxed max-w-[44ch] space-y-2.5">
        <li>
          <span className="font-mono text-[10.5px] mr-3 text-ink-400 dark:text-chalk-subtle">01</span>
          One prompt becomes one branch becomes one worktree.
        </li>
        <li>
          <span className="font-mono text-[10.5px] mr-3 text-ink-400 dark:text-chalk-subtle">02</span>
          Claude streams structured events back as it works.
        </li>
        <li>
          <span className="font-mono text-[10.5px] mr-3 text-ink-400 dark:text-chalk-subtle">03</span>
          Cherry-pick the wins. Drop the misses. Main branch stays clean.
        </li>
      </ol>
    </div>
  )
}

function Header({ agent }: { agent: Agent }) {
  return (
    <div className="px-8 pt-7 pb-5 border-b border-line dark:border-line-dark">
      <div className="flex items-baseline gap-3 mb-3">
        <StateGlyph state={agent.state} />
        <span className="label">{stateLabel(agent.state)}</span>
        <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          ·
        </span>
        <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          {agent.branch}
        </span>
      </div>

      <h2 className="font-display text-3xl font-semibold tracking-tightest text-ink-900 dark:text-chalk truncate">
        {agent.id}
      </h2>

      {/* Inline metadata row — typeset, not card grid */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-7 gap-y-2">
        <Metric label="elapsed" value={elapsedValue(agent)} accent={agent.state === 'running'} />
        {agent.usage?.numTurns != null && (
          <Metric label="turns" value={String(agent.usage.numTurns)} />
        )}
        {agent.usage?.inputTokens != null && (
          <Metric label="in" value={fmtTokens(agent.usage.inputTokens)} />
        )}
        {agent.usage?.outputTokens != null && (
          <Metric label="out" value={fmtTokens(agent.usage.outputTokens)} />
        )}
        {agent.usage?.cost != null && (
          <Metric label="cost" value={`$${agent.usage.cost.toFixed(4)}`} />
        )}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="label">{label}</span>
      <span
        className={clsx(
          'num text-base font-medium tabular-nums',
          accent ? 'text-ink-900 dark:text-chalk' : 'text-ink-700 dark:text-chalk-dim'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function elapsedValue(agent: Agent): string {
  if (agent.elapsedMs != null) return fmtElapsed(agent.elapsedMs)
  if (agent.startedAt) return fmtElapsed(Date.now() - agent.startedAt)
  return 'queued'
}

function stateLabel(state: Agent['state']): string {
  if (state === 'queued') return 'Queued'
  if (state === 'running') return 'Running'
  if (state === 'done') return 'Done'
  if (state === 'noop') return 'No changes'
  if (state === 'failed') return 'Failed'
  return state
}

function StateGlyph({ state }: { state: Agent['state'] }) {
  if (state === 'running') return <span className="dot-run" />
  if (state === 'done') return <span className="dot-done" />
  if (state === 'failed') return <span className="dot-failed" />
  if (state === 'noop') return <span className="dot-noop" />
  return <span className="dot-idle" />
}

function Tail({ agent }: { agent: Agent }) {
  if (agent.lastLines.length === 0) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-ink-400 dark:text-chalk-subtle">
        <span className="dot-run" />
        <span className="font-mono text-xs">waiting for first event</span>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {agent.lastLines.map((line, i) => (
        <EventLine key={i} line={line} />
      ))}
    </div>
  )
}

function EventLine({ line }: { line: string }) {
  if (line.startsWith('$ ')) {
    return (
      <p className="font-mono text-xs leading-relaxed text-ink-900 dark:text-chalk">
        <span className="text-ink-400 dark:text-chalk-subtle">$</span>
        <span className="ml-2">{line.slice(2)}</span>
      </p>
    )
  }
  if (line.startsWith('→ ')) {
    const rest = line.slice(2)
    const m = rest.match(/^(\S+)\s+(.*)$/)
    return (
      <p className="font-mono text-xs leading-relaxed">
        <span className="text-ink-400 dark:text-chalk-subtle">→</span>
        {m ? (
          <>
            <span className="ml-2 font-semibold text-ink-900 dark:text-chalk">{m[1]}</span>
            <span className="ml-3 text-ink-500 dark:text-chalk-dim">{m[2]}</span>
          </>
        ) : (
          <span className="ml-2">{rest}</span>
        )}
      </p>
    )
  }
  if (line.startsWith('← ')) {
    return (
      <p className="font-mono text-xs leading-relaxed pl-5 text-ink-500 dark:text-chalk-dim">
        <span className="text-ink-300 dark:text-chalk-subtle">←</span>
        <span className="ml-2">{line.slice(2)}</span>
      </p>
    )
  }
  if (line.startsWith('✓ ')) {
    return (
      <p className="font-mono text-xs leading-relaxed mt-3 text-ink-900 dark:text-chalk">
        <span className="font-bold">✓</span>
        <span className="ml-2 font-medium">{line.slice(2)}</span>
      </p>
    )
  }
  if (line.startsWith('✗ ')) {
    return (
      <p className="font-mono text-xs leading-relaxed text-state-failed">
        <span className="font-bold">✗</span>
        <span className="ml-2">{line.slice(2)}</span>
      </p>
    )
  }
  if (line.startsWith('💭 ')) {
    return (
      <p className="font-mono text-xs italic text-ink-400 dark:text-chalk-subtle leading-relaxed">
        {line}
      </p>
    )
  }
  return (
    <p className="font-display text-sm text-ink-800 dark:text-chalk leading-relaxed py-0.5">
      {line}
    </p>
  )
}
