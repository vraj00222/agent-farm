interface StatusStripProps {
  platform: string
  message?: string
}

/**
 * Bottom-most strip — quiet status row, all monochrome.
 */
export function StatusStrip({ platform, message }: StatusStripProps) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5
                    border-t border-line dark:border-line-dark
                    bg-bone dark:bg-coal">
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-1 rounded-full bg-ink-700 dark:bg-chalk-dim" />
        <span className="font-mono text-[10px] uppercase tracking-cap text-ink-500 dark:text-chalk-dim">
          agent farm
        </span>
        <span className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle">
          desktop
        </span>
      </div>
      <div className="flex items-center gap-3.5">
        {message && (
          <span className="font-mono text-[10px] text-ink-500 dark:text-chalk-dim">
            {message}
          </span>
        )}
        <span className="font-mono text-[10px] text-ink-400 dark:text-chalk-subtle">
          {platform}
        </span>
      </div>
    </div>
  )
}
