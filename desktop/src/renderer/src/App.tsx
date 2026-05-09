import { useMemo, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { AgentList } from './components/AgentList'
import { MainPanel } from './components/MainPanel'
import { PromptBar } from './components/PromptBar'
import { StatusStrip } from './components/StatusStrip'
import { WelcomeScreen } from './components/WelcomeScreen'
import type { Agent, SessionMeta } from './types/agent'

declare global {
  interface Window {
    agentFarm?: {
      platform: string
      arch: string
      versions: { node: string; chrome: string; electron: string }
    }
  }
}

const SAMPLE_META: SessionMeta = {
  baseSha: '94f83c8f12a4d1e9b3c2a8f4d6e1c5b9a2f8e7d1',
  repoName: '404museum',
  claudeVersion: '2.1.132',
  model: null,
}

// Sample agents seeded only when the user picks "Quick start" — proves the
// design language end-to-end without requiring a real project to be loaded.
const SAMPLE_AGENTS: Agent[] = [
  {
    id: 'teach-me-how-use',
    branch: 'agent/teach-me-how-use',
    worktreePath: '/Users/v/Developer/404museum-teach-me-how-use',
    prompt: 'teach me how to use this codebase',
    state: 'running',
    startedAt: Date.now() - 105_000,
    endedAt: null,
    elapsedMs: null,
    exitCode: null,
    pid: 14975,
    commits: [],
    filesChanged: [],
    autoCommitted: false,
    lastLines: [
      '$ claude -p --dangerously-skip-permissions "teach me how to use this codebase"',
      'worktree: /Users/v/Developer/404museum-teach-me-how-use',
      'session started (claude-opus-4-7)',
      '→ Read    /Users/v/Developer/404museum-teach-me-how-use/package.json',
      '← 1   { ... (+9 lines)',
      '→ Read    /Users/v/Developer/404museum-teach-me-how-use/vercel.json',
      '← 1   { ... (+5 lines)',
      '→ Read    /Users/v/Developer/404museum-teach-me-how-use/src/index.ts',
      '← 1   // 404 Museum, Main entry point ... (+617 lines)',
      '→ Glob    src/**/*.ts',
    ],
    usage: null,
  },
  {
    id: 'create-foo-md-file',
    branch: 'agent/create-foo-md-file',
    worktreePath: '/Users/v/Developer/404museum-create-foo-md-file',
    prompt: 'create a foo.md with two lines about legos',
    state: 'done',
    startedAt: Date.now() - 12_700,
    endedAt: Date.now() - 0,
    elapsedMs: 12_700,
    exitCode: 0,
    pid: 14201,
    commits: ['058aaec docs: add foo.md with a short note on legos'],
    filesChanged: ['foo.md'],
    autoCommitted: false,
    lastLines: [
      '$ claude -p --dangerously-skip-permissions "create a foo.md with two lines about legos"',
      'worktree: /Users/v/Developer/404museum-create-foo-md-file',
      'session started (claude-opus-4-7)',
      '→ Write   /Users/v/Developer/404museum-create-foo-md-file/foo.md',
      '← File created successfully',
      '→ Bash    $ git add -A && git commit -m "docs: add foo.md with a short note on le…',
      '← [agent/create-foo-md-file 058aaec] docs: add foo.md with a short note... (+2 lines)',
      'Created foo.md with two lines about legos and committed as 058aaec on agent/create-foo-md-file.',
      '✓ 3 turns · 120.3K in / 469 out · $0.1954 · 10.8s',
      'done in 12.7s · 1 commit · 1 file',
    ],
    usage: {
      cost: 0.1954,
      inputTokens: 120_300,
      outputTokens: 469,
      numTurns: 3,
    },
  },
]

type AppView =
  | { kind: 'welcome' }
  | { kind: 'session'; meta: SessionMeta; agents: Agent[]; selectedId: string | null }

export function App() {
  const [view, setView] = useState<AppView>({ kind: 'welcome' })

  const platform = window.agentFarm?.platform ?? 'browser'

  // ── Welcome screen ───────────────────────────────────────────────
  if (view.kind === 'welcome') {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-bone dark:bg-coal">
        <header
          className="drag flex items-center justify-end
                     bg-bone dark:bg-coal
                     border-b border-line dark:border-line-dark px-4"
          style={{ height: 'var(--titlebar-h)', paddingLeft: 90 }}
        >
          <span className="font-mono text-[10px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
            agent farm  ·  v{__APP_VERSION__}
          </span>
        </header>

        <main className="flex-1 overflow-hidden">
          <WelcomeScreen
            onOpenLocal={() => {
              // TODO: wire to main process: dialog.showOpenDialog
              alert('Open project: file picker arrives once IPC lands.')
            }}
            onOpenGitHub={() => {
              // TODO: wire to main process: clone modal
              alert('Open GitHub project: clone flow arrives once IPC lands.')
            }}
            onQuickStart={() =>
              setView({
                kind: 'session',
                meta: SAMPLE_META,
                agents: SAMPLE_AGENTS,
                selectedId: SAMPLE_AGENTS[0]?.id ?? null,
              })
            }
          />
        </main>

        <StatusStrip platform={platform} message="welcome" />
      </div>
    )
  }

  // ── Active session ──────────────────────────────────────────────
  return <SessionView view={view} setView={setView} platform={platform} />
}

function SessionView({
  view,
  setView,
  platform,
}: {
  view: { kind: 'session'; meta: SessionMeta; agents: Agent[]; selectedId: string | null }
  setView: (v: AppView) => void
  platform: string
}) {
  const { meta, agents, selectedId } = view

  const totals = useMemo(
    () =>
      agents.reduce(
        (acc, a) => {
          acc[a.state] += 1
          return acc
        },
        { running: 0, done: 0, noop: 0, failed: 0, queued: 0 }
      ),
    [agents]
  )

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId]
  )

  const handleSubmit = (prompt: string) => {
    const id = slugify(prompt)
    const next: Agent = {
      id,
      branch: `agent/${id}`,
      worktreePath: `/tmp/preview-${id}`,
      prompt,
      state: 'running',
      startedAt: Date.now(),
      endedAt: null,
      elapsedMs: null,
      exitCode: null,
      pid: null,
      commits: [],
      filesChanged: [],
      autoCommitted: false,
      lastLines: [
        `$ claude -p --dangerously-skip-permissions "${prompt}"`,
        '(stub: IPC not yet wired)',
      ],
      usage: null,
    }
    setView({
      ...view,
      agents: [...agents, next],
      selectedId: id,
    })
  }

  const handleSelect = (id: string) => {
    setView({ ...view, selectedId: id })
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bone dark:bg-coal">
      <TitleBar meta={meta} totals={totals} />

      <div className="flex-1 grid grid-cols-[17rem_1fr] min-h-0">
        <aside className="border-r border-line dark:border-line-dark overflow-y-auto bg-bone dark:bg-coal">
          <AgentList agents={agents} selectedId={selectedId} onSelect={handleSelect} />
        </aside>

        <main className="overflow-hidden bg-bone dark:bg-coal">
          <MainPanel agent={selectedAgent} />
        </main>
      </div>

      <PromptBar onSubmit={handleSubmit} />
      <StatusStrip
        platform={platform}
        message={selectedAgent ? `selected ${selectedAgent.id}` : 'ready'}
      />
    </div>
  )
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'to', 'for', 'of', 'and', 'or',
  'with', 'on', 'at', 'by', 'from', 'as', 'is', 'be',
])

function slugify(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w))
    .slice(0, 4)
    .join('-')
  return slug || 'task'
}

declare const __APP_VERSION__: string
