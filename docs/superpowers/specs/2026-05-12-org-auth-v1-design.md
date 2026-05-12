# org-auth-v1 — design

**Date:** 2026-05-12
**Status:** Approved, ready for implementation plan
**Scope:** First-launch authorization flow for Anthropic + GitHub. Replaces the broken `claude /login` xterm flow and adds GitHub Device Flow OAuth.

---

## Problem

Two distinct problems we are solving in one cohesive onboarding step:

1. **Anthropic sign-in hangs.** Today the app spawns `claude` in an embedded xterm and auto-types `/login\r` immediately. The REPL isn't ready to receive input when we write, so `/login` is silently dropped (or interpreted as part of the welcome banner). The user is stuck staring at an interactive `claude` prompt with no way forward. Paste-back of the OAuth code is also brittle and the "Done — recheck" button has no signal that `~/.claude.json` has actually been updated.
2. **GitHub access is anonymous.** "Clone from GitHub URL" runs `git clone` with no auth. Private repos only work if the user already has `gh` or SSH keys configured. There's no in-app identity for GitHub, so we can't list a user's repos, show "Signed in as @user", or guarantee the clone will succeed.

## Goal

After a user downloads the `.dmg` and launches Agent Farm for the first time:

- They're asked to authorize **Anthropic** (Claude Pro/Max detection) — and the flow actually completes.
- They're asked to authorize **GitHub** via Device Flow — granting `repo` + `read:user` so the app can clone private repos and identify the user.
- Both auths are **required** before they reach the welcome screen.
- The title bar shows two badges: `Vraj Patel · Pro` and `@vrajpatel · GitHub`.

## Non-goals (v1)

- Anthropic Console API key auth (org billing). We rely on `claude /login` and read `seatTier` from `~/.claude.json`. If users want Console billing later, that's v2.
- GitHub org SAML SSO. We assume personal GitHub accounts; org access via the user's normal GitHub permissions.
- GitHub App (vs OAuth App). Acting *as* an app on PRs is out of scope; we act as the user via OAuth.
- Token refresh / rotation. Anthropic & GitHub device-flow tokens don't expire on a useful cadence. We re-auth on 401.

---

## Architecture

### Files

| Layer | Modified | New |
|---|---|---|
| Main | `src/main/claude.ts`, `src/main/index.ts`, `src/main/settings.ts` | `src/main/claude-auth.ts`, `src/main/github-auth.ts`, `src/main/secrets.ts` |
| Preload | `src/preload/index.ts` | — |
| Shared | `src/shared/ipc.ts` | — |
| Renderer | `src/renderer/src/App.tsx`, `src/renderer/src/components/Onboarding.tsx`, `src/renderer/src/components/ClaudeLoginPanel.tsx`, `src/renderer/src/components/CloneGitHubModal.tsx` | `src/renderer/src/components/GitHubLoginPanel.tsx` |

### Module boundaries

- **`claude-auth.ts`** — owns the "make claude become signed in" routine. Public API: `runClaudeLogin(): Promise<{ ok: boolean; reason?: string }>`. Internally tries non-REPL `claude login` / `claude setup-token` first, then the smart xterm wrapper, with the Terminal.app escape hatch surfaced to the UI on demand.
- **`github-auth.ts`** — owns Device Flow. Public API: `startDeviceFlow(): Promise<{ userCode, verificationUri, deviceCode }>` + `pollForToken(deviceCode, interval): Promise<{ token, user }>` + `revoke(token)`. Pure fetch calls, no UI.
- **`secrets.ts`** — thin wrapper around Electron's `safeStorage`. Public API: `encrypt(plain): string | null` + `decrypt(cipher): string | null`. Null returns mean "not available; tell the user." Everything else just treats results as opaque.
- **`settings.ts`** — extended with `github` block in the on-disk JSON (see Storage shape below).

---

## Anthropic — auth fix

Three layers, tried in order. First success wins.

### Layer 1 — non-REPL subcommand probe

On `runClaudeLogin()` entry, attempt:

```bash
claude login --help 2>&1
```

If output describes a real `login` subcommand (not "Unknown command"), run:

```bash
claude login
```

with stdio inherited into a hidden `BrowserWindow`-backed PTY. Exit 0 + `~/.claude.json` containing `oauthAccount` = success.

If `claude login` isn't a real subcommand on this version, fall through.

### Layer 2 — smart xterm wrapper

Replaces the current `EmbeddedTerminal` flow inside `ClaudeLoginPanel`. The panel keeps its existing chrome (title, cancel/recheck buttons) but the spawn logic moves into `claude-auth.ts`:

