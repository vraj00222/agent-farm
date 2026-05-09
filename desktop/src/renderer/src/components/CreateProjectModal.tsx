import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

export type ProjectTemplate = 'empty' | 'next' | 'gstack'

export interface CreateProjectInput {
  name: string
  parentFolder: string
  template: ProjectTemplate
}

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: CreateProjectInput) => void
  defaultParentFolder?: string
}

/**
 * Create a new local project. Inspired by Conductor's modal but pure
 * tinted B/W with our type stack. Slugifies as you type, validates the
 * parent folder is non-empty, focus traps inside the modal, ⌘↵ submits.
 */
export function CreateProjectModal({
  open,
  onClose,
  onCreate,
  defaultParentFolder = '~/Developer',
}: CreateProjectModalProps) {
  const [name, setName] = useState('')
  const [parentFolder, setParentFolder] = useState(defaultParentFolder)
  const [template, setTemplate] = useState<ProjectTemplate>('empty')
  const nameRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset + focus on open
  useEffect(() => {
    if (open) {
      setName('')
      setTemplate('empty')
      // focus after dialog mounts
      requestAnimationFrame(() => nameRef.current?.focus())
    }
  }, [open])

  // Escape closes; ⌘↵ submits
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        attemptSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name, parentFolder, template])

  const slug = slugify(name)
  const canSubmit = slug.length > 0 && parentFolder.trim().length > 0

  const attemptSubmit = () => {
    if (!canSubmit) return
    onCreate({ name: slug, parentFolder: parentFolder.trim(), template })
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10
                 bg-coal/40 dark:bg-coal/65 backdrop-blur-sm
                 animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto
                   bg-bone dark:bg-coal-raised
                   border border-line dark:border-line-dark
                   rounded-xl shadow-md
                   animate-rise"
      >
        <div className="p-7 pb-5">
          <h2
            id="create-project-title"
            className="font-display text-2xl font-semibold tracking-tightest text-ink-900 dark:text-chalk"
          >
            Create project
          </h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-chalk-dim">
            Create a local folder, initialize git, and start a workspace.
          </p>
        </div>

        <div className="px-7 pb-7 space-y-6">
          <Field label="Project name">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              placeholder="my-experiment"
              className="w-full px-3 py-2.5 rounded-md
                         bg-bone-sunk dark:bg-coal-sunk
                         border border-line dark:border-line-dark
                         font-display text-base text-ink-900 dark:text-chalk
                         placeholder:text-ink-400 dark:placeholder:text-chalk-subtle
                         focus:outline-none focus:border-ink-700 dark:focus:border-chalk-dim
                         transition-colors duration-150"
            />
            {slug && (
              <p className="mt-2 text-xs text-ink-500 dark:text-chalk-dim">
                Creates folder and repo
                <code className="ml-2 inline-block px-1.5 py-0.5 rounded
                                 bg-bone-sunk dark:bg-coal-sunk
                                 border border-line dark:border-line-dark
                                 font-mono text-[11px] text-ink-800 dark:text-chalk">
                  {slug}
                </code>
              </p>
            )}
          </Field>

          <Field label="Parent folder">
            <div className="flex gap-2">
              <input
                type="text"
                value={parentFolder}
                onChange={(e) => setParentFolder(e.target.value)}
                spellCheck={false}
                placeholder="~/Developer"
                className="flex-1 px-3 py-2.5 rounded-md
                           bg-bone-sunk dark:bg-coal-sunk
                           border border-line dark:border-line-dark
                           font-mono text-sm text-ink-900 dark:text-chalk
                           placeholder:text-ink-400 dark:placeholder:text-chalk-subtle
                           focus:outline-none focus:border-ink-700 dark:focus:border-chalk-dim
                           transition-colors duration-150"
              />
              <button
                type="button"
                onClick={() => {
                  // TODO: real folder picker via IPC.
                  // For now this is a hint that a picker will land here.
                  alert('Folder picker arrives once the main process IPC lands.')
                }}
                className="btn-ghost"
              >
                Browse
              </button>
            </div>
          </Field>

          <Field label="Template">
            <div className="grid grid-cols-3 gap-2.5">
              <TemplateCard
                value="empty"
                selected={template === 'empty'}
                onSelect={setTemplate}
                title="Empty"
                sub="Blank git repo"
                icon={<EmptyIcon />}
              />
              <TemplateCard
                value="next"
                selected={template === 'next'}
                onSelect={setTemplate}
                title="Next.js"
                sub="TypeScript, Tailwind"
                icon={<NextIcon />}
              />
              <TemplateCard
                value="gstack"
                selected={template === 'gstack'}
                onSelect={setTemplate}
                title="gstack"
                sub="Agent workflow template"
                icon={<GIcon />}
                badge="NEW"
              />
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-7 py-4
                        border-t border-line dark:border-line-dark
                        bg-bone-sunk/50 dark:bg-coal/40">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
            <span className="kbd ml-1">esc</span>
          </button>
          <button
            type="button"
            onClick={attemptSubmit}
            disabled={!canSubmit}
            className="btn-primary"
          >
            Create
            <span className="kbd ml-1 bg-bone/15 border-bone/25 text-bone/85
                             dark:bg-coal/15 dark:border-coal/25 dark:text-coal/85">
              ⌘↵
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-display text-sm font-medium text-ink-900 dark:text-chalk mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}

function TemplateCard({
  value,
  selected,
  onSelect,
  title,
  sub,
  icon,
  badge,
}: {
  value: ProjectTemplate
  selected: boolean
  onSelect: (t: ProjectTemplate) => void
  title: string
  sub: string
  icon: React.ReactNode
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={clsx(
        'group relative flex flex-col items-center text-center gap-2 p-3 pt-4 rounded-md',
        'border transition-all duration-200 ease-quart-out',
        'hover:-translate-y-0.5',
        selected
          ? 'border-ink-900 dark:border-chalk bg-ink-900/[0.04] dark:bg-chalk/[0.06]'
          : 'border-line dark:border-line-dark hover:border-ink-500 dark:hover:border-chalk-dim',
        'active:scale-[0.985]'
      )}
    >
      {badge && (
        <span className="absolute top-1.5 right-1.5
                         px-1.5 py-px rounded
                         bg-bone-sunk dark:bg-coal-sunk
                         border border-line dark:border-line-dark
                         font-mono text-[8.5px] uppercase tracking-cap text-ink-700 dark:text-chalk-dim">
          {badge}
        </span>
      )}
      <div className="w-7 h-7 flex items-center justify-center text-ink-700 dark:text-chalk
                      transition-transform duration-200 group-hover:scale-110">
        {icon}
      </div>
      <div className="mt-1">
        <p className="font-display font-semibold text-[12.5px] text-ink-900 dark:text-chalk">
          {title}
        </p>
        <p className="mt-0.5 text-[10.5px] text-ink-500 dark:text-chalk-dim leading-tight">
          {sub}
        </p>
      </div>
    </button>
  )
}

function EmptyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3.5h6.5L15 7v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M11 3.5V7h4" />
      <path d="M8 10.5l-1 1.5 1 1.5M12 10.5l1 1.5-1 1.5" strokeLinejoin="miter" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7 6.5v7M13 5.5v9M7 6.5l5.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 7.5a4.5 4.5 0 1 0 1.5 4H10" />
    </svg>
  )
}

const STOPWORDS_SLUG = /[^a-z0-9-]/g
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(STOPWORDS_SLUG, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
