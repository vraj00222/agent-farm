import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

export type ClaudeModel = 'default' | 'opus' | 'sonnet' | 'haiku'

const MODELS: Array<{ value: ClaudeModel; label: string; sub: string }> = [
  { value: 'default', label: 'Default', sub: 'Use claude default' },
  { value: 'opus', label: 'Opus', sub: 'Most capable, highest cost' },
  { value: 'sonnet', label: 'Sonnet', sub: 'Balanced for most tasks' },
  { value: 'haiku', label: 'Haiku', sub: 'Fast, lowest cost' },
]

interface ModelPickerProps {
  value: ClaudeModel
  onChange: (m: ClaudeModel) => void
}

/**
 * Tiny dropdown for the active model. Sits in the title bar where
 * the static "MODEL default" field used to be. Click → menu opens
 * below; click an option → close + emit. Esc / outside click closes.
 */
export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = MODELS.find((m) => m.value === value) ?? MODELS[0]

  return (
    <div ref={ref} className="relative no-drag">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-baseline gap-1.5 px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded',
          'transition-colors duration-150',
          open
            ? 'bg-ink-900/[0.06] dark:bg-chalk/[0.08]'
            : 'hover:bg-ink-900/[0.04] dark:hover:bg-chalk/[0.05]'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-mono text-[9.5px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
          model
        </span>
        <span className="text-[11px] font-medium text-ink-800 dark:text-chalk">
          {current.label.toLowerCase()}
        </span>
        <span
          className={clsx(
            'text-[8px] text-ink-400 dark:text-chalk-subtle transition-transform duration-200',
            open && 'rotate-180'
          )}
        >
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[220px]
                     bg-bone dark:bg-coal-raised
                     border border-line dark:border-line-dark
                     rounded-md shadow-md
                     py-1
                     animate-fade-in"
        >
          {MODELS.map((m) => (
            <li key={m.value}>
              <button
                type="button"
                role="option"
                aria-selected={m.value === value}
                onClick={() => {
                  onChange(m.value)
                  setOpen(false)
                }}
                className={clsx(
                  'w-full text-left flex items-baseline justify-between gap-3 px-3 py-2',
                  'transition-colors duration-100',
                  'hover:bg-ink-900/[0.04] dark:hover:bg-chalk/[0.05]',
                  m.value === value && 'bg-ink-900/[0.03] dark:bg-chalk/[0.04]'
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-display text-[12.5px] font-medium text-ink-900 dark:text-chalk">
                    {m.label}
                  </span>
                  <span className="text-[10.5px] text-ink-500 dark:text-chalk-dim leading-none">
                    {m.sub}
                  </span>
                </div>
                {m.value === value && (
                  <span className="font-mono text-[10px] text-ink-700 dark:text-chalk">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
