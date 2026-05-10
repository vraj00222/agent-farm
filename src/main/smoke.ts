/* eslint-disable no-console */
/**
 * Headless smoke. Activated by AGENTFARM_SMOKE=1 in the main entry point.
 * Exercises:
 *   - claude.detect end-to-end
 *   - inspectPath against a git repo, a non-git dir, a missing path
 *   - settings persistence (recent projects)
 *
 * Exits the app with code 0 on full success, 1 on any failure.
 */
import { app } from 'electron'
import { mkdtempSync, rmSync, existsSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ClaudeStatus, ProjectOpenResult } from '../shared/ipc'

const exec = promisify(execFile)

interface SmokeDeps {
  detectClaude(): Promise<ClaudeStatus>
  inspectPath(path: string): Promise<ProjectOpenResult>
}

export async function runSmoke({ detectClaude, inspectPath }: SmokeDeps): Promise<number> {
  // Override userData so the smoke writes to a throwaway dir.
  const tmpUserData = mkdtempSync(join(tmpdir(), 'agentfarm-smoke-'))
  app.setPath('userData', tmpUserData)

  const failures: string[] = []
  function check(name: string, ok: boolean, detail = ''): void {
    const tag = ok ? 'PASS' : 'FAIL'
    console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(name)
  }

  // 1. claude.detect returns a sane shape
  try {
    const status = await detectClaude()
    check(
      'claude.detect returns known state',
      ['ok', 'unauthed', 'missing', 'error'].includes(status.state),
      `state=${status.state}`,
    )
  } catch (err) {
    check('claude.detect runs without throw', false, (err as Error).message)
  }

  // Build a real git repo. macOS tmpdir() lives under /var/folders, but
  // git rev-parse returns /private/var/folders — same dir, different prefix.
  // Resolve with fs.realpath so we can compare strings.
  const repoDir = await fs.realpath(mkdtempSync(join(tmpdir(), 'agentfarm-repo-')))
  await exec('git', ['init', '-q'], { cwd: repoDir })
  await fs.writeFile(join(repoDir, 'README.md'), '# smoke\n')

  // 2. inspectPath happy path
  const okR = await inspectPath(repoDir)
  check(
    'inspectPath ok on git repo',
    okR.ok === true && (okR as Extract<ProjectOpenResult, { ok: true }>).project.path === repoDir,
    okR.ok ? `repoName=${okR.project.repoName} dirty=${okR.project.dirty}` : okR.reason,
  )

  // 3. inspectPath non-git
  const plainDir = mkdtempSync(join(tmpdir(), 'agentfarm-plain-'))
  const plainR = await inspectPath(plainDir)
  check(
    'inspectPath rejects non-git dir',
    plainR.ok === false && plainR.reason === 'not_a_git_repo',
    plainR.ok ? '(ok??)' : plainR.reason,
  )

  // 4. inspectPath missing
  const missingR = await inspectPath(join(tmpdir(), 'definitely-does-not-exist-' + Date.now()))
  check(
    'inspectPath rejects missing path',
    missingR.ok === false && missingR.reason === 'unreadable',
    missingR.ok ? '(ok??)' : missingR.reason,
  )

  // 5. settings.json persisted with the repo
  const settingsFile = join(tmpUserData, 'settings.json')
  // Settings writes are serialized through a chain; give the chain a tick.
  await new Promise((r) => setTimeout(r, 50))
  check('settings.json was written', existsSync(settingsFile), settingsFile)
  if (existsSync(settingsFile)) {
    const settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    check(
      'recent project recorded after open',
      Array.isArray(settings.recentProjects) &&
        settings.recentProjects.some((r: { path: string }) => r.path === repoDir),
      `count=${settings.recentProjects?.length ?? 0}`,
    )
  }

  // Cleanup
  rmSync(repoDir, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
  rmSync(tmpUserData, { recursive: true, force: true })

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`)
    return 1
  }
  console.log('\nall smoke checks passed')
  return 0
}