1. Spawn `claude` in a `node-pty` session with `cols=100, rows=28`.
2. Buffer stdout. Wait for the **prompt-ready sentinel** — a regex that matches the framed input box claude draws once the REPL is interactive. Initial candidate: `/╭─+╮[\s\S]*?│ > /` (the boxed input). We will refine against real captured output during implementation.
3. Once ready, write `/login\r`.
4. Continue parsing stdout. Detect:
   - **OAuth URL** — regex `/(https?:\/\/(?:console\.anthropic\.com|claude\.ai)\/[^\s]+)/`. On first match, call `shell.openExternal(url)`. The user no longer has to spot the URL and copy it.
   - **Success sentinel** — case-insensitive match for any of `Logged in`, `Successfully authenticated`, `You can close this terminal`. We will tune based on actual output.
5. On success: send `Ctrl-C` (`\x03`) to claude, wait up to 3s for the PTY to exit, then poll `~/.claude.json` mtime for up to 3s more. Once observed, call `detectClaude()` and resolve.
6. On user cancel (Esc / Close button): kill PTY; resolve `{ ok: false, reason: 'cancelled' }`.

Output from steps 2–4 is also streamed to xterm.js so the user can see what's happening. The improvement is that we drive the flow rather than relying on the user.

### Layer 3 — Terminal.app escape hatch

Visible in the panel as `Having trouble? Open in Terminal.app instead`. Runs:

```bash
osascript -e 'tell application "Terminal" to do script "claude /login"'
```

Then watches `~/.claude.json` via `fs.watch` for the next change. On change, re-detect; if `state === 'ok'`, dismiss the panel automatically.

### Tier detection

Already implemented in `readAccount()` in `claude.ts`. No changes to detection — just the new pathway that gets us to "authed" state more reliably.

---

## GitHub — Device Flow

### Endpoints

```
POST  https://github.com/login/device/code
POST  https://github.com/login/oauth/access_token
GET   https://api.github.com/user
```

### Constants

```ts
// shipped in src/main/github-auth.ts
const GITHUB_CLIENT_ID = '<paste-from-OAuth-App>'  // baked at build
const GITHUB_SCOPES = 'repo read:user'
```

### Flow

1. **Start.** Renderer calls `github.startDeviceFlow()` via IPC. Main:
   ```
   POST /login/device/code
     client_id=$CLIENT_ID & scope=repo read:user
   → { device_code, user_code, verification_uri, expires_in, interval }
   ```
   Return `{ userCode, verificationUri, deviceCode, interval, expiresIn }` to renderer.

2. **Display.** `GitHubLoginPanel` renders:
   - The 8-char `user_code` in a large monospace block, with a copy button.
   - A primary "Open GitHub & enter code" button → `shell.openExternal(verification_uri)`.
   - A live countdown of `expires_in`.

3. **Poll.** Renderer calls `github.pollForToken(deviceCode, interval)` once. Main process polls:
   ```
   POST /login/oauth/access_token
     client_id=$CLIENT_ID & device_code=$DC & grant_type=urn:ietf:params:oauth:grant-type:device_code
   ```
   - `{ error: 'authorization_pending' }` → wait `interval` seconds, retry.
   - `{ error: 'slow_down' }` → bump interval by 5s per RFC 8628, retry.
   - `{ error: 'expired_token' | 'access_denied' }` → resolve `{ ok: false, reason }`.
   - `{ access_token, token_type, scope }` → success. Continue.

4. **Identify.**
   ```
   GET /user
     Authorization: token $access_token
   → { login, name, avatar_url, ... }
   ```

5. **Persist.** Encrypt `access_token` via `safeStorage`. Write to `settings.json`:
   ```jsonc
   {
     "github": {
       "login": "vrajpatel",
       "name": "Vraj Patel",
       "avatarUrl": "https://avatars.githubusercontent.com/u/...",
       "tokenCiphertext": "<base64>"
     }
   }
   ```
   Plaintext token kept in main-process memory only.

6. **Notify.** Emit `IPC.GitHubStatus` with `{ state: 'ok', login, name, avatarUrl }`. Renderer updates the chip + dismisses the panel.

### Git integration

`project.cloneAuthed(url, parentDir)` IPC handler (new — replaces / extends existing `cloneGitHub`):

