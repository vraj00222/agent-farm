import { useCallback, useEffect, useMemo, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { AgentList } from './components/AgentList'
import { MainPanel } from './components/MainPanel'
import { PromptBar } from './components/PromptBar'
import { StatusStrip } from './components/StatusStrip'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Onboarding } from './components/Onboarding'
import { ClaudeLoginPanel } from './components/ClaudeLoginPanel'
import { CreateProjectModal, type CreateProjectInput } from './components/CreateProjectModal'
import { TabStrip } from './components/TabStrip'
import type { Agent, SessionMeta } from './types/agent'
import type { ProjectTab } from './types/project'
import type { AgentFarmApi, ClaudeStatus, RecentProject } from '../../shared/ipc'

declare global {
  interface Window {
    agentFarm?: AgentFarmApi
  }
}

const SAMPLE_AGENTS_DEMO: Agent[] = [
  {
    id: 'teach-me-how-use',
    branch: 'agent/teach-me-how-use',
    worktreePath: '/Users/v/Developer/demo-teach-me-how-use',
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
      'worktree: /Users/v/Developer/demo-teach-me-how-use',
      'session started (claude-opus-4-7)',
      '→ Read    package.json',
      '← 1   { ... (+9 lines)',
    ],
    usage: null,
  },
]

function makeTabId(path: string): string {
  return (
    path.replace(/[^a-z0-9]/gi, '-').slice(-40) +
    '-' +
    Math.random().toString(36).slice(2, 6)
  )
}

