import { BrowserWindow } from 'electron'
import type {
  GitHubAccount,
  GitHubPollResult,
  GitHubStartFlowResult,
  GitHubStatus,
} from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { logger } from './logger'
import { clearGitHub, getGitHub, setGitHub } from './settings'
import { decrypt, encrypt, isSecretsAvailable } from './secrets'

/**
 * GitHub Device Flow auth. RFC 8628.
 *
 * Public surface:
 *   - hydrateOnBoot()        — decrypt stored ciphertext on app start
 *   - currentStatus()        — what to return on github:status IPC
 *   - startDeviceFlow()      — POST /login/device/code
 *   - pollForToken()         — POST /login/oauth/access_token loop
 *   - signOut()              — clear settings + memory
 *   - getCurrentToken()      — plaintext token for git operations (in-memory only)
 *
 * The plaintext access token NEVER leaves this module's closure. The renderer
 * only sees {login, name, avatarUrl} via GitHubAccount.
 */

// The GitHub OAuth App that Vraj registered on 2026-05-12. Device Flow
// enabled. Public by design; safe to ship in the binary.
const GITHUB_CLIENT_ID = 'Ov23li0bEAMbEJ6AyLh9'
const GITHUB_SCOPES = 'repo read:user'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'

const USER_AGENT = 'agent-farm-desktop'

// In-memory plaintext token. Set on auth success and on decrypt-from-disk.
// Cleared on signOut() and on detected 401 from any GitHub call.
let currentToken: string | null = null
let currentAccount: GitHubAccount | null = null

// ── Boot ─────────────────────────────────────────────────────────────

/** Called once on app boot. Reads ciphertext from settings, decrypts, and
 *  caches the plaintext + account in memory. Best-effort: on any failure we
 *  end up in the `unauthed` state which is the safest fallback. */
export async function hydrateOnBoot(): Promise<void> {
  const stored = await getGitHub()
  if (!stored) return
  if (!isSecretsAvailable()) {
    void logger.warn('github-auth: safeStorage unavailable on boot; cannot decrypt token')
    return
  }
  const plain = decrypt(stored.tokenCiphertext)
  if (!plain) {
    // Common cause: home dir moved between machines. Clear stale ciphertext.
    void logger.warn('github-auth: stored token failed to decrypt; clearing')
    await clearGitHub()
    return
  }
  currentToken = plain
  currentAccount = stored.account
  void logger.info('github-auth: hydrated', { login: stored.account.login })
}

// ── Status ───────────────────────────────────────────────────────────

export function currentStatus(): GitHubStatus {
  if (currentToken && currentAccount) {
    return { state: 'ok', account: currentAccount }
  }
  return { state: 'unauthed' }
}

/** Push the latest status to every renderer window. Called after every
 *  state transition (sign-in, sign-out, 401-detected). */
function broadcastStatus(): void {
  const status = currentStatus()
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.webContents.isDestroyed()) {
      w.webContents.send(IPC.GitHubStatusEvent, status)
    }
  }
}

// ── Device Flow start ────────────────────────────────────────────────

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export async function startDeviceFlow(): Promise<GitHubStartFlowResult> {
  try {
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_SCOPES,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      void logger.error('github-auth: device_code non-200', { status: res.status, text })
      return { ok: false, reason: `github returned ${res.status}` }
    }
    const data = (await res.json()) as DeviceCodeResponse
    if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string') {
      return { ok: false, reason: 'github returned a malformed response' }
    }
    void logger.info('github-auth: device flow started', { userCode: data.user_code })
    return {
      ok: true,
      flow: {
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        deviceCode: data.device_code,
        interval: data.interval,
        expiresIn: data.expires_in,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    void logger.error('github-auth: startDeviceFlow threw', { message })
    return { ok: false, reason: message }
  }
}

// ── Polling for token ────────────────────────────────────────────────

interface AccessTokenResponse {
  access_token?: string
  token_type?: string
  scope?: string
  error?: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | 'unsupported_grant_type' | 'incorrect_client_credentials' | 'incorrect_device_code' | string
  error_description?: string
}

