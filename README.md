# agent-farm

agent-farm is a local dev tool. You give it a list of tasks, it spawns a Git Worktree per task, runs Claude Code inside each one autonomously, then surfaces the diffs for you to review and cherry-pick into main. Zero conflict, full parallelism.

## status

**v0.0.4 — live TUI with embedded prompt input.** A single `agent-farm` command opens a split-pane terminal UI: agent list on the left (state glyphs, live-ticking elapsed), output pane on the right that toggles between tail and a syntax-highlighted diff view, and a Claude-Code-style input box at the bottom. Type a task, press Enter, the agent spawns immediately while existing ones keep running. Side panel is navigable any time, even mid-run. CI / piped stdout falls back to the plain log stream automatically. Cherry-pick orchestration + detach-without-kill arrive in v0.0.5.

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

### Open the TUI

```bash
agent-farm
```

The TUI opens with an empty side panel and a prompt box at the bottom. Type a task, press Enter, and an agent spawns in a fresh worktree right away. Type another, press Enter — it spawns in parallel (up to `--max` concurrent; the rest queue automatically). The side panel ticks elapsed times, the right pane shows the selected agent's tail or diff. Navigate at any time:

```
type & enter   spawn a new task
esc            clear the input
↑ / ↓          select agent in the side panel
tab            cycle  tail → diff(file 1) → diff(file 2) → … → tail
shift+tab      cycle the other way
ctrl+c         quit (SIGTERMs running agents)
```

### Pre-load tasks from argv

```bash
agent-farm "fix the typo in the readme"

agent-farm \
  "fix the typo in the readme" \
  "add a license header to all .js files in src/" \
  "@bench: benchmark the slugify function and write the result to BENCH.md"

agent-farm --max 2 "p1" "p2" "p3" "p4"   # 2 run, 2 queue; UI still opens
```

These behave identically to typing the prompts in the input box — they're just queued before the TUI mounts so you can watch them all spawn at once.

### Subcommands

```bash
agent-farm status           # print state.json table — works mid-run or after
agent-farm logs <id>        # render an agent's JSONL run log
```

### Plain log stream (CI / pipes)

When stdout is not a TTY (or `CI=1` / `AGENT_FARM_NO_TUI=1`), the TUI is replaced by tagged log lines (the v0.0.3 visual). Use this for CI runs:

```bash
AGENT_FARM_NO_TUI=1 agent-farm "p1" "p2" 2>&1 | tee farm.log
```

Stream mode requires at least one prompt on argv — there's no input box without a TTY.

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
| v0.0.4 ✓ | Ink split-pane TUI, diff view, plain-stream fallback for CI |
| v0.0.5 | cherry-pick orchestration + conflict pause + `agent-farm attach` |
| v0.0.6 | `--tasks tasks.json`, `clean`, `kill`, `retry`, history |
| v0.1.0 | tag, publish, write the launch post |
