import { useRef } from 'react'
import clsx from 'clsx'
import type { Agent } from '@/types/agent'
import { fmtElapsed, fmtTokens } from '@/lib/format'
import { EmbeddedTerminal } from './EmbeddedTerminal'

interface MainPanelProps {
  agent: Agent | null
  /** Used to spawn the project-level interactive claude when no agent is
   *  selected. Falsy values fall back to the old typographic empty state. */
  projectPath: string | null
  claudeBinary: string | null
}

/**
 * Middle pane.
 *   - Agent selected → header + that agent's streamed output.
 *   - No agent + claude available → live interactive `claude` shell at the
 *     project root (the actual product surface).
 *   - No claude / no project → typographic fallback.
 */
export function MainPanel({ agent, projectPath, claudeBinary }: MainPanelProps) {
  if (agent) {
    return (
      <div key={agent.id} className="flex flex-col h-full overflow-hidden animate-fade-in">
        <Header agent={agent} />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <Tail agent={agent} />
        </div>
      </div>
    )
  }

  if (projectPath && claudeBinary) {
    return <CenterTerminal projectPath={projectPath} claudeBinary={claudeBinary} />
  }

  return <FallbackEmpty />
}

function CenterTerminal({
  projectPath,
  claudeBinary,
}: {
  projectPath: string
  claudeBinary: string
}) {
  // Track the active pty session so we can auto-handle the startup dialogs.
  const sessionIdRef = useRef<string | null>(null)
  // Two independent dialogs may appear at session start in any combination:
  //   1. Settings Error — when a repo has a malformed `.claude/settings.json`
  //      or `.claude/settings.local.json`. Default focus is "Exit and fix
  //      manually" which kills claude. We need to navigate to option 2
  //      ("Continue without these settings") and submit.
  //   2. Bypass Permissions mode — shown once per session when run with
  //      --dangerously-skip-permissions. Default focus is "Yes, I accept",
  //      so a bare Enter accepts.
  const settingsHandledRef = useRef(false)
  const bypassHandledRef = useRef(false)
  // Rolling buffer of recent output; dialogs render in chunks so we match
  // against the concatenation, not individual chunks.
  const bufferRef = useRef('')
  // Total bytes streamed since spawn. Both dialogs are always at session
  // start; past a few KB we stop matching entirely so claude's task output
  // can't false-positive into a spurious keypress (which would submit empty
  // or interrupt mid-generation).
  const bytesSeenRef = useRef(0)

  const handleOutput = (chunk: string) => {
    // Once both dialogs handled (or we've moved past the window), stop work.
    if (settingsHandledRef.current && bypassHandledRef.current) return
    bytesSeenRef.current += chunk.length
    if (bytesSeenRef.current > 8192) {
      settingsHandledRef.current = true
      bypassHandledRef.current = true
      bufferRef.current = ''
      return
    }
    bufferRef.current = (bufferRef.current + chunk).slice(-8192)
    const id = sessionIdRef.current
    if (!id) return

    // Settings Error: unique phrases that only appear in this dialog. Send
    // Down arrow (\x1b[B) to move focus from "Exit" to "Continue", then \r.
    if (
      !settingsHandledRef.current &&
      /Settings Error/i.test(bufferRef.current) &&
      /Continue without these settings/i.test(bufferRef.current)
    ) {
      settingsHandledRef.current = true
      bufferRef.current = ''
      void window.agentFarm?.pty.write(id, '\x1b[B\r')
      return
    }

    // Bypass Permissions: unique phrases. Default focus is on "Yes, I accept"
    // (option 2). A bare \r submits it.
    if (
      !bypassHandledRef.current &&
      /responsibility for actions/i.test(bufferRef.current) &&
      /Yes,\s*I\s*accept/i.test(bufferRef.current)
    ) {
      bypassHandledRef.current = true
      bufferRef.current = ''
      void window.agentFarm?.pty.write(id, '\r')
      return
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-line dark:border-line-dark">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="label">claude</span>
          <span className="font-mono text-[11px] text-ink-500 dark:text-chalk-dim truncate">
            interactive · {projectPath}
          </span>
        </div>
        <span className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle shrink-0">
          spawn a task below to run one in an isolated worktree
        </span>
      </div>
      <div className="flex-1 min-h-0 p-2 bg-bone dark:bg-coal">
        <EmbeddedTerminal
          key={projectPath}
          spawn={{
            command: claudeBinary,
            args: ['--dangerously-skip-permissions', '--setting-sources', 'project,local'],
            cwd: projectPath,
            cols: 100,
            rows: 28,
          }}
          onSession={(id) => {
            sessionIdRef.current = id
            // Reset per session — each spawn may show each dialog once.
            settingsHandledRef.current = false
            bypassHandledRef.current = false
            bufferRef.current = ''
            bytesSeenRef.current = 0
          }}
          onOutput={handleOutput}
        />
      </div>
    </div>
  )
}

function FallbackEmpty() {
  return (
    <div className="h-full flex flex-col justify-between px-10 py-10">
      <div>
        <p className="label">no session</p>
        <h2 className="font-display text-4xl font-medium tracking-tightest mt-3 max-w-[16ch] leading-[1.05] text-ink-900 dark:text-chalk">
          Open a project<br />or sign in to claude.
        </h2>
        <p className="mt-5 text-base text-ink-500 dark:text-chalk-dim leading-relaxed max-w-[42ch]">
          Once both are set up, this pane becomes an interactive claude
          shell in the project root.
        </p>
      </div>
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

      <h2
        className="font-display text-3xl font-semibold tracking-tightest text-ink-900 dark:text-chalk"
        title={agent.prompt}
      >
        {agent.name || agent.slug || agent.id}
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
  const base = 'inline-block w-2 h-2 rounded-full shrink-0'
  if (state === 'running') {
    return <span className={clsx(base, 'bg-ink-900 dark:bg-chalk animate-ring-ink dark:animate-ring-chalk')} />
  }
  if (state === 'done') return <span className={clsx(base, 'bg-emerald-600 dark:bg-emerald-400')} />
  if (state === 'failed') return <span className={clsx(base, 'bg-state-failed')} />
  if (state === 'noop') return <span className={clsx(base, 'bg-ink-300 dark:bg-chalk-subtle')} />
  return <span className={clsx(base, 'bg-ink-200 dark:bg-coal-raised')} />
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
