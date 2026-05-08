'use strict'

const fs = require('fs')
const path = require('path')
const { runsDir } = require('./state.js')

class JsonlLogger {
  constructor(filepath) {
    this.filepath = filepath
    fs.mkdirSync(path.dirname(filepath), { recursive: true })
    this.fd = fs.openSync(filepath, 'a')
    this.closed = false
  }

  log(type, fields = {}) {
    if (this.closed) return
    const event = { t: Date.now(), type, ...fields }
    fs.writeSync(this.fd, JSON.stringify(event) + '\n')
  }

  close() {
    if (this.closed) return
    this.closed = true
    try {
      fs.closeSync(this.fd)
    } catch {
      /* ignore */
    }
  }
}

function loggerFor(repoRoot, id, startedAt = Date.now()) {
  const filepath = path.join(runsDir(repoRoot), `${id}-${startedAt}.log`)
  return { logger: new JsonlLogger(filepath), filepath }
}

module.exports = { JsonlLogger, loggerFor }
