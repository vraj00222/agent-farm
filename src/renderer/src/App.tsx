import { useCallback, useEffect, useMemo, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { AgentList } from './components/AgentList'
import { MainPanel } from './components/MainPanel'
import { PromptBar } from './components/PromptBar'
import { StatusStrip } from './components/StatusStrip'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Onboarding } from './components/Onboarding'
import { CreateProjectModal, type CreateProjectInput } from './components/CreateProjectModal'
import type { ClaudeModel } from './components/ModelPicker'
import type { Agent, SessionMeta } from './types/agent'
import type { AgentFarmApi, ClaudeStatus, RecentProject } from '../../shared/ipc'

declare global {
  interface Window {
    agentFarm?: AgentFarmApi
  }
}

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
    ],
    usage: null,
  },
]

const DEMO_META: SessionMeta = {
  baseSha: '94f83c8f12a4d1e9b3c2a8f4d6e1c5b9a2f8e7d1',
  repoName: '404museum',
  claudeVersion: 'demo',
  model: null,
}

type AppView =
  | { kind: 'welcome' }
  | {
      kind: 'session'
      meta: SessionMeta
      agents: Agent[]
      selectedId: string | null
    }

export function App() {
  const [view, setView] = useState<AppView>({ kind: 'welcome' })
  const [model, setModel] = useState<ClaudeModel>('default')
  const [createOpen, setCreateOpen] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | 'loading'>('loading')
  const [bypassOnboarding, setBypassOnboarding] = useState(false)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [openError, setOpenError] = useState<string | null>(null)

  const platform = window.agentFarm?.platform ?? 'browser'

  const detectClaude = useCallback(async () => {
    setClaudeStatus('loading')
    const api = window.agentFarm
    if (!api) {
      setClaudeStatus({ state: 'error', message: 'IPC bridge unavailable' })
      return
    }
    try {
      const status = await api.claude.detect()
      setClaudeStatus(status)
    } catch (err) {
      setClaudeStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [])

  const refreshRecents = useCallback(async () => {
    const api = window.agentFarm
    if (!api) return
    try {
      setRecents(await api.project.recent.list())
    } catch {
      /* ignored — recents are best-effort */
    }
  }, [])

  useEffect(() => {
    void detectClaude()
    void refreshRecents()
  }, [detectClaude, refreshRecents])

  const claudeVersion =
    claudeStatus !== 'loading' && 'version' in claudeStatus ? claudeStatus.version : null

  const enterSession = (meta: SessionMeta, agents: Agent[] = []) => {
    setView({
      kind: 'session',
      meta,
      agents,
      selectedId: agents[0]?.id ?? null,
    })
  }

  const handleOpenLocal = async (path?: string) => {
    setOpenError(null)
    const api = window.agentFarm
    if (!api) {
      setOpenError('IPC bridge unavailable.')
      return
    }
    const result = await api.project.open(path)
    if (!result.ok) {
      if (result.reason === 'cancelled') return
      const msg =
        result.reason === 'not_a_git_repo'
          ? `Not a git repo: ${result.path}. Run "git init" in that folder first.`
          : `Couldn't open ${result.path}: ${result.message}`
      setOpenError(msg)
      void api.log({ level: 'warn', message: 'open project failed', data: { result } })
      void refreshRecents()
      return
    }
    enterSession(
      {
        baseSha: result.project.baseSha || '0000000',
        repoName: result.project.repoName,
        claudeVersion,
        model: model === 'default' ? null : model,
      },
      [],
    )
    void refreshRecents()
  }

  const handleForgetRecent = async (path: string) => {
    const api = window.agentFarm
    if (!api) return
    setRecents(await api.project.recent.forget(path))
  }

  const handleOpenGitHub = () => {
    setOpenError('GitHub clone lands in the next release. Open a local folder for now.')
  }

  const handleQuickStart = () => {
    enterSession({ ...DEMO_META, claudeVersion: claudeVersion ?? 'demo' }, SAMPLE_AGENTS)
  }

  const handleCreate = (input: CreateProjectInput) => {
    setCreateOpen(false)
    setOpenError('Project creation lands in the next release. Open a local folder for now.')
    void window.agentFarm?.log({
      level: 'info',
      message: 'create project requested (stub)',
      data: { input },
    })
  }

  const handleOpenInstallDocs = () => {
    void window.agentFarm?.openExternal('https://docs.claude.com/en/docs/claude-code/setup')
  }

  const handleOpenSignIn = () => {
    void window.agentFarm?.openExternal('https://claude.ai/login')
  }

  // ── Onboarding gate ─────────────────────────────────────────────────
  const needsOnboarding =
    claudeStatus === 'loading' ||
    (claudeStatus.state !== 'ok' && !bypassOnboarding)

  if (needsOnboarding && view.kind === 'welcome') {
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
          <Onboarding
            status={claudeStatus}
            onRetry={detectClaude}
            onOpenInstallDocs={handleOpenInstallDocs}
            onOpenSignIn={handleOpenSignIn}
            onContinueAnyway={() => setBypassOnboarding(true)}
          />
        </main>

        <StatusStrip
          platform={platform}
          message={
            claudeStatus === 'loading'
              ? 'detecting claude'
              : claudeStatus.state === 'missing'
                ? 'claude not found'
                : claudeStatus.state === 'unauthed'
                  ? 'claude not signed in'
                  : claudeStatus.state === 'error'
                    ? 'claude check failed'
                    : 'claude ready'
          }
        />
      </div>
    )
  }

  // ── Welcome ─────────────────────────────────────────────────────────
  if (view.kind === 'welcome') {
    return (
      <>
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
              onOpenLocal={() => void handleOpenLocal()}
              onOpenGitHub={handleOpenGitHub}
              onCreateProject={() => setCreateOpen(true)}
              onDemo={handleQuickStart}
              recents={recents}
              onOpenRecent={(p) => void handleOpenLocal(p)}
              onForgetRecent={(p) => void handleForgetRecent(p)}
            />
          </main>

          <StatusStrip
            platform={platform}
            message={
              openError
                ? openError
                : claudeStatus !== 'loading' && claudeStatus.state === 'ok'
                  ? `claude ${claudeStatus.version}`
                  : 'welcome'
            }
          />
        </div>

        <CreateProjectModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      </>
    )
  }

  return (
    <SessionView
      view={view}
      setView={setView}
      platform={platform}
      model={model}
      onModelChange={setModel}
    />
  )
}

function SessionView({
  view,
  setView,
  platform,
  model,
  onModelChange,
}: {
  view: {
    kind: 'session'
    meta: SessionMeta
    agents: Agent[]
    selectedId: string | null
  }
  setView: (v: AppView) => void
  platform: string
  model: ClaudeModel
  onModelChange: (m: ClaudeModel) => void
}) {
  const { meta, agents, selectedId } = view

  const totals = useMemo(
    () =>
      agents.reduce(
        (acc, a) => {
          acc[a.state] += 1
          return acc
        },
        { running: 0, done: 0, noop: 0, failed: 0, queued: 0 },
      ),
    [agents],
  )

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId],
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
        `$ claude -p --dangerously-skip-permissions${
          model !== 'default' ? ` --model ${model}` : ''
        } "${prompt}"`,
        '(stub: main-process spawn arrives in the next release)',
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

  const metaWithModel = { ...meta, model: model === 'default' ? null : model }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bone dark:bg-coal">
      <TitleBar
        meta={metaWithModel}
        totals={totals}
        model={model}
        onModelChange={onModelChange}
      />

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
        message={selectedAgent ? `selected ${selectedAgent.id}` : `ready · ${meta.repoName}`}
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
