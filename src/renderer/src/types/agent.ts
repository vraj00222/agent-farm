export type AgentState = 'queued' | 'running' | 'done' | 'noop' | 'failed'

export interface Agent {
  id: string
  /** Display name derived from the prompt — first ~50 chars, no trailing punctuation. */
  name: string
  /** Short slug used for the branch + worktree path. */
  slug: string
  branch: string
  worktreePath: string
  prompt: string
  state: AgentState
  startedAt: number | null
  endedAt: number | null
  elapsedMs: number | null
  exitCode: number | null
  pid: number | null
  commits: string[]
  filesChanged: string[]
  autoCommitted: boolean
  lastLines: string[]
  error?: string | null
  usage: {
    cost: number | null
    inputTokens: number | null
    outputTokens: number | null
    numTurns: number | null
  } | null
}

export interface SessionMeta {
  baseSha: string
  repoName: string
  claudeVersion: string | null
  model: string | null
}
