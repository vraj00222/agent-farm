import { safeStorage } from 'electron'
import { logger } from './logger'

/**
 * Thin wrapper around Electron's `safeStorage`. On macOS this routes through
 * the user's Keychain; on Windows it uses DPAPI; on Linux it uses libsecret
 * if available. Ciphertext is opaque base64 — safe to write to disk.
 *
 * If encryption isn't available (Keychain blocked, libsecret missing) every
 * call returns `null`. Callers MUST treat null as "tell the user, refuse to
 * persist" rather than falling back to plaintext.
 */

/** True if the OS-level secure store is available. Cheap, no syscall. */
export function isSecretsAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** Encrypt a plaintext secret. Returns base64 ciphertext or null. */
export function encrypt(plain: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    void logger.warn('secrets: encryption unavailable')
    return null
  }
  try {
    const buf = safeStorage.encryptString(plain)
    return buf.toString('base64')
  } catch (err) {
    void logger.error('secrets: encrypt failed', { message: (err as Error).message })
    return null
  }
}

/** Decrypt a base64 ciphertext. Returns plaintext or null on failure. */
export function decrypt(cipherBase64: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    void logger.warn('secrets: encryption unavailable on decrypt')
    return null
  }
  try {
    const buf = Buffer.from(cipherBase64, 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    // Common cause: user moved their home directory between machines, so
    // the Keychain entry that encrypted this ciphertext is unreachable.
    void logger.warn('secrets: decrypt failed', { message: (err as Error).message })
    return null
  }
}
