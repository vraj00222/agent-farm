'use strict'

const React = require('react')
const { render, Box, Text, useApp, useInput, useStdout } = require('ink')
const { execFileSync } = require('child_process')
const { fmtElapsed } = require('./util.js')

const e = React.createElement
const { useState, useEffect, useMemo, useReducer } = React

// ─── glyphs ─────────────────────────────────────────────────────────────

const STATE_GLYPHS = {
  queued: { glyph: '·', color: 'gray' },
  running: { glyph: '●', color: 'cyan' },
  done: { glyph: '✓', color: 'green' },
  noop: { glyph: '○', color: 'yellow' },
  failed: { glyph: '✗', color: 'red' },
}

// ─── hooks ──────────────────────────────────────────────────────────────

function useTick(ms = 1000) {
  const [, force] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const t = setInterval(force, ms)
    return () => clearInterval(t)
  }, [ms])
}

function useStateAgents(state) {
  const [agents, setAgents] = useState(() => state.all().slice())
  useEffect(() => {
    const update = () => setAgents(state.all().slice())
    // catch any change that fired between mount and effect attaching
    update()
    state.on('change', update)
    return () => state.off('change', update)
  }, [state])
  return agents
}

// ─── helpers ────────────────────────────────────────────────────────────

function elapsedFor(a) {
  if (a.state === 'queued') return ''
  if (a.elapsedMs != null) return fmtElapsed(a.elapsedMs)
  if (a.startedAt) return fmtElapsed(Date.now() - a.startedAt)
  return ''
}

// Render the per-agent detail line as an array of Text nodes so we can
// colorize commit count, file count, and modifiers independently.
function detailNodes(a) {
  if (a.state === 'queued') return [e(Text, { color: 'gray' }, 'queued')]
  if (a.state === 'running') {
    return [
      e(Text, { color: 'cyan' }, 'running'),
      a.pid ? e(Text, { color: 'gray' }, `  pid ${a.pid}`) : null,
    ]
  }
  if (a.state === 'noop') return [e(Text, { color: 'yellow' }, 'no changes')]
  if (a.state === 'failed') {
    return [e(Text, { color: 'red' }, a.error || `exit ${a.exitCode}`)]
  }
  // done
  const c = (a.commits || []).length
  const f = (a.filesChanged || []).length
  return [
    e(Text, { color: 'green' }, `${c} commit${c === 1 ? '' : 's'}`),
    e(Text, { color: 'gray' }, '  '),
    e(Text, { color: 'yellow' }, `${f} file${f === 1 ? '' : 's'}`),
    a.autoCommitted ? e(Text, { color: 'gray' }, '  auto') : null,
  ]
}