```ts
const auth = `x-access-token:${plaintextToken}`
const b64 = Buffer.from(auth).toString('base64')
await exec('git', [
  '-c', `http.https://github.com/.extraheader=Authorization: Basic ${b64}`,
  'clone', url, dest,
])
```

The `-c` config is process-scoped only. It never reaches the cloned repo's `.git/config`. After clone, the repo can still be used by the user with their own credentials.

### Re-auth on 401

Any IPC handler that hits `api.github.com` checks for 401. If 401, clear `tokenCiphertext`, emit `GitHubStatus { state: 'unauthed' }`, and surface a toast: "GitHub session expired — re-authorize?" Clicking opens `GitHubLoginPanel`.

---

## Onboarding state machine

```
                       ┌─────────────────────────┐
                       │   Onboarding gate       │
                       │   (App.tsx)             │
                       └────────┬────────────────┘
                                │
                  ┌─────────────┴──────────────┐
                  ▼                            ▼
        ClaudeStatus.state          GitHubStatus.state
        ──────────────────          ──────────────────
        loading       → spinner
        missing       → install screen
        error         → retry screen
        unauthed      → ClaudeLoginPanel
        ok            → continue ──────────────────────────┐
                                                            │
                                    loading      → spinner  │
                                    unauthed     → GitHubLoginPanel
                                    ok           → ✅ welcome screen
                                    error        → retry  │
                                                            ▼
                                                       Welcome / Tabs
```

- Both statuses are independent IPC channels (`claude:status` and `github:status`).
- App always renders the **first non-ok** status panel.
- `Continue without auth` bypass button is preserved for development/testing — sets a `bypassOnboarding` flag in state (not persisted). Useful when working offline.

---

## Token storage

### Format on disk (`settings.json` in `app.getPath('userData')`)

```jsonc
{
  "recentProjects": [...],          // unchanged
  "github": {                       // new
    "login": "vrajpatel",
    "name": "Vraj Patel",
    "avatarUrl": "https://...",
    "tokenCiphertext": "<safeStorage base64>"
  }
}
```

### Encryption

- `safeStorage.isEncryptionAvailable()` checked on every encrypt/decrypt call.
- If unavailable (Keychain unreachable, very rare on macOS): refuse to persist, show a blocking error in `GitHubLoginPanel` ("macOS Keychain unavailable — quit and reopen Agent Farm"). Never persist plaintext.
- On startup: decrypt `tokenCiphertext` into in-memory `currentGithubToken`. If decrypt fails (e.g. user moved their home directory between machines), clear the field and force re-auth.

### Memory hygiene

- Plaintext token is a `let` in `github-auth.ts` module scope, set on auth and on decrypt-from-disk.
- Never logged. `logger.info` calls scrub `Authorization` headers.
- Never passed through IPC to the renderer. Renderer only ever sees `{ login, name, avatarUrl }`.

---

## UI changes

### `Onboarding.tsx`

Adds a new state: `github-unauthed`. Renders a card mirroring the existing claude card:

```
   ●