export function App() {
  const [projects, setProjects] = useState<ProjectTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | 'loading'>('loading')
  const [bypassOnboarding, setBypassOnboarding] = useState(false)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [openError, setOpenError] = useState<string | null>(null)
  const [loginFlow, setLoginFlow] = useState<{ binaryPath: string } | null>(null)

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

  // ── Project open / close / focus ──────────────────────────────────────

  const openProject = useCallback(
    async (path?: string) => {
      setOpenError(null)
      const api = window.agentFarm
      if (!api) {
        setOpenError('IPC bridge unavailable.')
        return
      }
      const result = await api.project.open(path)
      if (!result.ok) {
        if (result.reason === 'cancelled') return
        setOpenError(`Couldn't open ${result.path}: ${result.message}`)
        void api.log({ level: 'warn', message: 'open project failed', data: { result } })
        return
      }
      const p = result.project
      setProjects((prev) => {
        const existing = prev.find((t) => t.path === p.path)
        if (existing) {
          setActiveId(existing.id)
          return prev
        }
        const tab: ProjectTab = {
          id: makeTabId(p.path),
          path: p.path,
          repoName: p.repoName,
          isGitRepo: p.isGitRepo,
          hasIndexHtml: p.hasIndexHtml,
          baseSha: p.baseSha,
          agents: [],
          selectedAgentId: null,
          model: 'default',
        }
        setActiveId(tab.id)
        return [...prev, tab]
      })
      if (!p.isGitRepo) {
        setOpenError(
          `Opened ${p.repoName} (not a git repo — agent spawning is disabled. Run "git init" to unlock).`,
        )
      }
      void refreshRecents()
    },
    [refreshRecents],
  )

  const closeTab = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const next = prev.filter((t) => t.id !== id)
        if (activeId === id) {
          setActiveId(next[next.length - 1]?.id ?? null)
        }
        return next
      })
    },
    [activeId],
  )

  const updateTab = useCallback((id: string, updater: (t: ProjectTab) => ProjectTab) => {
    setProjects((prev) => prev.map((t) => (t.id === id ? updater(t) : t)))
  }, [])

  const handleForgetRecent = async (path: string) => {
    const api = window.agentFarm
    if (!api) return
    setRecents(await api.project.recent.forget(path))
  }

  const handleOpenGitHub = () => {
    setOpenError('GitHub clone lands in the next release. Open a local folder for now.')
  }

  const handleQuickStart = () => {
    // Insert a demo tab using a synthetic path so it shows up like a real
    // project tab.
    const id = makeTabId('/demo/agent-farm-sample')
    const tab: ProjectTab = {
      id,
      path: '/Users/demo/agent-farm-sample',
      repoName: 'agent-farm-sample',
      isGitRepo: true,
      hasIndexHtml: false,
      baseSha: '94f83c8f12a4d1e9b3c2a8f4d6e1c5b9a2f8e7d1',
      agents: SAMPLE_AGENTS_DEMO,
      selectedAgentId: SAMPLE_AGENTS_DEMO[0]?.id ?? null,
      model: 'default',
    }
    setProjects((prev) => [...prev, tab])
    setActiveId(id)
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

  // ── Onboarding gate ──────────────────────────────────────────────────

  const handleOpenInstallDocs = () => {
    void window.agentFarm?.openExternal('https://docs.claude.com/en/docs/claude-code/setup')
  }

  const handleOpenSignIn = () => {
    const path =
      claudeStatus !== 'loading' && 'binaryPath' in claudeStatus ? claudeStatus.binaryPath : null
    if (!path) {
      void window.agentFarm?.openExternal('https://docs.claude.com/en/docs/claude-code/setup')
      return
    }
    setLoginFlow({ binaryPath: path })
  }

  const handleLoginRecheck = useCallback(async () => {
    await detectClaude()
    const api = window.agentFarm
    if (api) {
      const fresh = await api.claude.detect()
      if (fresh.state === 'ok') setLoginFlow(null)
    }
  }, [detectClaude])

  const needsOnboarding =
    claudeStatus === 'loading' || (claudeStatus.state !== 'ok' && !bypassOnboarding)

  // ── Render ───────────────────────────────────────────────────────────

  const activeTab = projects.find((t) => t.id === activeId) ?? null
  const claudeIsOk = claudeStatus !== 'loading' && claudeStatus.state === 'ok'

  if (needsOnboarding) {
    return (
      <div className="relative h-screen w-screen flex flex-col overflow-hidden bg-bone dark:bg-coal">
        <AppTitleBar onSignInAgain={null} />
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
        {loginFlow && (
          <ClaudeLoginPanel
            binaryPath={loginFlow.binaryPath}
            cwd={window.agentFarm?.home ?? '/'}
            onClose={() => setLoginFlow(null)}
            onRecheck={handleLoginRecheck}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <div className="relative h-screen w-screen flex flex-col overflow-hidden bg-bone dark:bg-coal">
        <AppTitleBar onSignInAgain={claudeIsOk ? handleOpenSignIn : null} />

        {projects.length > 0 && (
          <TabStrip
            tabs={projects}
            activeId={activeId}
            onSelect={setActiveId}
            onClose={closeTab}
            onAddLocal={() => void openProject()}
            onAddGitHub={handleOpenGitHub}
          />
        )}

        <main className="flex-1 overflow-hidden">
          {activeTab ? (
            <SessionView
              tab={activeTab}
              onUpdate={(u) => updateTab(activeTab.id, u)}
              claudeVersion={claudeVersion}
            />
          ) : (
            <WelcomeScreen
              onOpenLocal={() => void openProject()}
              onOpenGitHub={handleOpenGitHub}
              onCreateProject={() => setCreateOpen(true)}
              onDemo={handleQuickStart}
              recents={recents}
              onOpenRecent={(p) => void openProject(p)}
              onForgetRecent={(p) => void handleForgetRecent(p)}
            />
          )}
        </main>

        <StatusStrip
          platform={platform}
          message={
            openError
              ? openError
              : activeTab
                ? activeTab.path
                : claudeIsOk
                  ? `claude ${(claudeStatus as { version: string }).version}`
                  : 'welcome'
          }
        />

        {loginFlow && (
          <ClaudeLoginPanel
            binaryPath={loginFlow.binaryPath}
            cwd={window.agentFarm?.home ?? '/'}
            onClose={() => setLoginFlow(null)}
            onRecheck={handleLoginRecheck}
          />
        )}
      </div>

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </>
  )
}

/** macOS-style title bar with the brand + a real "Sign in again" button. */
function AppTitleBar({ onSignInAgain }: { onSignInAgain: (() => void) | null }) {
  return (
    <header
      className="drag flex items-center justify-between
                 bg-bone dark:bg-coal
                 border-b border-line dark:border-line-dark px-4"
      style={{ height: 'var(--titlebar-h)', paddingLeft: 90 }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display font-semibold text-[13px] tracking-tightest text-ink-900 dark:text-chalk">
          Agent Farm
        </span>
        <span className="font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          v{__APP_VERSION__}
        </span>
      </div>
      {onSignInAgain && (
        <button
          type="button"
          onClick={onSignInAgain}
          onMouseDown={(e) => e.preventDefault()}
          className="no-drag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md
                     border border-line dark:border-line-dark
                     hover:border-ink-500 dark:hover:border-chalk-dim
                     hover:bg-bone-raised dark:hover:bg-coal-raised
                     text-ink-700 dark:text-chalk-dim
                     hover:text-ink-900 dark:hover:text-chalk
                     font-display font-semibold text-[11px]
                     transition-all duration-150"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Sign in again
        </button>
      )}
    </header>
  )
}

function SessionView({
  tab,
  onUpdate,
  claudeVersion,
}: {
  tab: ProjectTab
  onUpdate: (updater: (t: ProjectTab) => ProjectTab) => void
  claudeVersion: string | null
}) {
  const totals = useMemo(
    () =>
      tab.agents.reduce(
        (acc, a) => {
          acc[a.state] += 1
          return acc
        },
        { running: 0, done: 0, noop: 0, failed: 0, queued: 0 },
      ),
    [tab.agents],
  )

  const selectedAgent = useMemo(
    () => tab.agents.find((a) => a.id === tab.selectedAgentId) ?? null,
    [tab.agents, tab.selectedAgentId],
  )

  const handleSubmit = (prompt: string) => {
    if (!tab.isGitRepo) {
      // Surface why nothing happened.
      void window.agentFarm?.log({
        level: 'warn',
        message: 'spawn blocked: not a git repo',
        data: { path: tab.path },
      })
      return
    }
    const id = slugify(prompt)
    const next: Agent = {
      id,
      branch: `agent/${id}`,
      worktreePath: `${tab.path}-${id}`,
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
          tab.model !== 'default' ? ` --model ${tab.model}` : ''
        } "${prompt}"`,
        '(stub: main-process spawn arrives in the next release)',
      ],
      usage: null,
    }
    onUpdate((t) => ({
      ...t,
      agents: [...t.agents, next],
      selectedAgentId: id,
    }))
  }

  const handleSelect = (id: string) => {
    onUpdate((t) => ({ ...t, selectedAgentId: id }))
  }

  const meta: SessionMeta = {
    baseSha: tab.baseSha || '0000000',
    repoName: tab.repoName,
    claudeVersion,
    model: tab.model === 'default' ? null : tab.model,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TitleBar
        meta={meta}
        totals={totals}
        model={tab.model}
        onModelChange={(m) => onUpdate((t) => ({ ...t, model: m }))}
      />

      <ProjectPathBar path={tab.path} isGitRepo={tab.isGitRepo} />

      <div className="flex-1 grid grid-cols-[17rem_1fr] min-h-0">
        <aside className="border-r border-line dark:border-line-dark overflow-y-auto bg-bone dark:bg-coal">
          <AgentList
            agents={tab.agents}
            selectedId={tab.selectedAgentId}
            onSelect={handleSelect}
          />
        </aside>

        <main className="overflow-hidden bg-bone dark:bg-coal">
          <MainPanel agent={selectedAgent} />
        </main>
      </div>

      <PromptBar onSubmit={handleSubmit} />
    </div>
  )
}

function ProjectPathBar({ path, isGitRepo }: { path: string; isGitRepo: boolean }) {
  const [copied, setCopied] = useState(false)

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard might be unavailable */
    }
  }

  const openInFinder = () => {
    void window.agentFarm?.revealInFinder(path)
  }

  return (
    <div
      className="no-drag flex items-center justify-between gap-3 px-4 py-1.5
                 border-b border-line dark:border-line-dark
                 bg-bone-sunk dark:bg-coal-sunk"
    >
      <div className="flex items-baseline gap-2 min-w-0 flex-1">
        <span className="font-mono text-[9.5px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle shrink-0">
          path
        </span>
        <span
          className="font-mono text-[11px] text-ink-700 dark:text-chalk-dim truncate"
          title={path}
        >
          {path}
        </span>
        {!isGitRepo && (
          <span
            className="font-mono text-[9.5px] uppercase tracking-cap text-state-failed shrink-0"
            title="Agent spawning requires a git working tree"
          >
            not a git repo
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={copyPath}
          className="px-2 py-1 rounded
                     font-mono text-[10px] uppercase tracking-cap
                     border border-line dark:border-line-dark
                     text-ink-500 dark:text-chalk-dim
                     hover:border-ink-500 dark:hover:border-chalk-dim
                     hover:text-ink-900 dark:hover:text-chalk
                     transition-all duration-100"
        >
          {copied ? 'copied' : 'copy'}
        </button>
        <button
          type="button"
          onClick={openInFinder}
          className="px-2 py-1 rounded
                     font-mono text-[10px] uppercase tracking-cap
                     border border-line dark:border-line-dark
                     text-ink-500 dark:text-chalk-dim
                     hover:border-ink-500 dark:hover:border-chalk-dim
                     hover:text-ink-900 dark:hover:text-chalk
                     transition-all duration-100"
        >
          reveal
        </button>
      </div>
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
