'use strict'

const React = require('react')
const { render, Box, Text, useApp, useInput, useStdout } = require('ink')
const { execFileSync } = require('child_process')
const { fmtElapsed } = require('./util.js')

const e = React.createElement
const { useState, useEffect, useMemo, useReducer } = React

const STATE_GLYPHS = {
  queued: { glyph: '·', color: 'gray' },
  running: { glyph: '●', color: 'cyan' },
  done: { glyph: '✓', color: 'green' },
  noop: { glyph: '○', color: 'yellow' },
  failed: { glyph: '✗', color: 'red' },
}

function useTick(ms = 1000) {
  const [, force] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const t = setInterval(force, ms)
    return () => clearInterval(t)
  }, [ms])
}

function useAgents(state) {
  const [agents, setAgents] = useState(() => state.all())
  useEffect(() => {
    const update = () => setAgents(state.all().slice())
    state.on('change', update)
    return () => state.off('change', update)
  }, [state])
  return agents
}

function elapsedFor(a) {
  if (a.state === 'queued') return '-'
  if (a.elapsedMs != null) return fmtElapsed(a.elapsedMs)
  if (a.startedAt) return fmtElapsed(Date.now() - a.startedAt) + '+'
  return '-'
}

function detail(a) {
  if (a.state === 'queued') return 'queued'
  if (a.state === 'running') return a.pid ? `pid ${a.pid}` : 'starting'
  if (a.state === 'noop') return 'no changes'
  if (a.state === 'failed') return a.error || `exit ${a.exitCode}`
  return `${(a.commits || []).length}c · ${(a.filesChanged || []).length}f${a.autoCommitted ? ' (auto)' : ''}`
}

function Header({ baseSha, repoName, totals }) {
  return e(
    Box,
    {
      borderStyle: 'round',
      borderColor: 'gray',
      paddingX: 1,
      flexShrink: 0,
    },
    e(
      Box,
      { flexGrow: 1 },
      e(Text, { bold: true }, 'agent-farm'),
      e(Text, { color: 'gray' }, '  ·  base '),
      e(Text, null, baseSha.slice(0, 8)),
      e(Text, { color: 'gray' }, '  ·  repo '),
      e(Text, null, repoName)
    ),
    e(
      Box,
      null,
      e(Text, { color: 'cyan' }, `${totals.running} running`),
      e(Text, { color: 'gray' }, '  ·  '),
      e(Text, { color: 'green' }, `${totals.done} done`),
      totals.noop > 0
        ? e(Text, { color: 'gray' }, '  ·  ')
        : null,
      totals.noop > 0
        ? e(Text, { color: 'yellow' }, `${totals.noop} noop`)
        : null,
      totals.failed > 0 ? e(Text, { color: 'gray' }, '  ·  ') : null,
      totals.failed > 0
        ? e(Text, { color: 'red' }, `${totals.failed} failed`)
        : null
    )
  )
}

function WorktreeList({ agents, selectedIdx, width }) {
  return e(
    Box,
    { flexDirection: 'column', width, flexShrink: 0 },
    agents.map((a, i) => {
      const sel = i === selectedIdx
      const sg = STATE_GLYPHS[a.state] || STATE_GLYPHS.queued
      const arrow = sel ? '▸ ' : '  '
      return e(
        Box,
        { key: a.id, flexDirection: 'column', paddingX: 1 },
        e(
          Text,
          { color: sel ? 'cyan' : undefined, bold: sel },
          arrow,
          e(Text, { color: sg.color }, sg.glyph),
          ' ',
          a.id
        ),
        e(
          Text,
          { color: 'gray' },
          '    ',
          elapsedFor(a),
          '  ',
          detail(a)
        )
      )
    })
  )
}

function LiveTail({ agent, height }) {
  if (!agent) return e(Text, { color: 'gray' }, '(no agent selected)')
  const lines = (agent.lastLines || []).slice(-Math.max(1, height - 2))
  return e(
    Box,
    { flexDirection: 'column' },
    e(Text, { color: 'gray', bold: true }, `tail · ${agent.id}`),
    e(Text, { color: 'gray' }, '─'.repeat(20)),
    lines.length === 0
      ? e(Text, { color: 'gray' }, '(no output yet)')
      : lines.map((line, i) =>
          e(Text, { key: i }, line.length > 200 ? line.slice(0, 200) + '…' : line)
        )
  )
}

