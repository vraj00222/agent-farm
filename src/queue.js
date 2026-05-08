'use strict'

class Semaphore {
  constructor(maxConcurrent) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error(`maxConcurrent must be a positive integer (got ${maxConcurrent})`)
    }
    this.max = maxConcurrent
    this.running = 0
    this.waiters = []
  }

  async acquire() {
    if (this.running < this.max) {
      this.running++
      return
    }
    await new Promise((resolve) => this.waiters.push(resolve))
    this.running++
  }

  release() {
    this.running--
    const next = this.waiters.shift()
    if (next) next()
  }

  async run(fn) {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

module.exports = { Semaphore }
