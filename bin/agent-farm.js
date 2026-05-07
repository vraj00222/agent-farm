#!/usr/bin/env node
'use strict'

const { run } = require('../src/run.js')

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`agent-farm: ${err.message}\n`)
  process.exit(1)
})