function loadDiff(agent, baseSha) {
  if (!agent || !agent.worktreePath) return { files: [], err: null, pending: false }
  if (agent.state === 'queued' || agent.state === 'running') {
    return { files: [], err: null, pending: true }
  }
  try {
    const raw = execFileSync('git', ['diff', `${baseSha}..HEAD`], {
      cwd: agent.worktreePath,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (!raw.trim()) return { files: [], err: null, pending: false }
    const files = []
    let cur = null
    for (const line of raw.split('\n')) {
      if (line.startsWith('diff --git ')) {
        if (cur) files.push(cur)
        const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
        cur = { name: m ? m[2] : line, lines: [] }
        cur.lines.push(line)
      } else if (cur) {
        cur.lines.push(line)
      }
    }
    if (cur) files.push(cur)
    return { files, err: null, pending: false }
  } catch (e) {
    return { files: [], err: e.message.split('\n')[0], pending: false }
  }
}

// ─── small components ───────────────────────────────────────────────────

function DiffLine({ line }) {
  if (line.startsWith('+') && !line.startsWith('+++'))
    return e(Text, { color: 'green' }, line)
  if (line.startsWith('-') && !line.startsWith('---'))
    return e(Text, { color: 'red' }, line)
  if (line.startsWith('@@')) return e(Text, { color: 'cyan' }, line)
  if (line.startsWith('diff --git') || line.startsWith('index '))
    return e(Text, { color: 'gray', bold: true }, line)
  if (line.startsWith('+++') || line.startsWith('---'))
    return e(Text, { color: 'gray' }, line)
  return e(Text, { color: 'gray' }, line)
}

function HRule({ width }) {
  const w = Math.max(0, width)
  return e(Text, { color: 'gray' }, '─'.repeat(w))
}

// ─── App ────────────────────────────────────────────────────────────────

function App({ state, baseSha, repoName, queueTask, claudeVersion, model }) {
  useTick(1000)
  const agents = useStateAgents(state)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [viewMode, setViewMode] = useState('tail') // 'tail' | 'diff'
  const [fileIdx, setFileIdx] = useState(0)
  const [input, setInput] = useState('')
  const [errorBanner, setErrorBanner] = useState(null)
  const { stdout } = useStdout()
  const { exit } = useApp()

  const cols = (stdout && stdout.columns) || 100
  const rows = (stdout && stdout.rows) || 30

  // Clamp selectedIdx at render time — never let agents[bad] reach children.
  const safeIdx =
    agents.length === 0 ? -1 : Math.max(0, Math.min(selectedIdx, agents.length - 1))
  const selectedAgent = safeIdx >= 0 ? agents[safeIdx] : null

  const totals = agents.reduce(
    (acc, a) => {
      acc[a.state] = (acc[a.state] || 0) + 1
      return acc
    },
    { running: 0, done: 0, noop: 0, failed: 0, queued: 0 }
  )

  const diffData = useMemo(
    () => loadDiff(selectedAgent, baseSha),
    [selectedAgent && selectedAgent.id, selectedAgent && selectedAgent.endedAt, baseSha]
  )

  const submit = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    setErrorBanner(null)
    try {
      const newId = queueTask(trimmed)
      // jump selection to the just-queued task so user sees it spawn
      const newIdx = agents.findIndex((a) => a.id === newId)
      if (newIdx >= 0) setSelectedIdx(newIdx)
    } catch (e) {
      setErrorBanner(e.message)
    }
  }

  useInput((char, key) => {
    if (errorBanner) setErrorBanner(null)

    // ── Side-panel navigation (always available, even while typing)
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1))
      setFileIdx(0)
      setViewMode('tail')
      return
    }
    if (key.downArrow) {
      // Note: agents.length captured in closure may be stale, but render-time
      // clamping (safeIdx) protects readers. Setter math is just guidance.
      setSelectedIdx((i) => i + 1)
      setFileIdx(0)
      setViewMode('tail')
      return
    }

    // ── Tab: cycle tail → diff(file 1) → diff(file 2) → … → tail
    if (key.tab && !key.shift) {
      if (!selectedAgent) return
      const numFiles = (diffData.files && diffData.files.length) || 0
      if (viewMode === 'tail') {
        setViewMode('diff')
        setFileIdx(0)
      } else if (fileIdx + 1 < numFiles) {
        setFileIdx(fileIdx + 1)
      } else {
        setViewMode('tail')
        setFileIdx(0)
      }
      return
    }
    if (key.tab && key.shift) {
      if (viewMode === 'diff' && fileIdx > 0) {
        setFileIdx(fileIdx - 1)
      } else if (viewMode === 'diff') {
        setViewMode('tail')
        setFileIdx(0)
      }
      return
    }

    // ── Esc: clear input; if input empty and in diff, drop back to tail
    if (key.escape) {
      if (input.length > 0) setInput('')
      else if (viewMode === 'diff') {
        setViewMode('tail')
        setFileIdx(0)
      }
      return
    }

    // ── Enter: submit
    if (key.return) {
      submit()
      return
    }

    // ── Backspace
    if (key.backspace || key.delete) {
      setInput((s) => s.slice(0, -1))
      return
    }

    // Ctrl+C is captured by Ink's default handler → calls exit() → process unwind
    // Plain printable chars
    if (char && !key.ctrl && !key.meta) {
      setInput((s) => s + char)
    }
  })

  // ── layout math
  const innerWidth = Math.max(20, cols - 2) // outer round border consumes 2 cols
  const leftWidth = Math.max(20, Math.floor((innerWidth - 3) * 0.35))
  const rightWidth = Math.max(20, innerWidth - leftWidth - 3) // -3: divider + paddingX
  const headerH = 1
  const inputH = 1
  const hintH = 1
  // 4 dividers (after header, before input, before hint, end) — but we render
  // 3 explicit HRule rows. Total static rows: header + 3 HRule + input + hint = 6
  const chromeH = headerH + 3 + inputH + hintH
  const bodyH = Math.max(3, rows - 2 - chromeH) // -2: top+bottom outer borders

  // ── HEADER row
  const header = e(
    Box,
    { paddingX: 1, height: 1 },
    e(Text, { bold: true, color: 'magenta' }, 'agent-farm'),
    e(Text, { color: 'gray' }, '  '),
    e(Text, { color: 'green' }, '✓'),
    e(Text, null, ' claude '),
    e(Text, { color: 'cyan' }, claudeVersion || '?'),
    e(Text, { color: 'gray' }, '  ·  '),
    e(Text, { color: 'gray' }, 'model '),
    e(Text, { color: model ? 'cyan' : 'gray' }, model || 'default'),
    e(Text, { color: 'gray' }, '  ·  '),
    e(Text, { color: 'yellow' }, '⚠ skip-perms'),
    e(Text, { color: 'gray' }, '  ·  '),
    e(Text, null, baseSha.slice(0, 8)),
    e(Text, { color: 'gray' }, '/'),
    e(Text, null, repoName),
    e(Text, { color: 'gray' }, '   '),
    totals.queued > 0
      ? e(Text, { color: 'gray' }, `${totals.queued} queued  `)
      : null,
    totals.running > 0
      ? e(Text, { color: 'cyan', bold: true }, `${totals.running} running  `)
      : null,
    totals.done > 0
      ? e(Text, { color: 'green', bold: true }, `${totals.done} done  `)
      : null,
    totals.noop > 0 ? e(Text, { color: 'yellow' }, `${totals.noop} noop  `) : null,
    totals.failed > 0
      ? e(Text, { color: 'red', bold: true }, `${totals.failed} failed`)
      : null
  )

  // ── LEFT panel (worktree list)
  const list =
    agents.length === 0
      ? e(
          Box,
          { paddingX: 1 },
          e(Text, { color: 'gray' }, '(no tasks yet)')
        )
      : e(
          Box,
          { flexDirection: 'column', paddingX: 1 },
          ...agents.map((a, i) => {
            const sel = i === safeIdx
            const sg = STATE_GLYPHS[a.state] || STATE_GLYPHS.queued
            const arrow = sel ? '▸' : ' '
            const maxIdLen = leftWidth - 6
            const idDisplay =
              a.id.length > maxIdLen ? a.id.slice(0, maxIdLen - 1) + '…' : a.id
            const elapsed = elapsedFor(a)
            const elapsedColor =
              a.state === 'running'
                ? 'cyan'
                : a.state === 'done'
                  ? 'green'
                  : a.state === 'noop'
                    ? 'yellow'
                    : a.state === 'failed'
                      ? 'red'
                      : 'gray'
            return e(
              Box,
              { key: a.id, flexDirection: 'column' },
              e(
                Text,
                { color: sel ? 'cyan' : undefined, bold: sel },
                arrow + ' ',
                e(Text, { color: sg.color }, sg.glyph),
                ' ',
                idDisplay
              ),
              e(
                Text,
                null,
                '   ',
                elapsed
                  ? e(Text, { color: elapsedColor }, elapsed)
                  : null,
                elapsed ? e(Text, { color: 'gray' }, '  ') : null,
                ...detailNodes(a)
              )
            )
          })
        )

  // ── RIGHT panel (tail or diff)
  const truncateRight = Math.max(20, rightWidth - 2)
  let right
  if (!selectedAgent) {
    right = e(
      Box,
      { paddingX: 1, flexDirection: 'column' },
      e(Text, { color: 'gray' }, '(type a task below and press Enter)')
    )
  } else if (viewMode === 'diff') {
    if (diffData.pending) {
      right = e(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        e(Text, { color: 'cyan', bold: true }, `diff · ${selectedAgent.id}`),
        e(Text, { color: 'gray' }, '(diff appears once the task finishes)')
      )
    } else if (diffData.err) {
      right = e(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        e(Text, { color: 'red' }, `diff error: ${diffData.err}`)
      )
    } else if (diffData.files.length === 0) {
      right = e(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        e(Text, { color: 'cyan', bold: true }, `diff · ${selectedAgent.id}`),
        e(Text, { color: 'gray' }, '(no changes)')
      )
    } else {
      const idx = Math.max(0, Math.min(fileIdx, diffData.files.length - 1))
      const f = diffData.files[idx]
      // Smart path display: show last 2 segments if path is long
      const segments = f.name.split('/')
      const shortPath =
        f.name.length > truncateRight - 20 && segments.length > 2
          ? '…/' + segments.slice(-2).join('/')
          : f.name
      // File pagination dots: ●●○○○ with current highlighted
      const dots = diffData.files
        .map((_, i) => (i === idx ? '●' : '○'))
        .join('')
      // Insert blank line before each @@ hunk for breathing room
      const spacedLines = []
      for (const line of f.lines.slice(0, Math.max(1, bodyH - 2))) {
        if (line.startsWith('@@') && spacedLines.length > 0) {
          spacedLines.push('') // breathing room
        }
        spacedLines.push(line)
        if (spacedLines.length >= bodyH - 2) break
      }
      right = e(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        e(
          Box,
          null,
          e(Text, { color: 'cyan', bold: true }, 'diff '),
          e(Text, { color: 'gray' }, '· '),
          e(Text, { color: 'cyan' }, selectedAgent.id),
          e(Text, { color: 'gray' }, '  '),
          e(Text, { color: 'magenta' }, dots),
          e(Text, { color: 'gray' }, '  '),
          e(Text, null, shortPath)
        ),
        ...spacedLines.map((line, i) => {
          if (line === '') return e(Text, { key: i }, '')
          const display =
            line.length > truncateRight ? line.slice(0, truncateRight - 1) + '…' : line
          return e(DiffLine, { key: i, line: display })
        })
      )
    }
  } else {
    // tail
    const lines = (selectedAgent.lastLines || []).slice(-Math.max(1, bodyH - 2))
    right = e(
      Box,
      { paddingX: 1, flexDirection: 'column' },
      e(Text, { color: 'gray', bold: true }, `tail · ${selectedAgent.id}`),
      lines.length === 0
        ? e(Text, { color: 'gray' }, '(no output yet)')
        : null,
      ...lines.map((line, i) => {
        const display =
          line.length > truncateRight ? line.slice(0, truncateRight - 1) + '…' : line
        return e(Text, { key: i }, display)
      })
    )
  }

  // ── BODY: left | divider | right
  const body = e(
    Box,
    { flexDirection: 'row', height: bodyH },
    e(Box, { width: leftWidth, flexShrink: 0, flexDirection: 'column' }, list),
    e(
      Box,
      { width: 1, flexShrink: 0, flexDirection: 'column' },
      ...new Array(bodyH).fill(0).map((_, i) =>
        e(Text, { key: i, color: 'gray' }, '│')
      )
    ),
    e(Box, { width: rightWidth, flexShrink: 0, flexDirection: 'column' }, right)
  )

  // ── INPUT row
  const inputBox = e(
    Box,
    { paddingX: 1, height: 1 },
    e(Text, { color: 'cyan' }, '› '),
    e(Text, null, input),
    e(Text, { color: 'cyan' }, '▌'),
    input.length === 0
      ? e(
          Text,
          { color: 'gray' },
          '  type a task and press Enter to spawn it'
        )
      : null
  )

  // ── HINT row
  const hint = e(
    Box,
    { paddingX: 1, height: 1 },
    e(
      Text,
      { color: 'gray' },
      'enter spawn  ·  ↑↓ select  ·  tab tail/diff  ·  esc clear  ·  ctrl+c quit (kills running)'
    )
  )

  return e(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'gray',
      width: cols,
      height: rows,
    },
    header,
    e(HRule, { width: innerWidth }),
    body,
    e(HRule, { width: innerWidth }),
    inputBox,
    errorBanner
      ? e(
          Box,
          { paddingX: 1, height: 1 },
          e(Text, { color: 'red' }, `! ${errorBanner}`)
        )
      : null,
    e(HRule, { width: innerWidth }),
    hint
  )
}

function renderTui({ state, baseSha, repoName, queueTask, claudeVersion, model }) {
  const ink = render(
    e(App, { state, baseSha, repoName, queueTask, claudeVersion, model })
  )
  return ink.waitUntilExit()
}

module.exports = { renderTui }
