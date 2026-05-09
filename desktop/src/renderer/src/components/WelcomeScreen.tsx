import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

interface WelcomeScreenProps {
  onOpenLocal: () => void
  onOpenGitHub: () => void
  onCreateProject: () => void
  onDemo?: () => void
}

const NAME = 'AGENT/FARM'

/**
 * First-launch screen. Inspired by Conductor's start screen but pure tinted
 * B/W. Big dot-matrix wordmark animates in character-by-character on mount,
 * then three entry cards slide up. The wordmark uses Doto (Google Fonts),
 * a real dot-matrix display face — distinctive and not on impeccable's
 * reflex-reject font list.
 */
export function WelcomeScreen({
  onOpenLocal,
  onOpenGitHub,
  onCreateProject,
  onDemo,
}: WelcomeScreenProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-12 py-16 bg-bone dark:bg-coal">
      <div className="flex flex-col items-center gap-12 max-w-[860px] w-full">
        <DotMatrixName text={NAME} />
        <Cards
          onOpenLocal={onOpenLocal}
          onOpenGitHub={onOpenGitHub}
          onCreateProject={onCreateProject}
        />
        {onDemo && (
          <button
            type="button"
            onClick={onDemo}
            className="group inline-flex items-center gap-2 text-[12px] no-drag
                       text-ink-500 dark:text-chalk-dim
                       hover:text-ink-900 dark:hover:text-chalk
                       transition-colors duration-150"
            style={{ animationDelay: '700ms' }}
          >
            <span>Or try the demo session</span>
            <span className="font-mono text-[14px] transition-transform duration-200 ease-quart-out group-hover:translate-x-0.5">
              →
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function DotMatrixName({ text }: { text: string }) {
  // Animate each character in with a stagger, then breathe gently.
  const [revealed, setRevealed] = useState(0)
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (revealed >= text.length) return
    const t = setTimeout(() => setRevealed((r) => r + 1), 60)
    return () => clearTimeout(t)
  }, [revealed, text.length])

  return (
    <h1
      ref={ref}
      className="select-none text-center"
      aria-label={text.replace('/', ' ')}
      style={{
        fontFamily: 'Doto, "JetBrains Mono", monospace',
        fontWeight: 900,
        fontSize: 'clamp(64px, 11vw, 128px)',
        lineHeight: 1,
        letterSpacing: '-0.01em',
      }}
    >
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className={clsx(
            'inline-block transition-all duration-300 ease-quart-out',
            i < revealed
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2'
          )}
          style={{
            color: ch === '/' ? 'var(--accent-divider)' : undefined,
            transitionDelay: `${i * 30}ms`,
          }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </h1>
  )
}

function Cards({
  onOpenLocal,
  onOpenGitHub,
  onCreateProject,
}: {
  onOpenLocal: () => void
  onOpenGitHub: () => void
  onCreateProject: () => void
}) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-[760px]
                 animate-rise"
      style={{ animationDelay: '500ms' }}
    >
      <Card
        title="Open project"
        sub="Local folder"
        onClick={onOpenLocal}
        icon={<FolderIcon />}
      />
      <Card
        title="Open GitHub project"
        sub="Clone a repo"
        onClick={onOpenGitHub}
        icon={<GlobeIcon />}
      />
      <Card
        title="New project"
        sub="Create local + git"
        onClick={onCreateProject}
        icon={<PlusFolderIcon />}
        primary
      />
    </div>
  )
}

function Card({
  title,
  sub,
  onClick,
  icon,
  primary,
}: {
  title: string
  sub: string
  onClick: () => void
  icon: React.ReactNode
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'group flex flex-col gap-7 p-5 text-left rounded-lg no-drag',
        'border transition-all duration-300 ease-quart-out',
        'bg-bone dark:bg-coal',
        primary
          ? 'border-ink-900/30 dark:border-chalk/30 hover:border-ink-900 dark:hover:border-chalk'
          : 'border-line dark:border-line-dark hover:border-ink-500 dark:hover:border-chalk-dim',
        'hover:-translate-y-0.5 hover:shadow-md',
        'active:scale-[0.985] active:translate-y-0'
      )}
    >
      <div
        className={clsx(
          'w-9 h-9 flex items-center justify-center transition-transform duration-300 ease-quart-out',
          'text-ink-700 dark:text-chalk',
          'group-hover:scale-110 group-hover:rotate-[-2deg]'
        )}
      >
        {icon}
      </div>

      <div>
        <p className="font-display font-semibold text-[15px] text-ink-900 dark:text-chalk">
          {title}
        </p>
        <p className="mt-1 text-[12px] text-ink-500 dark:text-chalk-dim">
          {sub}
        </p>
      </div>
    </button>
  )
}

/* ── Icons (custom 1.5px stroke, not Lucide / Feather) ─────────────── */

function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.5C2.5 5.4 3.4 4.5 4.5 4.5H8.5L10.5 6.5H17.5C18.6 6.5 19.5 7.4 19.5 8.5V15.5C19.5 16.6 18.6 17.5 17.5 17.5H4.5C3.4 17.5 2.5 16.6 2.5 15.5V6.5Z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="M3 11h16" />
      <path d="M11 3c2.5 2.5 3.8 5.3 3.8 8s-1.3 5.5-3.8 8c-2.5-2.5-3.8-5.3-3.8-8S8.5 5.5 11 3Z" />
    </svg>
  )
}

function PlusFolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.5C2.5 5.4 3.4 4.5 4.5 4.5H8.5L10.5 6.5H17.5C18.6 6.5 19.5 7.4 19.5 8.5V15.5C19.5 16.6 18.6 17.5 17.5 17.5H4.5C3.4 17.5 2.5 16.6 2.5 15.5V6.5Z" />
      <path d="M11 9.5V14.5M8.5 12H13.5" />
    </svg>
  )
}
