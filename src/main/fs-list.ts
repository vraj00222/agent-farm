import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { FsEntry, FsListOptions, FsListResult } from '../shared/ipc'

/** Folders we never recurse into — too noisy, too big, almost never useful
 *  when scanning a project tree from a UI. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.expo',
  'dist',
  'build',
  'out',
  '.idea',
  '.vscode',
  '__pycache__',
  '.venv',
  'venv',
  'target', // rust
  'Pods', // ios
  'DerivedData', // xcode
])

const DEFAULT_MAX_DEPTH = 3
const DEFAULT_MAX_ENTRIES = 600

export async function listProjectTree(
  rootPath: string,
  opts: FsListOptions = {},
): Promise<FsListResult> {
  const maxDepth = Math.max(1, Math.min(8, opts.maxDepth ?? DEFAULT_MAX_DEPTH))
  const maxEntries = Math.max(20, Math.min(5000, opts.maxEntries ?? DEFAULT_MAX_ENTRIES))

  try {
    const stat = await fs.stat(rootPath)
    if (!stat.isDirectory()) {
      return { ok: false, reason: 'not a directory' }
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  const state = { count: 0, capped: false }

  const root: FsEntry = {
    name: basename(rootPath) || rootPath,
    path: rootPath,
    kind: 'dir',
    children: await readDir(rootPath, 1, maxDepth, maxEntries, state),
  }

  return { ok: true, root, totalEntries: state.count, capped: state.capped }
}

async function readDir(
  dir: string,
  depth: number,
  maxDepth: number,
  maxEntries: number,
  state: { count: number; capped: boolean },
): Promise<FsEntry[]> {
  if (state.count >= maxEntries) {
    state.capped = true
    return []
  }

  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  // Stable sort: dirs first, then files, both alphabetical.
  entries.sort((a, b) => {
    const ad = a.isDirectory()
    const bd = b.isDirectory()
    if (ad !== bd) return ad ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const out: FsEntry[] = []
  for (const e of entries) {
    if (state.count >= maxEntries) {
      state.capped = true
      break
    }
    if (e.name.startsWith('.DS_Store')) continue
    const isDir = e.isDirectory()
    if (isDir && SKIP_DIRS.has(e.name)) continue

    const entry: FsEntry = {
      name: e.name,
      path: join(dir, e.name),
      kind: isDir ? 'dir' : 'file',
    }
    state.count += 1

    if (isDir) {
      if (depth >= maxDepth) {
        entry.truncated = true
      } else {
        entry.children = await readDir(
          entry.path,
          depth + 1,
          maxDepth,
          maxEntries,
          state,
        )
      }
    }

    out.push(entry)
  }
  return out
}
