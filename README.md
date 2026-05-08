# agent-farm

agent-farm is a local dev tool. You give it a list of tasks, it spawns a Git Worktree per task, runs Claude Code inside each one autonomously, then surfaces the diffs for you to review and cherry-pick into main. Zero conflict, full parallelism.

## status

**v0.0.3 — REPL + state + queue.** Run `agent-farm` with no args to drop into an interactive prompt loop, type tasks one per line, then `run` to fan them out. A real maxConcurrent queue (default 3) gates parallelism. Every transition is recorded in `.agent-farm/state.json`; every agent gets a JSONL run log under `.agent-farm/runs/`. New subcommands: `agent-farm status` and `agent-farm logs <id>`. Ink TUI is next (v0.0.4).

## requirements

- Node.js 18+
- `git` 2.20+ (worktree support)
- `claude` CLI on PATH — `npm i -g @anthropic-ai/claude-code`

## install (local dev)

```bash
git clone git@github.com:vraj00222/agent-farm.git
cd agent-farm
npm link
```

`npm link` symlinks `bin/agent-farm.js` into your global `node_modules/.bin`, so `agent-farm` is now available everywhere.

## usage

From inside any git repo with a clean tracked tree.

### REPL (default)

```bash
agent-farm
```

```
agent-farm REPL — type a prompt per line.
  run    start the queue with what you have so far
  drop   discard the last prompt
  quit   exit without running (Ctrl+D / Ctrl+C also abort)

? task 1 › fix the JWT bug in src/auth/middleware.ts
? task 2 › @bench: benchmark slugify and write result to BENCH.md
? task 3 › run
```

### CLI fan-out

```bash
# one task
agent-farm "fix the typo in the readme"

# many tasks
agent-farm \
  "fix the typo in the readme" \
  "add a license header to all .js files in src/" \
  "@bench: benchmark the slugify function and write the result to BENCH.md"

# cap parallelism explicitly (default 3)
agent-farm --max 2 "p1" "p2" "p3" "p4"   # 2 run, 2 queue
```

### Subcommands

```bash
agent-farm status           # print state.json table — works mid-run or after
agent-farm logs <id>        # render an agent's JSONL run log
```

Each prompt becomes:

- `agent/<id>` — a new branch off your current HEAD
- `../<repo>-<id>/` — a sibling worktree on that branch
- one `claude -p --dangerously-skip-permissions` process running in it

Logs interleave with colored, padded `[<id>]` tags so you can read three concurrent sessions in one pane. At the end you get a summary table, the cherry-pick commands, and the cleanup commands — both as copy-pasteable lines.

```
[agent-farm] 3 tasks · base 6b1ba6d1 · repo agent-farm
  ▸ fix-readme-typo      agent/fix-readme-typo
  ▸ add-license-headers  agent/add-license-headers
  ▸ bench                agent/bench

[fix-readme-typo    ] spawning claude in /Users/v/Developer/agent-farm-fix-readme-typo
[add-license-headers] spawning claude in /Users/v/Developer/agent-farm-add-license-headers
[bench              ] spawning claude in /Users/v/Developer/agent-farm-bench
[fix-readme-typo    ] reading README.md...
[add-license-headers] scanning src/...
...
[fix-readme-typo    ] done in 8.3s · 1 commit · 1 file
[bench              ] done in 12.1s · 2 commits · 2 files
[add-license-headers] no-op in 6.2s (claude made no changes)

[agent-farm] summary
  ✓ fix-readme-typo       8.3s   1 commit · 1 file
  ✓ bench                12.1s   2 commits · 2 files
  ○ add-license-headers   6.2s   no changes

cherry-pick:
  git cherry-pick agent/fix-readme-typo
  git cherry-pick agent/bench

cleanup:
  git worktree remove "/Users/v/Developer/agent-farm-fix-readme-typo" && git branch -D agent/fix-readme-typo
  git worktree remove "/Users/v/Developer/agent-farm-bench" && git branch -D agent/bench
  git worktree remove "/Users/v/Developer/agent-farm-add-license-headers" && git branch -D agent/add-license-headers
```

## how commits work (hybrid model)

Claude Code in `-p` mode often does the work but doesn't commit. That breaks `git cherry-pick`. Two-layer fix:

1. **Asked to commit.** Each prompt is wrapped with an instruction telling claude to `git add -A && git commit -m "..."` when done. Claude usually does, with a sensible message.
2. **Auto-commit fallback.** If after claude exits the worktree is still dirty, agent-farm runs `git add -A && git commit -m "agent-farm: <id> (auto-commit)"`. The agent's work is always exactly N≥1 commits on `agent/<id>`. Cherry-pick always works.

`autoCommitted: true` is flagged in the summary line so you can tell the difference.

## why `--dangerously-skip-permissions`?

Headless Claude Code can't answer permission prompts — there's no human in the loop during a parallel run. The blast radius is the worktree, not your main checkout, so claude can only modify files in `../<repo>-<id>/`. You always review the diff before cherry-picking. This is the standard pattern for Claude Code in CI / agent-orchestrator contexts.

## state on disk

```
your-repo/
├── .agent-farm/
│   ├── state.json              # written atomically on every transition
│   └── runs/
│       ├── fix-auth-1714000000000.log     # JSONL: spawn / stdout / stderr / exit
│       └── bench-1714000005000.log
└── ...
```

`state.json` is the source of truth while a session runs, and is what `agent-farm status` reads. Run logs are append-only JSONL — one event per line — designed for replay and observability without changing the schema.

## roadmap

| rung | adds |
|------|------|
| v0.0.1 ✓ | single-task spike |
| v0.0.2 ✓ | N parallel tasks, tagged interleaved logs, hybrid commit, summary + cleanup |
| v0.0.3 ✓ | REPL input, `.agent-farm/state.json`, queue with maxConcurrent, `status` + `logs` subcommands |
| v0.0.4 | Ink split-pane TUI |
| v0.0.5 | cherry-pick orchestration + conflict pause |
| v0.0.6 | `--tasks tasks.json`, `clean`, `kill`, `retry`, history |
| v0.1.0 | tag, publish, write the launch post |
