'use strict'

// Parses claude's --output-format stream-json events into pretty single-line
// summaries suitable for the TUI tail. Returns { lines, usage } per event.
//
// Event types we care about:
//   - system       (mostly noise — only show 'init' and 'compact')
//   - user         (prompt echo / tool_result wrapper — silent)
//   - assistant    (text blocks + tool_use blocks)
//   - tool_result  (rendered when emitted at top level)
//   - result       (final summary with usage + cost)

function truncate(s, n) {
  if (typeof s !== 'string') return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function formatToolUse(block) {
  const name = block.name || 'Tool'
  const input = block.input || {}
  const pad = (name + '       ').slice(0, 7)
  switch (name) {
    case 'Edit':
    case 'Write':
    case 'Read': {
      let s = `→ ${pad} ${input.file_path || '?'}`
      if (input.offset || input.limit) {
        s += ` (lines ${input.offset || 1}-${(input.offset || 1) + (input.limit || 0)})`
      }
      return s
    }
    case 'Bash':
      return `→ ${pad} $ ${truncate(input.command || '', 70)}`
    case 'Grep':
      return `→ ${pad} ${JSON.stringify(input.pattern || '')} in ${input.path || '.'}`
    case 'Glob':
      return `→ ${pad} ${input.pattern || '*'}`
    case 'WebFetch':
      return `→ ${pad} ${truncate(input.url || '', 70)}`
    case 'WebSearch':
      return `→ ${pad} ${truncate(input.query || '', 70)}`
    case 'TodoWrite':
      return `→ ${pad} (${(input.todos || []).length} items)`
    case 'Task':
      return `→ ${pad} ${truncate(input.description || input.subagent_type || '', 60)}`
    default: {
      const keys = Object.keys(input).slice(0, 2).join(',')
      return `→ ${pad} ${keys}`
    }
  }
}

function formatToolResultContent(content) {
  let preview = ''
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b && b.type === 'text')
    preview = textBlock ? textBlock.text || '' : ''
  } else if (typeof content === 'string') {
    preview = content
  }
  const firstLine = preview.split('\n').find((l) => l.trim()) || ''
  const lineCount = preview.split('\n').length
  if (lineCount > 1) return `← ${truncate(firstLine, 70)} … (+${lineCount - 1} lines)`
  return `← ${truncate(firstLine, 80)}`
}

function formatResult(event) {
  if (event.is_error || event.subtype === 'error') {
    return `✗ ${truncate(event.error || event.subtype || 'error', 80)}`
  }
  const usage = event.usage || {}
  const inTok = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
  const outTok = usage.output_tokens || 0
  const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`)
  const turns = event.num_turns || 0
  const cost =
    event.total_cost_usd != null ? `$${event.total_cost_usd.toFixed(4)}` : null
  const dur = event.duration_ms ? `${(event.duration_ms / 1000).toFixed(1)}s` : null
  const parts = [
    turns > 0 ? `${turns} turn${turns === 1 ? '' : 's'}` : null,
    `${fmtTok(inTok)} in / ${fmtTok(outTok)} out`,
    cost,
    dur,
  ].filter(Boolean)
  return `✓ ${parts.join(' · ')}`
}

function parseEvent(event) {
  if (!event || typeof event !== 'object') return { lines: [], usage: null }

  switch (event.type) {
    case 'system': {
      if (event.subtype === 'init') {
        const model = event.model ? ` (${event.model})` : ''
        return { lines: [`session started${model}`], usage: null }
      }
      if (event.subtype === 'compact_boundary') {
        return { lines: ['(context compacted)'], usage: null }
      }
      // Skip hook_started / hook_response / etc — too noisy
      return { lines: [], usage: null }
    }

    case 'user': {
      // user messages are usually prompt echo or tool_result wrappers; if
      // the message contains a tool_result block, render it
      const content = event.message && event.message.content
      if (Array.isArray(content)) {
        const lines = []
        for (const block of content) {
          if (block && block.type === 'tool_result') {
            lines.push(formatToolResultContent(block.content))
          }
        }
        return { lines, usage: null }
      }
      return { lines: [], usage: null }
    }

    case 'assistant': {
      const lines = []
      const content = (event.message && event.message.content) || []
      for (const block of content) {
        if (!block) continue
        if (block.type === 'text' && block.text) {
          for (const line of block.text.split('\n')) {
            const trimmed = line.replace(/\s+$/, '')
            if (trimmed) lines.push(trimmed)
          }
        } else if (block.type === 'tool_use') {
          lines.push(formatToolUse(block))
        } else if (block.type === 'thinking' && block.thinking) {
          // show first line of thinking, dimmed via prefix
          const first = block.thinking.split('\n').find((l) => l.trim())
          if (first) lines.push(`💭 ${truncate(first, 80)}`)
        }
      }
      return { lines, usage: null }
    }

    case 'tool_result': {
      return {
        lines: [formatToolResultContent(event.content)],
        usage: null,
      }
    }

    case 'result': {
      const usage = {
        usage: event.usage || null,
        cost: event.total_cost_usd != null ? event.total_cost_usd : null,
        numTurns: event.num_turns || 0,
        durationMs: event.duration_ms || null,
        isError: !!event.is_error,
      }
      return { lines: [formatResult(event)], usage }
    }

    default:
      return { lines: [], usage: null }
  }
}

module.exports = { parseEvent, formatToolUse, formatToolResultContent, formatResult }
