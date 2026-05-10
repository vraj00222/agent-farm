import clsx from 'clsx'
import type { ClaudeStatus } from '../../../shared/ipc'

interface OnboardingProps {
  status: ClaudeStatus | 'loading'
  onRetry: () => void
  onOpenInstallDocs: () => void
  onOpenSignIn: () => void
  onContinueAnyway?: () => void
}

/**
 * First-launch / claude-detection screen. Three states:
 *   loading   — checking PATH, version, auth
 *   missing   — claude not on disk; show install instructions
 *   unauthed  — claude installed but `claude config get` empty; show sign-in
 *   error     — claude found but --version failed; show retry
 *   ok        — caller never renders this; we'd render the welcome screen instead
 */
export function Onboarding({
  status,
  onRetry,
  onOpenInstallDocs,
  onOpenSignIn,
  onContinueAnyway,
}: OnboardingProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-12 py-16 bg-bone dark:bg-coal">
      <div className="flex flex-col items-center gap-8 max-w-[640px] w-full">
        <Header status={status} />
        <Body
          status={status}
          onRetry={onRetry}
          onOpenInstallDocs={onOpenInstallDocs}
          onOpenSignIn={onOpenSignIn}
        />
        {onContinueAnyway && status !== 'loading' && status.state !== 'ok' && (
          <button
            type="button"
            onClick={onContinueAnyway}
            className="text-[11px] no-drag text-ink-400 dark:text-chalk-subtle
                       hover:text-ink-700 dark:hover:text-chalk-dim
                       transition-colors duration-150"
          >
            Continue without claude
          </button>
        )}
      </div>
    </div>
  )
}

function Header({ status }: { status: ClaudeStatus | 'loading' }) {
  const title =
    status === 'loading'
      ? 'Checking for claude…'
      : status.state === 'ok'
        ? 'Claude is ready'
        : status.state === 'unauthed'
          ? 'Sign in to claude'
          : status.state === 'missing'
            ? 'Install the claude CLI'
            : 'Claude check failed'

  return (
    <div className="flex flex-col items-center gap-3">
      <Dot status={status} />
      <h1
        className="font-display font-semibold text-[28px] tracking-tightest
                   text-ink-900 dark:text-chalk text-center"
      >
        {title}
      </h1>
    </div>
  )
}

function Dot({ status }: { status: ClaudeStatus | 'loading' }) {
  const tone =
    status === 'loading'
      ? 'bg-ink-400 dark:bg-chalk-subtle animate-pulse'
      : status.state === 'ok'
        ? 'bg-ink-900 dark:bg-chalk'
        : status.state === 'unauthed'
          ? 'bg-ink-700 dark:bg-chalk-dim'
          : 'bg-state-failed'
  return <span className={clsx('w-2 h-2 rounded-full', tone)} />
}

function Body({
  status,
  onRetry,
  onOpenInstallDocs,
  onOpenSignIn,
}: {
  status: ClaudeStatus | 'loading'
  onRetry: () => void
  onOpenInstallDocs: () => void
  onOpenSignIn: () => void
}) {
  if (status === 'loading') {
    return (
      <p className="text-[13px] text-ink-500 dark:text-chalk-dim text-center">
        Probing PATH, common install locations, and login state…
      </p>
    )
  }

  if (status.state === 'missing') {
    return (
      <div className="flex flex-col items-stretch gap-5 w-full">
        <p className="text-[13px] text-ink-700 dark:text-chalk-dim text-center">
          Agent Farm runs the <span className="font-mono">claude</span> CLI on
          your machine. Install it once, then come back.
        </p>
        <pre
          className="font-mono text-[12px] leading-relaxed
                     bg-ink-900/[0.03] dark:bg-chalk/[0.04]
                     border border-line dark:border-line-dark rounded-md
                     px-4 py-3 text-ink-800 dark:text-chalk overflow-x-auto"
        >
{`# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash`}
        </pre>
        <div className="flex items-center justify-center gap-3">
          <PrimaryButton onClick={onRetry}>Retry detection</PrimaryButton>
          <SecondaryButton onClick={onOpenInstallDocs}>Open docs</SecondaryButton>
        </div>
      </div>
    )
  }

  if (status.state === 'unauthed') {
    return (
      <div className="flex flex-col items-center gap-5 w-full">
        <p className="text-[13px] text-ink-700 dark:text-chalk-dim text-center">
          Found <span className="font-mono">{status.binaryPath}</span> ({status.version}).
          <br />
          You need to sign in once before agents can run.
        </p>
        <div className="flex items-center justify-center gap-3">
          <PrimaryButton onClick={onOpenSignIn}>Sign in with Claude</PrimaryButton>
          <SecondaryButton onClick={onRetry}>I&apos;ve signed in — retry</SecondaryButton>
        </div>
        <p className="text-[11px] text-ink-400 dark:text-chalk-subtle text-center max-w-[440px]">
          Opens claude.ai in your browser. After signing in, run{' '}
          <span className="font-mono">claude login</span> in your terminal once,
          then click retry.
        </p>
      </div>
    )
  }

  if (status.state === 'error') {
    return (
      <div className="flex flex-col items-center gap-5 w-full">
        <p className="text-[13px] text-state-failed text-center">{status.message}</p>
        <PrimaryButton onClick={onRetry}>Retry detection</PrimaryButton>
      </div>
    )
  }

  return null
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-drag inline-flex items-center gap-2 px-4 py-2 rounded-md
                 border border-ink-900/30 dark:border-chalk/30
                 hover:border-ink-900 dark:hover:border-chalk
                 hover:-translate-y-0.5 hover:shadow-sm
                 active:scale-[0.985] active:translate-y-0
                 transition-all duration-200 ease-quart-out
                 font-display font-semibold text-[12.5px]
                 text-ink-900 dark:text-chalk bg-bone dark:bg-coal"
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-drag inline-flex items-center gap-2 px-4 py-2 rounded-md
                 border border-line dark:border-line-dark
                 hover:border-ink-500 dark:hover:border-chalk-dim
                 transition-all duration-200 ease-quart-out
                 font-display text-[12.5px]
                 text-ink-700 dark:text-chalk-dim bg-bone dark:bg-coal"
    >
      {children}
    </button>
  )
}
