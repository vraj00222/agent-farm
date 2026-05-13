import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  GitDiffStructuredResult,
} from '../../../shared/ipc'

interface DiffViewProps {
  /** Repo (or worktree) path to diff. */
  projectPath: string
  isGitRepo: boolean
  /** Optional comparison base. When provided we run `git diff <baseSha>`
   *  which includes both committed-since-base AND uncommitted work. When
   *  absent we diff working tree vs HEAD (the project-level behaviour). */
  baseSha?: string
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'err'; reason: string }
  | { kind: 'ok'; files: DiffFile[]; truncated: boolean }

/**
 * Structured diff viewer. File tree on the left (alphabetized, with kind
 * icon + +N/-N counts), hunks for the selected file on the right.
 *
 * Selecting a file shows its hunks. Selecting "all" stacks every file's
 * hunks vertically with file-header separators — useful for skim review.
 */
export function DiffView({ projectPath, isGitRepo, baseSha }: DiffViewProps) {
  const [state, setState] = useState<Loaded | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | 'all'>('all')

  const refresh = useCallback(async () => {
    if (!isGitRepo) return
    setState({ kind: 'loading' })
    const api = window.agentFarm
    if (!api) {
      setState({ kind: 'err', reason: 'IPC bridge unavailable' })
      return
    }
    try {
      const result: GitDiffStructuredResult = await api.git.diffStructured({
        path: projectPath,
        baseSha,
      })
      if (!result.ok) {
        setState({ kind: 'err', reason: result.reason })
        return
      }
      setState({ kind: 'ok', files: result.files, truncated: result.truncated })
    } catch (err) {
      setState({
        kind: 'err',
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }, [projectPath, isGitRepo, baseSha])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // When the file list reloads, drop a stale selection that's no longer valid.
  useEffect(() => {
    if (state?.kind !== 'ok') return
    if (selectedPath === 'all') return
    if (!state.files.some((f) => f.path === selectedPath)) {
      setSelectedPath('all')
    }
  }, [state, selectedPath])

  return (
    <div className="h-full flex flex-col bg-bone dark:bg-coal">
      <Header
        state={state}
        isGitRepo={isGitRepo}
        baseSha={baseSha}
        onRefresh={() => void refresh()}
      />
      <div className="flex-1 min-h-0 flex">
        {state?.kind === 'ok' && state.files.length > 0 && (
          <FileList
            files={state.files}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        )}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <Body state={state} isGitRepo={isGitRepo} selectedPath={selectedPath} />
        </div>
      </div>
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────

function Header({
  state,
  isGitRepo,
  baseSha,
  onRefresh,
}: {
  state: Loaded | null
  isGitRepo: boolean
  baseSha?: string
  onRefresh: () => void
}) {
  const total = useMemo(() => {
    if (state?.kind !== 'ok') return null
    const added = state.files.reduce((a, f) => a + f.addedLines, 0)
    const removed = state.files.reduce((a, f) => a + f.removedLines, 0)
    return { files: state.files.length, added, removed }
  }, [state])
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2
                 border-b border-line dark:border-line-dark"
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
          diff
        </span>
        {baseSha && (
          <span className="font-mono text-[10px] text-ink-500 dark:text-chalk-dim truncate">
            {baseSha.slice(0, 8)}..HEAD
          </span>
        )}
        {total && (
          <span className="font-mono text-[10px] text-ink-500 dark:text-chalk-dim">
            {total.files} file{total.files === 1 ? '' : 's'}
            <span className="ml-2 text-emerald-700 dark:text-emerald-400">
              +{total.added}
            </span>
            <span className="ml-1 text-state-failed">−{total.removed}</span>
          </span>
        )}
      </div>
      {isGitRepo && (
        <button
          type="button"
          onClick={onRefresh}
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
  )
}

// ── File list ────────────────────────────────────────────────────────

function FileList({
  files,
  selectedPath,
  onSelect,
}: {
  files: DiffFile[]
  selectedPath: string | 'all'
  onSelect: (p: string | 'all') => void
}) {
  // Sort alphabetically; renames + binaries don't get special placement.
  const sorted = useMemo(
    () => [...files].sort((a, b) => a.path.localeCompare(b.path)),
    [files],
  )
  return (
    <aside
      className="w-[260px] shrink-0 border-r border-line dark:border-line-dark
                 overflow-y-auto bg-bone-sunk dark:bg-coal-sunk"
    >
      <button
        type="button"
        onClick={() => onSelect('all')}
        className={clsx(
          'w-full text-left px-3 py-1.5 font-mono text-[11px] truncate',
          'border-b border-line dark:border-line-dark',
          selectedPath === 'all'
            ? 'bg-bone-raised dark:bg-coal-raised text-ink-900 dark:text-chalk font-semibold'
            : 'text-ink-700 dark:text-chalk-dim hover:text-ink-900 dark:hover:text-chalk',
        )}
      >
        ▾ all files
      </button>
      {sorted.map((f) => (
        <FileRow
          key={f.path}
          file={f}
          selected={selectedPath === f.path}
          onSelect={() => onSelect(f.path)}
        />
      ))}
    </aside>
  )
}

function FileRow({
  file,
  selected,
  onSelect,
}: {
  file: DiffFile
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'w-full text-left px-3 py-1 font-mono text-[11px] flex items-center gap-2',
        'border-b border-line/40 dark:border-line-dark/40',
        selected
          ? 'bg-bone-raised dark:bg-coal-raised text-ink-900 dark:text-chalk'
          : 'text-ink-700 dark:text-chalk-dim hover:bg-bone-raised/60 dark:hover:bg-coal-raised/60',
      )}
    >
      <KindGlyph kind={file.kind} binary={file.binary} />
      <span className="flex-1 min-w-0 truncate" title={file.path}>
        {file.path}
      </span>
      {!file.binary && (
        <span className="shrink-0">
          <span className="text-emerald-700 dark:text-emerald-400">+{file.addedLines}</span>
          <span className="ml-1 text-state-failed">−{file.removedLines}</span>
        </span>
      )}
    </button>
  )
}

function KindGlyph({ kind, binary }: { kind: DiffFile['kind']; binary: boolean }) {
  if (binary) {
    return (
      <span
        className="inline-block w-3 text-center text-[10px] text-ink-400 dark:text-chalk-subtle"
        title="binary"
      >
        b
      </span>
    )
  }
  const map: Record<DiffFile['kind'], { ch: string; cls: string; title: string }> = {
    added: { ch: 'A', cls: 'text-emerald-700 dark:text-emerald-400', title: 'added' },
    modified: { ch: 'M', cls: 'text-ink-500 dark:text-chalk-dim', title: 'modified' },
    deleted: { ch: 'D', cls: 'text-state-failed', title: 'deleted' },
    renamed: { ch: 'R', cls: 'text-ink-500 dark:text-chalk-dim', title: 'renamed' },
    binary: { ch: 'b', cls: 'text-ink-400 dark:text-chalk-subtle', title: 'binary' },
  }
  const m = map[kind]
  return (
    <span className={clsx('inline-block w-3 text-center text-[10px]', m.cls)} title={m.title}>
      {m.ch}
    </span>
  )
}

// ── Body ─────────────────────────────────────────────────────────────

function Body({
  state,
  isGitRepo,
  selectedPath,
}: {
  state: Loaded | null
  isGitRepo: boolean
  selectedPath: string | 'all'
}) {
  if (!isGitRepo) {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
        not a git repo — run `git init` in the project root to enable diffs
      </p>
    )
  }
  if (!state || state.kind === 'loading') {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
        loading…
      </p>
    )
  }
  if (state.kind === 'err') {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-state-failed">
        diff failed: {state.reason}
      </p>
    )
  }
  if (state.files.length === 0) {
    return (
      <p className="px-3 py-3 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
        no changes
      </p>
    )
  }
  const visible =
    selectedPath === 'all'
      ? state.files
      : state.files.filter((f) => f.path === selectedPath)
  return (
    <div>
      {visible.map((f) => (
        <FileBlock key={f.path} file={f} />
      ))}
      {state.truncated && (
        <p className="px-3 py-2 font-mono text-[10.5px] text-ink-400 dark:text-chalk-subtle">
          diff truncated at 512 KB — refresh to retry or open the file directly
        </p>
      )}
    </div>
  )
}

function FileBlock({ file }: { file: DiffFile }) {
  return (
    <section className="border-b border-line dark:border-line-dark">
      <header
        className="sticky top-0 z-10 flex items-baseline gap-3 px-3 py-1.5
                   bg-bone-sunk/95 dark:bg-coal-sunk/95 backdrop-blur
                   border-b border-line dark:border-line-dark"
      >
        <KindGlyph kind={file.kind} binary={file.binary} />
        <span className="font-mono text-[11.5px] font-semibold text-ink-900 dark:text-chalk truncate">
          {file.path}
        </span>
        {file.oldPath !== file.path && (
          <span
            className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle truncate"
            title={`renamed from ${file.oldPath}`}
          >
            ← {file.oldPath}
          </span>
        )}
        {!file.binary && (
          <span className="ml-auto font-mono text-[10.5px]">
            <span className="text-emerald-700 dark:text-emerald-400">+{file.addedLines}</span>
            <span className="ml-1 text-state-failed">−{file.removedLines}</span>
          </span>
        )}
      </header>
      {file.binary ? (
        <p className="px-3 py-2 font-mono text-[11px] text-ink-400 dark:text-chalk-subtle">
          binary file — no diff preview
        </p>
      ) : (
        file.hunks.map((h, i) => <HunkBlock key={i} hunk={h} />)
      )}
    </section>
  )
}

function HunkBlock({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <div
        className="px-3 py-1 bg-bone-raised dark:bg-coal-raised
                   text-ink-500 dark:text-chalk-dim border-b border-line/50 dark:border-line-dark/50
                   truncate"
        title={hunk.header}
      >
        {hunk.header}
      </div>
      <div className="px-3 py-1">
        {hunk.lines.map((l, i) => (
          <HunkLine key={i} line={l} oldLineNo={lineNoForOld(hunk, i)} newLineNo={lineNoForNew(hunk, i)} />
        ))}
      </div>
    </div>
  )
}

function HunkLine({
  line,
  oldLineNo,
  newLineNo,
}: {
  line: DiffLine
  oldLineNo: number | null
  newLineNo: number | null
}) {
  const tone =
    line.kind === 'add'
      ? 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
      : line.kind === 'del'
        ? 'bg-rose-500/5 text-state-failed'
        : 'text-ink-700 dark:text-chalk-dim'
  return (
    <div className={clsx('flex whitespace-pre', tone)}>
      <span className="w-9 shrink-0 text-right pr-2 text-ink-400 dark:text-chalk-subtle select-none">
        {oldLineNo ?? ''}
      </span>
      <span className="w-9 shrink-0 text-right pr-2 text-ink-400 dark:text-chalk-subtle select-none">
        {newLineNo ?? ''}
      </span>
      <span className="w-3 shrink-0 select-none">
        {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
      </span>
      <span className="flex-1 min-w-0">{line.text || ' '}</span>
    </div>
  )
}

// Compute line numbers per hunk so the gutter is accurate. We walk through
// the hunk's lines incrementally: contexts advance both, adds advance new,
// dels advance old.
function lineNoForOld(hunk: DiffHunk, index: number): number | null {
  let n = hunk.oldStart
  for (let i = 0; i < index; i++) {
    const k = hunk.lines[i].kind
    if (k === 'context' || k === 'del') n += 1
  }
  const cur = hunk.lines[index].kind
  if (cur === 'add') return null
  return n
}
function lineNoForNew(hunk: DiffHunk, index: number): number | null {
  let n = hunk.newStart
  for (let i = 0; i < index; i++) {
    const k = hunk.lines[i].kind
    if (k === 'context' || k === 'add') n += 1
  }
  const cur = hunk.lines[index].kind
  if (cur === 'del') return null
  return n
}
