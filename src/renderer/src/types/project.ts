import type { Agent } from './agent'
import type { ClaudeModel } from '../components/ModelPicker'

/**
 * A "tab" — one open project. The app holds an array of these plus the id of
 * the active one. Each project has its own agents, selected agent, and model
 * choice so switching tabs preserves your context.
 */
export interface ProjectTab {
  /** Stable id, generated on open. */
  id: string
  /** Absolute path the user picked / opened. */
  path: string
  /** Last segment of path — display name. */
  repoName: string
  /** True if `path` is a git working tree. Drives the "spawn needs git" gate. */
  isGitRepo: boolean
  /** True if `path/index.html` exists at the project root. Drives the
   *  preview affordance (not yet built). */
  hasIndexHtml: boolean
  /** HEAD SHA at open time. Empty for non-git. */
  baseSha: string
  /** Per-tab agent list. */
  agents: Agent[]
  /** Currently selected agent in this tab. */
  selectedAgentId: string | null
  /** Per-tab model choice. */
  model: ClaudeModel
}
