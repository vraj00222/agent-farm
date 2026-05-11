import clsx from 'clsx'
import type { ProjectTab } from '../types/project'

interface TabStripProps {
  tabs: ProjectTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onAddLocal: () => void
  onAddGitHub: () => void
}

/**
 * Top tab strip. One tab per open project. "+" button opens a new project.
 * Each tab is a real <button> with a visible border + hover state — not a
 * clickable text span.
 */
export function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAddLocal,
  onAddGitHub,
}: TabStripProps) {
  return (
    <div
      className="no-drag flex items-center gap-1 px-3 border-b border-line dark:border-line-dark
                 bg-bone dark:bg-coal min-h-[40px]"
    >
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        {tabs.map((t) => {
          const active = t.id === activeId
          return (
            <div
              key={t.id}
              className={clsx(
                'group flex items-center gap-2 px-3 py-1.5 rounded-md border shrink-0 transition-all duration-150',
                active
                  ? 'border-ink-900/40 dark:border-chalk/40 bg-bone-raised dark:bg-coal-raised'
                  : 'border-line dark:border-line-dark hover:border-ink-500 dark:hover:border-chalk-dim',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                title={t.path}
                className={clsx(
                  'flex items-baseline gap-2 text-left max-w-[24ch] truncate font-display text-[12.5px]',
                  active
                    ? 'text-ink-900 dark:text-chalk font-semibold'
                    : 'text-ink-700 dark:text-chalk-dim font-medium hover:text-ink-900 dark:hover:text-chalk',
                )}
              >
                <span className="truncate">{t.repoName}</span>
                {!t.isGitRepo && (
                  <span
                    className="font-mono text-[9px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle"
                    title="not a git repo"
                  >
                    no-git
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onClose(t.id)}
                aria-label={`Close ${t.repoName}`}
                title="Close tab"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                           w-4 h-4 flex items-center justify-center rounded
                           text-ink-400 dark:text-chalk-subtle
                           hover:bg-line/60 dark:hover:bg-line-dark
                           hover:text-state-failed transition-all duration-100"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path
                    d="M2 2 L8 8 M8 2 L2 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={onAddLocal}
          title="Open a local folder"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                     border border-line dark:border-line-dark
                     hover:border-ink-500 dark:hover:border-chalk-dim
                     hover:bg-bone-raised dark:hover:bg-coal-raised
                     text-ink-700 dark:text-chalk-dim
                     hover:text-ink-900 dark:hover:text-chalk
                     font-display font-semibold text-[12.5px]
                     transition-all duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M6 2v8M2 6h8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          New
        </button>

        <button
          type="button"
          onClick={onAddGitHub}
          title="Clone from GitHub"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                     border border-line dark:border-line-dark
                     hover:border-ink-500 dark:hover:border-chalk-dim
                     hover:bg-bone-raised dark:hover:bg-coal-raised
                     text-ink-700 dark:text-chalk-dim
                     hover:text-ink-900 dark:hover:text-chalk
                     font-display font-semibold text-[12.5px]
                     transition-all duration-150"
        >
          GitHub
        </button>
      </div>
    </div>
  )
}
