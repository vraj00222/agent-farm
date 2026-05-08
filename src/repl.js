'use strict'

const readline = require('readline')
const { c } = require('./util.js')

function promptFor(n) {
  return c.dim(`? task ${n} › `)
}

function printIntro() {
  process.stdout.write(
    [
      `${c.bold('agent-farm')} REPL — type a prompt per line.`,
      `${c.dim('  run')}    start the queue with what you have so far`,
      `${c.dim('  drop')}   discard the last prompt`,
      `${c.dim('  quit')}   exit without running (Ctrl+D / Ctrl+C also abort)`,
      '',
    ].join('\n') + '\n'
  )
}

async function runRepl() {
  printIntro()
  const tasks = []
  let resolved = false

  return await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY,
    })

    const finish = (value) => {
      if (resolved) return
      resolved = true
      resolve(value)
      rl.close()
    }

    rl.setPrompt(promptFor(tasks.length + 1))
    rl.prompt()

    rl.on('line', (rawLine) => {
      const line = rawLine.trim()
      if (line === 'run') {
        if (tasks.length === 0) {
          process.stdout.write(c.yellow('no tasks queued — type a prompt first.\n'))
          rl.prompt()
          return
        }
        finish(tasks)
        return
      }
      if (line === 'quit' || line === 'exit') {
        finish([])
        return
      }
      if (line === 'drop') {
        if (tasks.length === 0) {
          process.stdout.write(c.dim('nothing to drop.\n'))
        } else {
          const dropped = tasks.pop()
          process.stdout.write(c.dim(`dropped: ${dropped}\n`))
        }
        rl.setPrompt(promptFor(tasks.length + 1))
        rl.prompt()
        return
      }
      if (line.length === 0) {
        rl.prompt()
        return
      }
      tasks.push(line)
      rl.setPrompt(promptFor(tasks.length + 1))
      rl.prompt()
    })

    // Ctrl+D — close stream, treated as abort
    rl.on('close', () => {
      if (!resolved) {
        process.stdout.write('\n' + c.dim('aborted. nothing ran.\n'))
        finish([])
      }
    })

    // Ctrl+C — explicit abort
    rl.on('SIGINT', () => {
      process.stdout.write('\n' + c.dim('aborted (Ctrl+C). nothing ran.\n'))
      finish([])
    })
  })
}

module.exports = { runRepl }
