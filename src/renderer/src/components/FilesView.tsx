import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { FsEntry, FsListResult } from '../../../shared/ipc'

interface FilesViewProps {
  projectPath: string
}

/**
 * VSCode-style file tree. Indentation guides connect parents to children,
 * a small chevron toggles each folder, file-type glyphs hint at the kind,
 * the active row stays highlighted across hover transitions.
 */
export function FilesView({ projectPath }: FilesViewProps) {
  const [data, setData] = useState<FsListResult | 'loading' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

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
          <Tree
            root={data.root}
            capped={data.capped}
            selected={selected}
            onSelect={setSelected}
          />
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

function Tree({
  root,
  capped,
  selected,
  onSelect,
}: {
  root: FsEntry
  capped: boolean
  selected: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div>
      {root.children && (
        <ul className="flex flex-col">
          {root.children.map((e) => (
            <Node
              key={e.path}
              entry={e}
              depth={0}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
      {capped && (
        <p className="px-3 py-2 font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          (listing truncated — too many files at this depth)
        </p>
      )}
    </div>
  )
}

const INDENT_PX = 14

function Node({
  entry,
  depth,
  selected,
  onSelect,
}: {
  entry: FsEntry
  depth: number
  selected: string | null
  onSelect: (path: string) => void
}) {
  const isDir = entry.kind === 'dir'
  const [open, setOpen] = useState(depth < 1)
  const isSelected = selected === entry.path

  const handleClick = () => {
    onSelect(entry.path)
    if (isDir) setOpen((v) => !v)
  }
  const handleDoubleClick = () => {
    void window.agentFarm?.revealInFinder(entry.path)
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={entry.path}
        className={clsx(
          'no-drag w-full text-left relative flex items-center gap-1.5',
          'h-[22px] pr-2',
          'transition-colors duration-75',
          isSelected
            ? 'bg-bone-raised dark:bg-coal-raised text-ink-900 dark:text-chalk'
            : 'text-ink-700 dark:text-chalk-dim hover:bg-bone-raised/60 dark:hover:bg-coal-raised/60 hover:text-ink-900 dark:hover:text-chalk',
        )}
        style={{ paddingLeft: 8 + depth * INDENT_PX }}
      >
        {/* indentation guides */}
        {depth > 0 &&
          Array.from({ length: depth }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-line dark:bg-line-dark"
              style={{ left: 8 + i * INDENT_PX + 6 }}
            />
          ))}

        {/* expand chevron OR file glyph */}
        <span className="relative inline-flex items-center justify-center w-3 shrink-0 text-ink-400 dark:text-chalk-subtle">
          {isDir ? (
            <Chevron open={open} />
          ) : (
            <span className="block w-0.5 h-0.5 rounded-full bg-current opacity-40" />
          )}
        </span>

        {/* icon */}
        <span
          className={clsx(
            'shrink-0 inline-flex items-center justify-center w-4 h-4',
            isDir ? 'text-ink-900 dark:text-chalk' : 'text-ink-500 dark:text-chalk-dim',
          )}
        >
          {isDir ? <FolderIcon open={open} /> : <FileIcon name={entry.name} />}
        </span>

        {/* name */}
        <span
          className={clsx(
            'truncate font-mono text-[11.5px]',
            isDir ? 'font-semibold' : 'font-medium',
          )}
        >
          {entry.name}
        </span>
      </button>

      {isDir && open && entry.children && (
        <ul className="flex flex-col">
          {entry.children.map((c) => (
            <Node
              key={c.path}
              entry={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
      {isDir && open && entry.truncated && (
        <p
          className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle py-0.5"
          style={{ paddingLeft: 8 + (depth + 1) * INDENT_PX + 18 }}
        >
          (depth cap)
        </p>
      )}
    </li>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={clsx('transition-transform duration-100', open ? 'rotate-90' : '')}
      aria-hidden
    >
      <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path
          d="M1.5 3.5 a1 1 0 0 1 1 -1 h2.5 l1.2 1.2 h5.8 a1 1 0 0 1 1 1 v.8 H1.5 z"
          fill="currentColor"
          opacity="0.4"
        />
        <path
          d="M1.5 5 h11 l-1.2 5.6 a1 1 0 0 1 -1 .9 h-7.6 a1 1 0 0 1 -1 -.9 z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M1.5 3.5 a1 1 0 0 1 1 -1 h2.5 l1.2 1.2 h5.8 a1 1 0 0 1 1 1 v6.3 a1 1 0 0 1 -1 1 H2.5 a1 1 0 0 1 -1 -1 z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  )
}

function FileIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const tone = extColor(ext)
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" aria-hidden>
      <path
        d="M1 1 h6 l3 3 v8 a1 1 0 0 1 -1 1 H1 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.65"
      />
      <path d="M7 1 v3 h3" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.65" />
      {/* small tinted dot to differentiate file families */}
      <circle cx="5.5" cy="9.5" r="1.4" fill={tone} />
    </svg>
  )
}

/** Tinted by file family. All within our B/W system — just gradients of ink. */
function extColor(ext: string): string {
  const tsLike = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'])
  const styleLike = new Set(['css', 'scss', 'less', 'tailwind'])
  const dataLike = new Set(['json', 'yaml', 'yml', 'toml', 'env'])
  const docLike = new Set(['md', 'mdx', 'txt'])
  if (tsLike.has(ext)) return 'currentColor'
  if (styleLike.has(ext)) return 'currentColor'
  if (dataLike.has(ext)) return 'currentColor'
  if (docLike.has(ext)) return 'currentColor'
  return 'currentColor'
}