Connect GitHub
We use this to clone your private repos and identify you.
[ Connect GitHub ]  [ I'm connected — retry ]
```

Click "Connect GitHub" → `App.tsx` mounts `<GitHubLoginPanel>`.

### `GitHubLoginPanel.tsx` (new)

Layout mirrors `ClaudeLoginPanel`:

```
┌────────────────────────────────────────────────────────┐
│  Connect to GitHub                          [Cancel ⎋] │
├────────────────────────────────────────────────────────┤
│                                                         │
│           Your one-time code                            │
│                                                         │
│              ┌──────────────────┐                       │
│              │   A B C D - 1 2 3 4   │  [Copy]         │
│              └──────────────────┘                       │
│                                                         │
│   Open github.com/login/device, paste the code,         │
│   and approve "Agent Farm".                             │
│                                                         │
│   [ Open GitHub & enter code ]                          │
│                                                         │
│   Code expires in 14:52                                 │
│                                                         │
└────────────────────────────────────────────────────────┘
```

States:
- `loading` — spinner while POSTing to `/device/code`.
- `awaiting` — show code + countdown. Background poll for token.
- `success` — green checkmark + "Signed in as @vrajpatel" → auto-dismiss after 1.5s.
- `error` — show reason ("Code expired — retry?" or "You denied access — retry?").

### `AppTitleBar` / `AccountChip`

Becomes two chips:

```
[Agent Farm v0.1.0]    [Vraj Patel · Pro]   [@vrajpatel · GitHub]
```

Each chip has its own tooltip + `…` menu (Sign out, Switch account). Sign out clears the relevant state and re-runs onboarding for that provider.

### `CloneGitHubModal.tsx`

Changes from:

```
git clone <url> <dest>
```

to (when token present):

```
git clone -c http.https://github.com/.extraheader="Authorization: Basic ${b64}" <url> <dest>
```

Renders "Cloning private repo as @vrajpatel…" subtitle when token is used.

---

## IPC contracts (additions to `src/shared/ipc.ts`)

```ts
export interface GitHubAccount {
  login: string
  name: string | null
  avatarUrl: string | null
}

export type GitHubStatus =
  | { state: 'loading' }
  | { state: 'unauthed' }
  | { state: 'ok'; account: GitHubAccount }
  | { state: 'error'; message: string }

export interface GitHubDeviceFlowStart {
  userCode: string
  verificationUri: string
  deviceCode: string
  interval: number
  expiresIn: number
}

export interface AgentFarmApi {
  // ... existing fields ...
  github: {
    status(): Promise<GitHubStatus>
    onStatus(cb: (s: GitHubStatus) => void): () => void
    startDeviceFlow(): Promise<{ ok: true; flow: GitHubDeviceFlowStart } | { ok: false; reason: string }>
    pollForToken(deviceCode: string, intervalSeconds: number): Promise<{ ok: true; account: GitHubAccount } | { ok: false; reason: string }>
    signOut(): Promise<void>
  }
}
```

New IPC channel constants:

```ts
GitHubStatus       = 'github:status'
GitHubStartFlow    = 'github:start-flow'
GitHubPollForToken = 'github:poll-for-token'
GitHubSignOut      = 'github:sign-out'
```

---

## Error handling

| Failure | Surface |
|---|---|
| Anthropic xterm sentinel never matches in 90s | Fall back to "open in Terminal.app" CTA |
| `~/.claude.json` doesn't update after success sentinel | Show "Signed in but config not detected — retry?" with manual recheck |
| GitHub `/device/code` returns non-200 | Error state in panel with raw GitHub error message + retry |
| GitHub poll returns `expired_token` | Reset panel to start state, "Your code expired — try again" |
| GitHub poll returns `access_denied` | Reset, "You denied access. Retry?" |
| Network offline | Both panels show "No connection — check your network" with retry |
| `safeStorage` unavailable | Block persistence, show macOS-specific error message |

---

## Security notes

- GitHub access token has `repo` scope — meaningful blast radius if leaked. Storage is `safeStorage` + memory-only; never logged; never passed to renderer.
- `extraheader` config is process-scoped via `git -c` flag — never reaches `.git/config` of the cloned repo. (Important: do **not** use `git config --global` to set the header.)
- Anthropic OAuth tokens stay in `~/.claude.json` where claude already manages them. We never touch them.
- Loopback callback URL (`http://127.0.0.1/callback`) registered on the OAuth App is required by GitHub's form but unused by Device Flow.

---

## Testing strategy

- **Unit:** `github-auth.ts` poll loop with mocked fetch — covers `authorization_pending`, `slow_down`, `expired_token`, `access_denied`, success. `secrets.ts` with mocked `safeStorage`. Both sentinel regexes for Anthropic against captured fixture outputs.
- **Smoke (`AGENTFARM_SMOKE=1`):** boot app, verify both onboarding panels render correctly given mocked statuses.
- **Manual end-to-end:** the dev runs the full first-launch on a fresh `userData` once before merge.

---

## Migration

Existing users (those who already have `claude` authed and were using the app before this change):

- `ClaudeStatus.state === 'ok'` → no Anthropic onboarding shown
- `GitHubStatus.state === 'unauthed'` (always true on first run of new build) → GitHub panel shown once, then dismissed forever

So existing users see one new screen on the next launch — the GitHub one. No data migration.

---

## Out of scope explicit list

| Item | Why deferred |
|---|---|
| Anthropic Console API key | Not needed for Pro/Max detection. `seatTier` from `claude /login` is enough. |
| GitHub org SAML SSO | Personal accounts cover the v1 use case. SAML enforcement happens transparently at the GitHub level anyway when the user picks an SSO-required org. |
| GitHub App (vs OAuth App) | OAuth App is sufficient for clone + identify. GitHub App would let us act on PRs as a bot — that's a different feature. |
| Token refresh | GitHub OAuth tokens don't expire. Anthropic OAuth tokens are managed by `claude`. Re-auth on 401 covers edge cases. |
| Multiple GitHub accounts | One account per app install in v1. |
| Custom OAuth App client_id in Settings | Ship a single client_id. If users want self-hosting later, surface in Settings — v2. |

---

## Implementation order (high-level)

The detailed step-by-step plan goes in the implementation plan doc. High-level order:

1. `secrets.ts` (foundation for token storage)
2. `github-auth.ts` (pure, testable, no UI)
3. IPC + preload wiring
4. `GitHubLoginPanel.tsx` + Onboarding integration
5. `claude-auth.ts` (sentinel + escape hatch)
6. `ClaudeLoginPanel.tsx` rewrite
7. `AccountChip` dual-badge
8. `CloneGitHubModal.tsx` token integration
9. End-to-end manual test
