import { app } from 'electron'
import { promises as fs, createWriteStream, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { LogLevel, LogPayload } from '../shared/ipc'

const ROTATE_BYTES = 5 * 1024 * 1024 // 5 MB

let stream: WriteStream | null = null
let bytes = 0
let opening: Promise<void> | null = null

function logFilePath(): string {
  return join(app.getPath('userData'), 'logs', 'agentfarm.log')
}

async function ensureOpen(): Promise<void> {
  if (stream) return
  if (opening) return opening
  opening = (async () => {
    const file = logFilePath()
    await fs.mkdir(join(app.getPath('userData'), 'logs'), { recursive: true })
    try {
      const stat = await fs.stat(file)
      bytes = stat.size
      if (bytes > ROTATE_BYTES) {
        await fs.rename(file, file + '.1').catch(() => {})
        bytes = 0
      }
    } catch {
      bytes = 0
    }
    stream = createWriteStream(file, { flags: 'a' })
  })()
  await opening
  opening = null
}

function format(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const tail = data ? ' ' + safeStringify(data) : ''
  return `${ts} ${level.toUpperCase()} ${message}${tail}\n`
}

function safeStringify(d: Record<string, unknown>): string {
  try {
    return JSON.stringify(d)
  } catch {
    return '{"_unserializable":true}'
  }
}

async function write(line: string): Promise<void> {
  await ensureOpen()
  if (!stream) return
  const buf = Buffer.from(line, 'utf8')
  bytes += buf.byteLength
  stream.write(buf)

  // Mirror to console in dev for visibility.
  if (!app.isPackaged) {
    process.stdout.write(line)
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>): Promise<void> {
    return write(format('info', message, data))
  },
  warn(message: string, data?: Record<string, unknown>): Promise<void> {
    return write(format('warn', message, data))
  },
  error(message: string, data?: Record<string, unknown>): Promise<void> {
    return write(format('error', message, data))
  },
  fromRenderer(payload: LogPayload): Promise<void> {
    return write(format(payload.level, '[renderer] ' + payload.message, payload.data))
  },
}
