import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { FsEntry, FsListResult } from '../../../shared/ipc'

interface FilesViewProps {
  projectPath: string
}

/**
 * Recursive project file tree. Built lazily — the main process returns a
 * tree capped at 3 levels deep / 600 entries, and we render it as
 * collapsible rows. Click a file → reveals it in Finder. Click a folder
 * → toggles expand.
 */
export function FilesView({ projectPath }: FilesViewProps) {
  const [data, setData] = useState<FsListResult | 'loading' | null>(null)

  const refresh = useCallback(async () => {
    setData('loading')
    const api = window.agentFarm
    if (!api) {
      setData({ ok: false, reason: 'IPC bridge unavailable' })
      return
    }
    try {
      const result = await api.fs.list(projectPath)
      setData(result)
    } catch (err) {
      setData({ ok: false, reason: err instanceof Error ? err.message : String(err) })
    }
  }, [projectPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="h-full flex flex-col bg-bone dark:bg-coal">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2
                   border-b border-line dark:border-line-dark"
      >
        <span className="font-mono text-[10px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
          files
        </span>
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
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {data === 'loading' ? (
          <Placeholder>loading…</Placeholder>
        ) : data && !data.ok ? (
          <Placeholder error>couldn’t list files: {data.reason}</Placeholder>
        ) : data && data.ok ? (
          <Tree root={data.root} capped={data.capped} />
        ) : null}
      </div>
    </div>
  )
}

function Placeholder({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p
      className={clsx(
        'px-3 py-2 font-mono text-[11px]',
        error ? 'text-state-failed' : 'text-ink-400 dark:text-chalk-subtle',
      )}
    >
      {children}
    </p>
  )
}

function Tree({ root, capped }: { root: FsEntry; capped: boolean }) {
  return (
    <div>
      {root.children && (
        <ul className="flex flex-col">
          {root.children.map((e) => (
            <Node key={e.path} entry={e} depth={0} />
          ))}
        </ul>
      )}
      {capped && (
        <p className="px-3 py-2 font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          (listing truncated — try refreshing from a deeper folder)
        </p>
      )}
    </div>
  )
}

function Node({ entry, depth }: { entry: FsEntry; depth: number }) {
  const isDir = entry.kind === 'dir'
  const [open, setOpen] = useState(depth < 1) // first-level dirs open by default

  const reveal = () => {
    void window.agentFarm?.revealInFinder(entry.path)
  }

  if (!isDir) {
    return (
      <li>
        <button
          type="button"
          onClick={reveal}
          title={entry.path}
          className="no-drag w-full text-left px-3 py-[3px]
                     font-mono text-[11px]
                     text-ink-700 dark:text-chalk-dim
                     hover:bg-bone-raised dark:hover:bg-coal-raised
                     hover:text-ink-900 dark:hover:text-chalk
                     transition-colors truncate"
          style={{ paddingLeft: 12 + depth * 12 }}
        >
          {entry.name}
        </button>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={entry.path}
        className="no-drag w-full text-left px-3 py-[3px]
                   font-mono text-[11px] flex items-center gap-1
                   text-ink-900 dark:text-chalk font-semibold
                   hover:bg-bone-raised dark:hover:bg-coal-raised
                   transition-colors truncate"
        style={{ paddingLeft: 12 + depth * 12 }}
      >
        <span className="inline-block w-3 text-ink-400 dark:text-chalk-subtle">
          {open ? '▾' : '▸'}
        </span>
        <span className="truncate">{entry.name}/</span>
      </button>
      {open && entry.children && (
        <ul className="flex flex-col">
          {entry.children.map((c) => (
            <Node key={c.path} entry={c} depth={depth + 1} />
          ))}
        </ul>
      )}
      {open && entry.truncated && (
        <p
          className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle px-3 py-0.5"
          style={{ paddingLeft: 12 + (depth + 1) * 12 }}
        >
          (depth cap)
        </p>
      )}
    </li>
  )
}