function loadDiff(agent, baseSha) {
  if (!agent || !agent.worktreePath) return { files: [], err: null }
  try {
    const raw = execFileSync(
      'git',
      ['diff', `${baseSha}..HEAD`],
      { cwd: agent.worktreePath, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    if (!raw.trim()) return { files: [], err: null }
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
    return { files, err: null }
  } catch (e) {
    return { files: [], err: e.message.split('\n')[0] }
  }
}

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

function DiffView({ agent, baseSha, fileIdx, height }) {
  const data = useMemo(() => loadDiff(agent, baseSha), [agent && agent.id, agent && agent.endedAt, baseSha])
  if (data.err) {
    return e(
      Box,
      { flexDirection: 'column' },
      e(Text, { color: 'red' }, `diff error: ${data.err}`)
    )
  }
  if (!agent || agent.state === 'running' || agent.state === 'queued') {
    return e(Text, { color: 'gray' }, '(diff appears once the agent is done)')
  }
  if (data.files.length === 0) {
    return e(Text, { color: 'gray' }, '(no changes)')
  }
  const idx = Math.max(0, Math.min(fileIdx, data.files.length - 1))
  const f = data.files[idx]
  const visible = f.lines.slice(0, Math.max(1, height - 3))
  return e(
    Box,
    { flexDirection: 'column' },
    e(
      Text,
      { color: 'cyan', bold: true },
      `diff · ${agent.id}  ·  file ${idx + 1}/${data.files.length}: `,
      e(Text, { color: 'white' }, f.name)
    ),
    e(Text, { color: 'gray' }, '─'.repeat(20)),
    visible.map((line, i) => e(DiffLine, { key: i, line }))
  )
}

function OutputPane({ agent, viewMode, baseSha, fileIdx, width, height }) {
  return e(
    Box,
    {
      flexDirection: 'column',
      flexGrow: 1,
      paddingX: 1,
      width,
    },
    viewMode === 'diff'
      ? e(DiffView, { agent, baseSha, fileIdx, height })
      : e(LiveTail, { agent, height })
  )
}

function StatusBar({ viewMode, allDone, attached }) {
  const hints =
    viewMode === 'diff'
      ? '↑↓ select  ·  d back to tail  ·  [/] file  ·  q ' +
        (attached ? 'detach' : 'quit') +
        '  ·  Q kill all'
      : '↑↓ select  ·  d diff  ·  q ' +
        (attached ? 'detach' : 'quit') +
        '  ·  Q kill all'
  return e(
    Box,
    { borderStyle: 'round', borderColor: 'gray', paddingX: 1, flexShrink: 0 },
    e(
      Box,
      { flexGrow: 1 },
      e(Text, { color: 'gray' }, hints)
    ),
    allDone
      ? e(Text, { color: 'green' }, 'all done — press q')
      : e(Text, { color: 'gray' }, '')
  )
}

function App({ state, baseSha, repoName, attached, onKillAll }) {
  useTick(1000)
  const agents = useAgents(state)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [viewMode, setViewMode] = useState('tail')
  const [fileIdx, setFileIdx] = useState(0)
  const { stdout } = useStdout()
  const { exit } = useApp()

  const cols = (stdout && stdout.columns) || 100
  const rows = (stdout && stdout.rows) || 30

  const totals = agents.reduce(
    (acc, a) => {
      acc[a.state] = (acc[a.state] || 0) + 1
      return acc
    },
    { running: 0, done: 0, noop: 0, failed: 0, queued: 0 }
  )

  const allDone = agents.length > 0 && agents.every((a) => a.state === 'done' || a.state === 'noop' || a.state === 'failed')

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1))
      setFileIdx(0)
    } else if (key.downArrow) {
      setSelectedIdx((i) => Math.min(agents.length - 1, i + 1))
      setFileIdx(0)
    } else if (input === 'd') {
      setViewMode((m) => (m === 'diff' ? 'tail' : 'diff'))
      setFileIdx(0)
    } else if (input === '[') {
      setFileIdx((i) => Math.max(0, i - 1))
    } else if (input === ']') {
      setFileIdx((i) => i + 1)
    } else if (input === 'q') {
      exit()
    } else if (input === 'Q') {
      onKillAll && onKillAll()
      exit()
    }
  })

  const leftWidth = Math.max(22, Math.floor(cols * 0.32))
  const innerHeight = Math.max(5, rows - 6) // header + statusbar + borders

  return e(
    Box,
    { flexDirection: 'column', height: rows },
    e(Header, { baseSha, repoName, totals }),
    e(
      Box,
      { flexGrow: 1, borderStyle: 'round', borderColor: 'gray' },
      e(WorktreeList, { agents, selectedIdx, width: leftWidth }),
      e(
        Box,
        { width: 1, flexShrink: 0 },
        e(Text, { color: 'gray' }, '│')
      ),
      e(OutputPane, {
        agent: agents[selectedIdx],
        viewMode,
        baseSha,
        fileIdx,
        width: cols - leftWidth - 4,
        height: innerHeight,
      })
    ),
    e(StatusBar, { viewMode, allDone, attached })
  )
}

function renderTui({ state, baseSha, repoName, attached = false, onKillAll }) {
  const ink = render(
    e(App, { state, baseSha, repoName, attached, onKillAll })
  )
  return ink.waitUntilExit()
}

module.exports = { renderTui }
