import { useState } from 'react'
import clsx from 'clsx'
import { EmbeddedTerminal } from './EmbeddedTerminal'
import { FilesView } from './FilesView'
import { DiffView } from './DiffView'

interface RightPanelProps {
  /** The project tab this panel belongs to. Used as the React key so the
   *  whole tree (including the embedded terminal) remounts when switching
   *  projects — that kills the previous project's pty cleanly. */
  projectId: string
  projectPath: string
  isGitRepo: boolean
  /** User's login shell, surfaced via window.agentFarm.shell. */
  shell: string
}

type Tab = 'diff' | 'terminal' | 'files'

/**
 * 3-tab right side panel: Diff / Terminal / Files. All three are kept
 * mounted so the embedded terminal preserves its session as the user
 * toggles between tabs; only one is `display: block` at a time.
 */
export function RightPanel({
  projectId,
  projectPath,
  isGitRepo,
  shell,
}: RightPanelProps) {
  // Default to Files now that the middle pane is the live claude shell —
  // opening the right panel is more useful for file-tree / diff context.
  const [tab, setTab] = useState<Tab>('files')

  return (
    <div
      key={projectId}
      className="h-full flex flex-col bg-bone dark:bg-coal border-l border-line dark:border-line-dark min-w-0"
    >
      <TabBar active={tab} onChange={setTab} isGitRepo={isGitRepo} />

      <div className="flex-1 min-h-0 relative">
        <Pane visible={tab === 'diff'}>
          <DiffView projectPath={projectPath} isGitRepo={isGitRepo} />
        </Pane>
        <Pane visible={tab === 'terminal'}>
          <TerminalPane projectId={projectId} projectPath={projectPath} shell={shell} />
        </Pane>
        <Pane visible={tab === 'files'}>
          <FilesView projectPath={projectPath} />
        </Pane>
      </div>
    </div>
  )
}

function Pane({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  // Absolute fill — keeps the terminal mounted while inactive so its xterm
  // canvas and pty session survive tab switches. We hide via visibility +
  // pointer-events so layout stays stable.
  return (
    <div
      className="absolute inset-0"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      aria-hidden={!visible}
    >
      {children}
    </div>
  )
}

function TabBar({
  active,
  onChange,
  isGitRepo,
}: {
  active: Tab
  onChange: (t: Tab) => void
  isGitRepo: boolean
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line dark:border-line-dark">
      <TabButton active={active === 'diff'} onClick={() => onChange('diff')} disabled={!isGitRepo} title={isGitRepo ? 'Diff against HEAD' : 'not a git repo'}>
        Diff
      </TabButton>
      <TabButton active={active === 'terminal'} onClick={() => onChange('terminal')}>
        Terminal
      </TabButton>
      <TabButton active={active === 'files'} onClick={() => onChange('files')}>
        Files
      </TabButton>
    </div>
  )
}

function TabButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'no-drag px-3 py-1 rounded-md font-display text-[12px] transition-all duration-150',
        active
          ? 'bg-bone-raised dark:bg-coal-raised text-ink-900 dark:text-chalk font-semibold border border-ink-900/30 dark:border-chalk/30'
          : 'border border-transparent text-ink-500 dark:text-chalk-dim font-medium hover:text-ink-900 dark:hover:text-chalk hover:bg-bone-raised dark:hover:bg-coal-raised',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Plain shell terminal — the user's `$SHELL` (zsh / bash), NOT claude. The
 * claude REPL already lives in the middle pane; this side terminal is for
 * regular bash commands (`ls`, `git log`, `npm test`, …) while you watch
 * claude work.
 */
function TerminalPane({
  projectId,
  projectPath,
  shell,
}: {
  projectId: string
  projectPath: string
  shell: string
}) {
  return (
    <div className="h-full w-full p-2">
      <EmbeddedTerminal
        key={projectId}
        spawn={{
          command: shell,
          // -l = login shell so the user's profile/.zshrc loads. -i would
          // also work but -l gives the closer-to-Terminal.app experience.
          args: ['-l'],
          cwd: projectPath,
          cols: 80,
          rows: 24,
        }}
      />
    </div>
  )
}
