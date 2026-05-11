import { useState } from 'react'

interface CloneGitHubModalProps {
  open: boolean
  /** Default parent dir for the clone. */
  defaultParent: string
  onClose: () => void
  onClone: (opts: { url: string; parentPath: string }) => Promise<{ ok: boolean; reason?: string }>
}

/**
 * Lightweight modal — paste a git URL, pick a parent folder, click clone.
 * Lock the form while running. Show the reason on failure.
 */
export function CloneGitHubModal({
  open,
  defaultParent,
  onClose,
  onClone,
}: CloneGitHubModalProps) {
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState(defaultParent)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async () => {
    setError(null)
    setRunning(true)
    try {
      const result = await onClone({ url: url.trim(), parentPath: parent.trim() })
      if (!result.ok) {
        setError(result.reason ?? 'clone failed')
      } else {
        setUrl('')
        onClose()
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      className="no-drag fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[92vw] rounded-lg
                   border border-line dark:border-line-dark
                   bg-bone dark:bg-coal shadow-md
                   flex flex-col gap-4 p-5"
      >
        <div>
          <h2 className="font-display font-semibold text-[16px] text-ink-900 dark:text-chalk">
            Clone from GitHub
          </h2>
          <p className="mt-1 font-mono text-[11px] text-ink-500 dark:text-chalk-dim">
            Paste a git URL — https, ssh, or git@host. We&apos;ll run{' '}
            <span className="font-semibold">git clone</span> into the parent folder you pick.
          </p>
        </div>

        <Field
          label="URL"
          value={url}
          onChange={setUrl}
          placeholder="git@github.com:owner/repo.git"
          disabled={running}
          autoFocus
        />
        <Field
          label="Parent folder"
          value={parent}
          onChange={setParent}
          placeholder={defaultParent}
          disabled={running}
        />

        {error && (
          <p className="font-mono text-[11px] text-state-failed whitespace-pre-wrap break-words">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="no-drag px-3 py-1.5 rounded-md font-display font-semibold text-[12px]
                       border border-line dark:border-line-dark
                       text-ink-700 dark:text-chalk-dim
                       hover:border-ink-500 dark:hover:border-chalk-dim
                       hover:text-ink-900 dark:hover:text-chalk
                       transition-all duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={running || !url.trim() || !parent.trim()}
            className="no-drag px-3 py-1.5 rounded-md font-display font-semibold text-[12px]
                       border border-ink-900/40 dark:border-chalk/40
                       text-ink-900 dark:text-chalk
                       hover:border-ink-900 dark:hover:border-chalk
                       hover:bg-bone-raised dark:hover:bg-coal-raised
                       transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? 'Cloning…' : 'Clone & open'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-cap text-ink-400 dark:text-chalk-subtle">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={false}
        className="font-mono text-[12px]
                   bg-bone-sunk dark:bg-coal-sunk
                   border border-line dark:border-line-dark
                   rounded-md px-3 py-2
                   text-ink-900 dark:text-chalk
                   placeholder:text-ink-400 dark:placeholder:text-chalk-subtle
                   focus:border-ink-900/40 dark:focus:border-chalk/40
                   outline-none transition-colors duration-150
                   disabled:opacity-60"
      />
    </label>
  )
}
