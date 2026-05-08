# agent-farm

Run multiple Claude Code agents in parallel, each isolated in its own Git worktree, with a single terminal command. Type tasks, watch them spawn, review the diffs, cherry-pick the wins.

## what it is

agent-farm is a CLI harness for running N `claude` processes in parallel against the same repo. Each task gets its own sibling worktree (`../<repo>-<id>/`) on a fresh `agent/<id>` branch, so claude can edit autonomously without ever touching your working tree. When the work is done, you get a list of cherry-pick commands and the diffs are reviewable inside the TUI.

It is **not** another AI product. It is process orchestration + filesystem isolation + a polished terminal UI around the existing `claude` CLI.

## requirements

- Node.js 18+
- `git` 2.20+ (worktree support)
- `claude` CLI on PATH — `npm i -g @anthropic-ai/claude-code`
- macOS, Linux, or WSL

## install

```bash
git clone git@github.com:vraj00222/agent-farm.git
cd agent-farm
npm install && npm link
```

`npm link` symlinks `bin/agent-farm.js` into your global `node_modules/.bin`, so `agent-farm` is now available everywhere.

## usage

From inside any git repo with a clean tracked tree.

### Open the TUI

```bash
agent-farm
```

The TUI opens with an empty side panel and a prompt box at the bottom. Type a task, press Enter, and an agent spawns in a fresh worktree right away. Type another, press Enter — it spawns in parallel (up to `--max` concurrent; the rest queue automatically). The side panel ticks elapsed times, the right pane shows the selected agent's tail or diff.

```
type & enter   spawn a new task
esc            clear the input
↑ / ↓          select agent in the side panel
tab            cycle  tail → diff(file 1) → diff(file 2) → … → tail
shift+tab      cycle the other way
ctrl+c         quit (SIGTERMs running agents)
```

Header shows: `✓ claude <version>  ·  model <name|default>  ·  ⚠ skip-perms  ·  <sha>/<repo>  ·  <queued/running/done/failed counts>`.

### Pre-load tasks from argv

```bash
agent-farm "fix the typo in the readme"

agent-farm \
  "fix the typo in the readme" \
  "add a license header to all .js files in src/" \
  "@bench: benchmark the slugify function and write the result to BENCH.md"

agent-farm --max 2 "p1" "p2" "p3" "p4"           # 2 run, 2 queue
agent-farm --model opus "review src/auth.ts for bugs"
```

These behave identically to typing the prompts in the input box — they're just queued before the TUI mounts so you can watch them spawn.

### Subcommands

```bash
agent-farm status           # print state.json table — works mid-run or after
agent-farm logs <id>        # render an agent's JSONL run log
```

### Plain log stream (CI / pipes)

When stdout is not a TTY (or `CI=1` / `AGENT_FARM_NO_TUI=1`), the TUI is replaced by tagged log lines. Use this for CI runs:

```bash
AGENT_FARM_NO_TUI=1 agent-farm "p1" "p2" 2>&1 | tee farm.log
```

Stream mode requires at least one prompt on argv — there's no input box without a TTY.

## how the worktrees work

Each prompt becomes:

- `agent/<id>` — a new branch off your current HEAD
- `../<repo>-<id>/` — a sibling worktree on that branch
- one `claude -p --dangerously-skip-permissions [--model X] "<prompt>"` process running in it

The first thing you see in each agent's tail is the literal command being executed, so there's no mystery about what claude is doing in the worktree.

When claude finishes, agent-farm prints the `git cherry-pick agent/<id>` line for each successful task plus the matching `git worktree remove …` cleanup. Worktrees are kept until you remove them, so failed runs are inspectable.

## hybrid commit handling

Claude Code in `-p` mode often does the work but doesn't commit. That breaks `git cherry-pick`. Two-layer fix:

1. **Asked to commit.** Each prompt is wrapped with an instruction telling claude to `git add -A && git commit -m "..."` when done. Claude usually does, with a sensible message.
2. **Auto-commit fallback.** If after claude exits the worktree is still dirty, agent-farm runs `git add -A && git commit -m "agent-farm: <id> (auto-commit)"`. The agent's work is always at least one commit on `agent/<id>`. Cherry-pick always works.

`autoCommitted: true` is flagged in the summary line so you can tell which were claude's commits vs. ours.

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

`state.json` is the source of truth while a session runs, and is what `agent-farm status` reads. Run logs are append-only JSONL — one event per line — designed for replay and observability.

## license

MIT. See `LICENSE`.
