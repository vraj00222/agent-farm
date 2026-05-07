# agent-farm

agent-farm is a local dev tool. You give it a list of tasks, it spawns a Git Worktree per task, runs Claude Code inside each one autonomously, then surfaces the diffs for you to review and cherry-pick into main. Zero conflict, full parallelism.

## status

**v0.0.1 — single-task spike.** Runs one prompt in one worktree end to end. Parallelism, REPL, TUI, and cherry-pick automation arrive in the next rungs (v0.0.2 → v0.0.5).

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

From inside any clean git repo:

```bash
agent-farm "fix the typo in the readme"
```

What happens:

1. precondition checks: `claude` on PATH, repo is git, no modified tracked files
2. slugify prompt → `fix-typo-readme` (override with `@my-id: <prompt>`)
3. `git worktree add ../<repo>-fix-typo-readme -b agent/fix-typo-readme` off your current HEAD
4. spawn `claude -p --dangerously-skip-permissions "<prompt>"` in that worktree
5. stream tagged stdout/stderr: `[fix-typo-readme] …`
6. on clean exit: print the diff + the cherry-pick command. worktree is kept for inspection.

To accept the work:

```bash
git cherry-pick agent/fix-typo-readme
git worktree remove ../<repo>-fix-typo-readme
git branch -D agent/fix-typo-readme
```

## why `--dangerously-skip-permissions`?

Headless Claude Code can't answer permission prompts — there's no human in the loop during a parallel run. The blast radius is the worktree, not your main checkout, so claude can only modify files in `../<repo>-<id>/`. You always review the diff before cherry-picking. This is the standard pattern for Claude Code in CI / agent-orchestrator contexts.

## roadmap

| rung | adds |
|------|------|
| v0.0.1 ✓ | single-task spike |
| v0.0.2 | N parallel tasks, tagged interleaved logs |
| v0.0.3 | REPL input, `state.json`, queue with maxConcurrent |
| v0.0.4 | Ink split-pane TUI |
| v0.0.5 | cherry-pick orchestration + conflict pause |
| v0.0.6 | `--tasks tasks.json`, `clean`, `kill`, `retry`, JSONL logs |
| v0.1.0 | tag, publish, write the launch post |
