# Agent Farm — Path to v1.0

A dependency-ordered list of everything that has to happen to take agent-farm from "beautiful shell + working CLI" to "polished Mac app I can confidently market."

Estimates are rough. Most items in the same phase can run in parallel only if I'm willing to push back on the dependency arrows. Items below a phase line **cannot** start until everything above them lands.

---

## Status today

| layer | shipped | notes |
|---|---|---|
| CLI (Node, root) | v0.0.5 | Spawns claude in worktrees end-to-end. Stream-json parsing. State.json + JSONL logs. Works in production for me right now. |
| Marketing site | live at `website-topaz-phi-53.vercel.app` | Pure tinted B/W, asymmetric layout, Geist + JetBrains Mono. |
| Desktop app shell | UI complete, no real work happens yet | Welcome screen, agent list, main panel, prompt bar, status strip, model picker, Create-project modal. All static + stubbed. |

The desktop app **looks like the thing**. It is not yet **the thing**. That gap is what this roadmap closes.

---

## PHASE A — Foundations (must exist before anything moves)

These are the unsexy pieces that everything else needs. ~1-2 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| A1 | **Typed IPC contracts** in `desktop/src/shared/ipc.ts` | nothing | 0.5d | Single source of truth for every channel. Importable from main + preload + renderer. Without this every IPC call is unsafe and untyped. |
| A2 | **Settings store** in `desktop/src/main/settings.ts` (electron's `app.getPath('userData')` + atomic JSON write) | A1 | 0.5d | Persist recent projects, model preference, window state. Required by A4, B2, F4. |
| A3 | **Main-process logger** writing to `userData/logs/agentfarm.log` | A1 | 0.25d | Without this every main-process bug is invisible to the user. |
| A4 | **Preload bridge** `desktop/src/preload/index.ts` exposing typed `window.agentFarm.*` | A1 | 0.5d | All renderer-to-main calls flow through here. contextIsolation + ipcRenderer.invoke pattern. |

Critical path: **A1 → A4** before any IPC work in B/C is possible.

---

## PHASE B — Project lifecycle (open / create / pick a project)

The user has to be able to point the app at a project before the agent runtime matters. ~1-2 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| B1 | **Open project**: `dialog.showOpenDialog` → returns absolute path → main verifies it's a git repo via `git rev-parse --show-toplevel`, gets repoName + base SHA + dirty flag → renderer enters session view | A4 | 0.5d | Replaces the welcome-screen alert. THE most-needed feature; without it the app does nothing. |
| B2 | **Recent projects** persisted to settings (last 8). Welcome screen shows a fourth section listing them with hover → enter, ⌫ to forget. | A2, B1 | 0.5d | Standard Mac app pattern. Removes the need to re-pick on every launch. |
| B3 | **Create project**: when modal Create is hit, main runs `mkdir parentFolder/name`, `git init`, scaffolds template (Empty = empty file + .gitignore; Next.js = `npx create-next-app` with tracked output streamed back), then enters session. | A4 | 1d | The Create modal works visually but does nothing. This wires it to disk. |
| B4 | **Open GitHub project**: paste-URL modal → `git clone <url> <parentFolder>/<repoName>` → on success enter session. Show clone progress in modal. | A4 | 0.5d | The third welcome card lights up. |
| B5 | **Project switcher** (cmd+P): fuzzy-find recent projects in a Spotlight-style overlay. Optional but standard for pro tools. | A2, B2 | 0.5d | Quality of life; not a v1 blocker. |

Critical path: **B1** is the unblock. B2/B3/B4 can ship in any order after.

---

## PHASE C — Agent runtime (the actual product)

This is the biggest and the most important. ~3-4 days. Everything in this phase makes the difference between "shell" and "tool I can use".

| # | item | depends on | effort | why |
|---|---|---|---|---|
| C1 | **Port `runner.js` → `desktop/src/main/runner.ts`** in TypeScript. Same logic, same behavior. | A1, A4 | 1d | The CLI's runner is battle-tested. Don't rewrite — port. |
| C2 | **Port `streamparser.js` → `desktop/src/main/stream-parser.ts`** in TypeScript. | A1 | 0.25d | Same as above. |
| C3 | **Port `state.js` → `desktop/src/main/session-state.ts`** in TypeScript. State stays in-memory in main; persisted to `<projectPath>/.agent-farm/state.json` (same shape as CLI so they interop). | A1 | 0.5d | Important: keep file format compatible so a CLI session is readable by the desktop app and vice versa. |
| C4 | **Port `queue.js` → `desktop/src/main/queue.ts`** (Semaphore). | nothing | 0.1d | 30 lines of code. |
| C5 | **Port `git.js` worktree wrappers → `desktop/src/main/git.ts`** in TypeScript. | A1 | 0.25d | Same as above. |
| C6 | **`agent.spawn(projectPath, prompt, model)` IPC handler** in main. Slugifies, creates worktree, spawns claude through C1, returns agent id. | C1, C2, C3, C4, C5 | 0.25d | The keystone. |
| C7 | **`agent.kill(id)` IPC handler**. SIGTERM the child PID. | C3 | 0.1d | Required for the cancel-button UI. |
| C8 | **Event subscription channel**: `window.agentFarm.onAgentEvent(cb)` → main pushes events on `agentEvent` IPC channel → renderer reconciles into local agent state. Throttle to 60fps. | C3, A4 | 0.5d | This is what makes the right pane LIVE. |
| C9 | **Renderer wires real spawn**: `App.handleSubmit()` calls C6, subscribes to C8, removes the stub. Live elapsed timer ticks via local `setInterval` driven by start time. | B1, C6, C8 | 0.5d | The moment the app becomes real. |
| C10 | **Cancel agent button** on each row in the agent list (visible on hover when state=running). Calls C7 with confirm. | C7, C9 | 0.25d | Necessary for the case when claude goes off the rails. |
| C11 | **Session resume on app restart**: on session view mount, read `<projectPath>/.agent-farm/state.json`, hydrate. Detect orphaned `state=running` agents whose PIDs are dead, mark them failed. | C3 | 0.25d | Otherwise a crash loses everything. |

Critical path: **C1 → C6 → C9**. C9 is the moment. After C9, the app is functionally complete for one user spawning agents.

---

## PHASE D — Review + cherry-pick (the completion of the workflow)

Spawning is half the loop. Reviewing diffs and cherry-picking is the other half. ~2-3 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| D1 | **Diff fetch** IPC handler: `agent.diff(id)` returns `{ files: [{path, hunks: [...]}] }` parsed from `git diff <baseSha>..HEAD` in the worktree. | C5, C9 | 0.5d | Foundation for D2. |
| D2 | **DiffView component** in renderer — file tree on the left, side-by-side hunks on the right. Use `react-diff-viewer-continued` (free, MIT, unstyled) and theme it with our tokens. | D1 | 1d | What replaces the current "tail" pane when an agent finishes. |
| D3 | **Cherry-pick action**: `agent.cherryPick(id)` IPC → main runs `git cherry-pick <branch> --no-commit`, returns conflict files if any. | C5 | 0.25d | The button that makes the work matter. |
| D4 | **Conflict UI**: when D3 returns conflicts, show modal with file list, "open in editor" / "abort" / "use --theirs" choices. | D3 | 0.5d | Necessary for the realistic case. Without it, conflicts dead-end the user. |
| D5 | **Cleanup options** after cherry-pick: keep worktree / remove worktree / keep branch / remove branch. Settings has a default behavior (default: remove on success, keep on conflict). | A2, D3 | 0.25d | Otherwise the user accumulates worktrees. |
| D6 | **"Skip" action** for agents whose work the user doesn't want. Marks state=skipped, optionally removes worktree. | D5 | 0.1d | The non-cherry-pick path. |

Critical path: **D1 → D2 → D3**. D2 is the second-most-important UI in the app.

---

## PHASE E — Operational quality (so it works for someone who isn't me)

Things any engineer downloading the DMG will hit on day one. ~1-2 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| E1 | **Claude CLI detection** on app launch: PATH check, version check, `claude config get` to confirm auth. If missing → blocking onboarding screen with install instructions and a retry button. | A4 | 0.5d | The most common first-launch failure. Without this, the app silently doesn't work. |
| E2 | **Error toast system** (use sonner — free, MIT) for IPC failures, spawn errors, git errors. Replace every `alert()` and silent failure. | A4 | 0.25d | Currently every error is an alert or silent. |
| E3 | **Loading states** for: project open, project create, git clone, agent spawn (between submit and first event). | C9 | 0.5d | Currently any operation looks frozen. |
| E4 | **Empty / error states** for: no recent projects, project has no agents yet, agent has no diff (no-op result), claude returned an error. | C9, D2 | 0.5d | Already partially in place; needs an audit pass. |
| E5 | **Keyboard shortcuts**: ⌘N new project, ⌘O open project, ⌘W close session, ⌘K clear input, ⌘↵ spawn, esc abort. | C9 | 0.5d | Pro-tool feel. Standard Mac patterns. |
| E6 | **Accessibility audit**: visible focus rings, aria labels on icon-only buttons, role attributes on dropdowns/modals, screen-reader announcements for state transitions. | E5 | 0.5d | Required to claim "polished". |

Critical path: **E1** is the only blocker for shipping; the rest are quality.

---

## PHASE F — Polish (the difference between "works" and "Mac-native")

These are the things people notice subconsciously. Cumulatively they make the app feel native rather than Electron-y. ~2-3 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| F1 | **App icon set** — `.icns` for the dock, dock badge support, icon for DMG. | nothing | 0.5d | First thing users see. Currently using Electron default. |
| F2 | **Native macOS menu bar** — File, Edit, View, Window, Help with proper roles + shortcuts (Cut/Copy/Paste, Window/Minimize, About, Hide). Build via `Menu.setApplicationMenu(...)`. | A4 | 0.5d | Without this, the menu bar shows weird browser-default options. Big tell that an app is amateur. |
| F3 | **About panel** — `app.setAboutPanelOptions(...)` with version, license, copyright, GitHub link. | F2 | 0.1d | One line; satisfies macOS conventions. |
| F4 | **Settings panel** (separate window or sidebar) — default model, default `--max`, theme override (auto/light/dark), default project parent folder, cost-cap warning threshold. Persisted via A2. | A2, F2 | 1d | Required for "I'd actually use this". |
| F5 | **Light/dark manual toggle** in settings (currently auto via prefers-color-scheme only). | F4 | 0.1d | Standard expectation. |
| F6 | **Cost-limit safeguard**: if per-session cost exceeds threshold from F4, show a confirmation toast before next spawn. Optional kill-switch. | F4, C8 | 0.5d | One bad prompt loop on Opus can cost $5+. People will trust the app more if this exists. |
| F7 | **Window state persistence** — remember last position + size + maximized. | A2 | 0.25d | Tiny, but its absence is annoying. |
| F8 | **Dock badge** showing count of running agents. | A4 | 0.25d | Nice for when the app is in the background. |
| F9 | **Unobtrusive update prompt** — `electron-updater` checks GitHub releases. Notification toast on new version. | F2, G3 | 0.5d | Required so users don't sit on stale builds. |

Critical path: **F1, F2, F4** are the must-have polish; F5-F9 are nice-to-have.

---

## PHASE G — Distribution (so people can actually install it)

Without this, the "Download for macOS" button on the marketing site goes to a no-releases page. ~1-2 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| G1 | **Apple Developer ID** ($99/year). Generate "Developer ID Application" cert, install in keychain. | nothing | 0.25d (mostly waiting on Apple) | Without this, the DMG triggers a Gatekeeper warning on first launch. Users won't install it. |
| G2 | **electron-builder signing** — set `CSC_LINK`, `CSC_KEY_PASSWORD`. Update `electron-builder.yml`. | G1 | 0.25d | Already configured for unsigned; flip the switch. |
| G3 | **Notarization** — set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. electron-builder uploads automatically post-build. | G2 | 0.25d | Required for first-launch experience to be smooth. |
| G4 | **GitHub Release** with the signed + notarized DMG attached, version-tagged. | G3 | 0.1d | What the marketing-site download button actually downloads. |
| G5 | **Auto-update channel** wired to GitHub Releases via `electron-updater`. | F9, G4 | 0.5d | Lets us ship fixes without users reinstalling. |
| G6 | **CI to build releases** on git tag push (GitHub Actions, `macos-14` runner). Outputs DMG + checksum + auto-upload to draft Release. | G4 | 0.5d | So I'm not building DMGs by hand on my laptop. |

Critical path: **G1 → G2 → G3 → G4**. G6 is recommended for sanity but optional for v1.

---

## PHASE H — Marketing for v1 (so people find it)

Once the app actually works and ships, this is what gets it noticed. ~3-5 days.

| # | item | depends on | effort | why |
|---|---|---|---|---|
| H1 | **Real screenshots** of the working app (welcome, mid-spawn with 3 running agents, diff view, cherry-pick) replace the current ASCII mock on the marketing site. | C9, D2 | 0.5d | The current site shows a fake terminal. Real screenshots convert better. |
| H2 | **Demo video** (~30 sec) — type a task, watch agent spawn, see diff, cherry-pick. Use `obs` or `cleanshot`. Embed on landing page. | C9, D2 | 0.5d | Single most powerful conversion artifact. |
| H3 | **Custom domain** for marketing site (e.g. `agentfarm.dev`, `agent.farm`) | nothing | 0.25d | The Vercel `.vercel.app` URL is fine for soft launch but not for a real launch. |
| H4 | **Documentation site** at `docs.agentfarm.dev` (or `/docs` on the main site). Pages: install, first project, how cherry-pick works, FAQ, troubleshooting (claude not found, auth errors, etc.). Use Nextra or Astro Starlight. | nothing | 1d | Required for support self-service. |
| H5 | **Changelog** (`CHANGELOG.md` in repo, render in app's About panel and on marketing site). | F3 | 0.25d | Conventional. |
| H6 | **Show HN / Product Hunt drafts** — post copy, screenshots, response prep. | H1, H2, G4 | 0.5d | Soft launch. |
| H7 | **Twitter/X demo thread** — single video tweet with download link. | H1, H2, G4 | 0.25d | Where dev tools currently get traction. |

Critical path: **H1 + H2 + G4** are the launch requirements. H3-H7 can layer on after.

---

## Summary: the critical path to v1.0

If I executed strictly along the critical path, no parallelism:

1. **A1 → A4** — IPC scaffold (1d)
2. **B1** — Open project (0.5d)
3. **C1 → C6 → C9** — Agent runtime up to live spawn (2.5d)
4. **D1 → D2 → D3** — Diff + cherry-pick (1.75d)
5. **E1** — Claude detection / onboarding (0.5d)
6. **F1, F2, F4** — Icon + menu + settings (1.6d)
7. **G1 → G4** — Sign + notarize + ship DMG (0.85d, plus Apple cert wait)
8. **H1, H2** — Real screenshots + video, update site (1d)

**~10 working days** of focused execution. Realistic calendar: 3 weeks.

---

## v2 backlog (after v1 ships)

Things I'd want eventually but that don't gate v1:

- Multi-window support (separate session per window)
- PTY-based agent spawn so claude's slash commands work end-to-end inside the app (uses `node-pty` + `xterm.js`)
- Multi-model side-by-side comparison ("run this prompt against Opus AND Sonnet")
- Linear / GitHub issue import: "agent-farm this ticket" from a paste
- Team workspaces (shared sessions, but state still local; sync via the user's chosen storage)
- Crash reporting (Sentry, opt-in)
- Anonymous usage telemetry (opt-in)
- Windows + Linux builds (the CLI already works on both; the desktop app would need testing)

---

*Living document. Update as we go.*
