import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { GitDiffResult } from '../../../shared/ipc'

interface DiffViewProps {
  projectPath: string
  isGitRepo: boolean
}

/**
 * Raw `git diff HEAD` output. Color-coded by line prefix (+ green, - red,
 * @@ blue header) so it's at least scannable. Pretty hunk-by-hunk view is
 * its own follow-up.
 */
export function DiffView({ projectPath, isGitRepo }: DiffViewProps) {
  const [data, setData] = useState<GitDiffResult | 'loading' | null>(null)

  const refresh = useCallback(async () => {
    if (!isGitRepo) return
    setData('loading')
    const api = window.agentFarm
    if (!api) {
      setData({ ok: false, reason: 'IPC bridge unavailable' })
      return
    }
    try {
      const result = await api.git.diff(projectPath)
      setData(result)
    } catch (err) {
      setData({ ok: false, reason: err instanceof Error ? err.message : String(err) })
    }
  }, [projectPath, isGitRepo])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="h-full flex flex-col bg-bone dark:bg-coal">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2
                   border-b border-line dark:border-line-dark"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
            diff
          </span>
          {data && data !== 'loading' && data.ok && (
            <span className="font-mono text-[10px] text-ink-500 dark:text-chalk-dim">
              {data.filesChanged} file{data.filesChanged === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {isGitRepo && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="no-drag font-mono text-[10px] uppercase tracking-cap
                       px-2 py-0.5 rounded
                       border border-line dark:border-line-dark
                       text-ink-500 dark:text-chalk-dim
                       hover:border-ink-500 dark:hover:border-chalk-dim
                       hover:text-ink-900 dark:hover:text-chalk
                       transition-colors"
          >
            refresh
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{renderBody(data, isGitRepo)}</div>
    </div>
  )
}

function renderBody(data: GitDiffResult | 'loading' | null, isGitRepo: boolean): React.ReactNode {
  if (!isGitRepo) {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
        not a git repo — run `git init` in the project root to enable diffs
      </p>
    )
  }
  if (data === 'loading') {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
        loading…
      </p>
    )
  }
  if (!data) return null
  if (!data.ok) {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-state-failed">
        diff failed: {data.reason}
      </p>
    )
  }
  if (data.diff.length === 0) {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
        no changes against HEAD
      </p>
    )
  }
  return <DiffLines text={data.diff} />
}

function DiffLines({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-700 dark:text-chalk-dim whitespace-pre">
      {lines.map((line, i) => {
        let tone: 'add' | 'del' | 'hunk' | 'meta' | null = null
        if (line.startsWith('+') && !line.startsWith('+++')) tone = 'add'
        else if (line.startsWith('-') && !line.startsWith('---')) tone = 'del'
        else if (line.startsWith('@@')) tone = 'hunk'
        else if (
          line.startsWith('diff ') ||
          line.startsWith('index ') ||
          line.startsWith('+++ ') ||
          line.startsWith('--- ')
        ) {
          tone = 'meta'
        }
        return (
          <span
            key={i}
            className={clsx('block', {
              'text-emerald-700 dark:text-emerald-400': tone === 'add',
              'text-state-failed': tone === 'del',
              'text-ink-900 dark:text-chalk font-semibold': tone === 'hunk',
              'text-ink-400 dark:text-chalk-subtle': tone === 'meta',
            })}
          >
            {line || ' '}
          </span>
        )
      })}
    </pre>
  )
}