/** Long-lived call. Polls every `intervalSeconds`. Resolves once the user
 *  approves (returns ok+account) or once the flow ends (expired/denied). */
export async function pollForToken(
  deviceCode: string,
  intervalSeconds: number,
): Promise<GitHubPollResult> {
  if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
    return { ok: false, reason: 'invalid device code' }
  }
  let interval = Math.max(1, Math.floor(intervalSeconds))

  // Hard cap on poll time: GitHub device codes expire after 15min, but we
  // also bail if something goes badly wrong (e.g. infinite slow_down).
  const deadline = Date.now() + 16 * 60_000

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      return { ok: false, reason: 'timeout' }
    }
    await sleep(interval * 1000)
    let body: AccessTokenResponse
    try {
      const res = await fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }).toString(),
      })
      body = (await res.json()) as AccessTokenResponse
    } catch (err) {
      // Network blip — retry next interval.
      void logger.warn('github-auth: poll fetch failed; retrying', {
        message: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    if (body.access_token) {
      const account = await fetchUser(body.access_token)
      if (!account) {
        return { ok: false, reason: 'fetched token but /user failed' }
      }
      const persisted = await persistToken(body.access_token, account)
      if (!persisted.ok) {
        return persisted
      }
      currentToken = body.access_token
      currentAccount = account
      broadcastStatus()
      void logger.info('github-auth: signed in', { login: account.login })
      return { ok: true, account }
    }

    switch (body.error) {
      case 'authorization_pending':
        // Normal — user hasn't entered the code yet. Continue.
        continue
      case 'slow_down':
        // RFC 8628 §3.5: increase interval by at least 5 seconds.
        interval += 5
        continue
      case 'expired_token':
        return { ok: false, reason: 'code expired' }
      case 'access_denied':
        return { ok: false, reason: 'access denied' }
      default:
        void logger.error('github-auth: unexpected poll error', { body })
        return { ok: false, reason: body.error_description ?? body.error ?? 'unknown error' }
    }
  }
}

// ── Identify the user ────────────────────────────────────────────────

async function fetchUser(token: string): Promise<GitHubAccount | null> {
  try {
    const res = await fetch(USER_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${token}`,
        'User-Agent': USER_AGENT,
      },
    })
    if (!res.ok) {
      void logger.error('github-auth: /user non-200', { status: res.status })
      return null
    }
    const data = (await res.json()) as {
      login?: string
      name?: string | null
      avatar_url?: string | null
    }
    if (typeof data.login !== 'string' || data.login.length === 0) {
      return null
    }
    return {
      login: data.login,
      name: data.name ?? null,
      avatarUrl: data.avatar_url ?? null,
    }
  } catch (err) {
    void logger.error('github-auth: fetchUser threw', {
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ── Persistence ──────────────────────────────────────────────────────

async function persistToken(
  token: string,
  account: GitHubAccount,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isSecretsAvailable()) {
    return {
      ok: false,
      reason: 'macOS Keychain unavailable — quit and reopen Agent Farm',
    }
  }
  const ciphertext = encrypt(token)
  if (!ciphertext) {
    return { ok: false, reason: 'failed to encrypt token' }
  }
  await setGitHub({ account, tokenCiphertext: ciphertext })
  return { ok: true }
}

// ── Sign-out ─────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  currentToken = null
  currentAccount = null
  await clearGitHub()
  broadcastStatus()
  void logger.info('github-auth: signed out')
}

// ── Token accessor (for git operations) ──────────────────────────────

/** Plaintext token for git/api calls. Stays in main; never crosses IPC. */
export function getCurrentToken(): string | null {
  return currentToken
}

/** Call when a downstream GitHub API call returns 401. Clears the stale
 *  token + account and broadcasts unauthed so the UI re-prompts. */
export async function handle401(): Promise<void> {
  if (!currentToken) return
  void logger.warn('github-auth: 401 detected; clearing token')
  await signOut()
}

// ── helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
