interface StatusStripProps {
  platform: string
  message?: string
}

/**
 * Bottom-most strip — quiet status row. Soft border, mono details.
 */
export function StatusStrip({ platform, message }: StatusStripProps) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5
                    border-t border-border dark:border-border-dark
                    bg-bg/60 dark:bg-bg-dark/60 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="text-2xs uppercase tracking-cap text-ink-muted dark:text-ink-dark-muted">
          Agent Farm
        </span>
        <span className="font-mono text-2xs text-ink-subtle dark:text-ink-dark-subtle">
          desktop
        </span>
      </div>
      <div className="flex items-center gap-3">
        {message && (
          <span className="font-mono text-2xs text-ink-subtle dark:text-ink-dark-subtle">
            {message}
          </span>
        )}
        <span className="font-mono text-2xs text-ink-subtle dark:text-ink-dark-subtle">
          {platform}
        </span>
      </div>
    </div>
  )
}
