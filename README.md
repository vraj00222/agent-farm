# Agent Farm

Run Claude Code agents in parallel, each in its own isolated git worktree, from a native macOS app.

> **Website & Marketing:** [vraj00222/agent-farm-website](https://github.com/vraj00222/agent-farm-website) | [Live](https://website-topaz-phi-53.vercel.app)

https://github.com/user-attachments/assets/c2e31fc6-b019-488f-b631-95ff94eba6ae

## What it is

A lightweight Electron desktop app that orchestrates the `claude` CLI on your machine. Spawn multiple Claude agents in parallel—each gets its own git worktree and branch, isolated from main. Watch real-time output, review diffs, cherry-pick changes. Main branch stays clean until you merge.

**Not a service, not cloud-based.** Runs locally on your Mac. Uses your existing Claude login (Claude Code, Pro, Max, Team, or API key).

## Current Status

**v0.1.0 — Core runtime complete.** Full UI shipped + IPC wired + agent spawning functional. 

✅ Claude detection & authentication  
✅ Project open/clone/recent  
✅ Per-task agent spawning with git worktrees  
✅ Real-time output streaming  
✅ File diff tracking + commit capture  
✅ Embedded terminal for login flow  

See [`ROADMAP.md`](./ROADMAP.md) for the remaining work to v1.0.

## Getting Started

### Prerequisites

- macOS 12+
- Node.js 18+
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude` or Homebrew)
- Claude authenticated (`claude login`)

### Development

```bash
git clone git@github.com:vraj00222/agent-farm.git
cd agent-farm
npm install
npm run dev
```

Opens an Electron window with hot reload. Renderer changes (anything in `src/renderer/src/`) refresh instantly; main process edits (`src/main/`) trigger a restart.

### Build & Package

```bash
# Type-check + bundle (no DMG)
npm run build

# Build + package as unsigned macOS DMG (outputs to release/)
npm run package

# Quick smoke test
npm run smoke
```

## Architecture

### How It Works

1. **Detection**: App probes your system for the `claude` CLI binary on startup, checking standard install paths (Homebrew, npm, nvm, ~/.local/bin, etc.)
2. **Auth Check**: Validates `~/.claude.json` exists and has been written by `claude login` (file size > 64 bytes indicates authenticated state)
3. **Project Binding**: User opens a local git repo or clones one from GitHub
4. **Agent Spawn**: For each prompt, app creates:
   - A new git worktree off the current branch
   - A slug-based branch name (auto-generated from prompt keywords)
   - A `claude -p` subprocess with `--dangerously-skip-permissions`
5. **Isolation**: Each agent runs in its own worktree; main branch untouched. Output streams to UI in real-time
6. **Capture**: On exit, app records file changes, git commits, and exit code
7. **Merge**: User reviews diffs and cherry-picks commits back to main

### Worktree Storage

Worktrees live in `~/.agent-farm/worktrees/` (not in your project tree), keeping your directory listings clean even after spawning many agents.

### Project Structure

```
src/
├── main/                      Electron main process (Node.js)
│   ├── index.ts              IPC handlers + app lifecycle
│   ├── claude.ts             Binary detection + auth check
│   ├── agent-runner.ts       Spawn agents, stream output, capture results
│   ├── worktree.ts           git worktree create/remove
│   ├── project.ts            Open folders, clone repos, inspect paths
│   ├── pty.ts                Embedded terminal sessions
│   ├── fs-list.ts            Recursive file tree listing
│   ├── git-diff.ts           git diff invocation
│   ├── settings.ts           Electron store (recent projects, etc.)
│   └── logger.ts             Structured logging to ~/.agent-farm/logs/
├── preload/
│   └── index.ts              contextBridge surface (AgentFarmApi)
└── renderer/
    └── src/
        ├── App.tsx           Root app state + routing
        ├── components/
        │   ├── ClaudeLoginPanel.tsx     Embedded /login flow
        │   ├── EmbeddedTerminal.tsx     xterm.js wrapper
        │   ├── MainPanel.tsx            Agent output view
        │   ├── AgentList.tsx            Task list sidebar
        │   ├── PromptBar.tsx            User input + submit
        │   ├── ModelPicker.tsx          Model selector
        │   ├── StatusStrip.tsx          Footer status bar
        │   ├── WelcomeScreen.tsx        Onboarding + recents
        │   └── ... (other UI)
        ├── types/             TypeScript definitions
        └── styles/            Tailwind + design tokens
├── shared/
│   └── ipc.ts               Typed IPC surface (all channels + schemas)
├── electron.vite.config.ts  Build config
├── electron-builder.yml     DMG packaging
├── tailwind.config.ts       Design system (palette, fonts, motion)
└── PRODUCT.md              Brand direction + design rationale
```

### IPC Contract

All main ↔ renderer communication is defined in `src/shared/ipc.ts`:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `claude:detect` | main ← renderer | Detect Claude CLI + check auth |
| `project:open` | main ← renderer | Open local folder picker |
| `project:clone` | main ← renderer | Clone GitHub repo |
| `project:recent:*` | main ← renderer | List/forget recent projects |
| `agent:spawn` | main ← renderer | Spawn a new agent task |
| `agent:kill` | main ← renderer | Kill running agent |
| `agent:event` | main → renderer | Broadcast agent state changes (spawn, output, done) |
| `pty:*` | bidirectional | Create/write/resize/kill embedded terminals |
| `fs:list` | main ← renderer | Recursive file tree (capped at depth/count) |
| `git:diff` | main ← renderer | Get `git diff` for current project |

## Features

### Claude Authentication

- **Seamless Detection**: Probes system PATH + known Homebrew/npm locations
- **OAuth Flow**: Built-in `/login` terminal if not authenticated
- **No Token Storage**: Delegates to Claude CLI's credential system
- **Error Handling**: Clear messages for missing/broken installs

### Project Management

- **Local Folders**: Open any git repo on your Mac
- **GitHub Clone**: Paste a GitHub URL, auto-clones to ~/Developer
- **Recent Projects**: Quick-access list with timestamps
- **Git Status**: Shows branch, dirty state, HEAD SHA

### Agent Spawning

- **Parallel Execution**: Run multiple agents simultaneously
- **Real-Time Output**: Streams stdout/stderr as it happens
- **Model Selection**: Choose claude-opus-4-7 or other models
- **Auto-Branching**: Creates `agent/<slug>` branches, never touches main

### Results Capture

- **File Changes**: Lists all modified/added files
- **Commits**: Shows commits created during the task
- **Exit Codes**: Distinguishes success, error, cancellation
- **Elapsed Time**: Wall-clock duration for each task

### UI Affordances

- **Welcome Screen**: Project picker, recents, quick-start demo
- **Agent List**: Sidebar showing all tasks, status dots, elapsed time
- **Main Panel**: Live output, scrollable history, syntax-highlighted for key patterns
- **Right Panel**: File tree, git diff view, project metadata
- **Prompt Bar**: At bottom, send prompt to spawn new agent
- **Model Picker**: Dropdown to choose Claude model
- **Embedded Terminal**: For login flow, no browser required

## Troubleshooting

### "Claude not found"

Agent Farm searches these locations (in order):
- `$PATH` via your login shell (handles asdf, nvm, custom shells)
- `/opt/homebrew/bin/claude` (Apple Silicon Homebrew)
- `/usr/local/bin/claude` (Intel Homebrew, classic)
- `~/.local/bin/claude` (npm -g, pip user installs)
- `~/.npm-global/bin/claude` (custom npm prefix)
- `~/.nvm/versions/node/*/bin/claude` (nvm)
- `~/.claude/local/claude` (custom installs)

If not found, run `which claude` in your terminal to verify it's installed. Then close and reopen Agent Farm.

### "Claude not signed in"

Run `claude login` in your terminal, complete the OAuth flow, then click "Sign in" in the app or close/reopen it.

### Worktree cleanup

If an agent crashes, worktrees may be left behind in `~/.agent-farm/worktrees/`. You can safely delete them or run `git worktree prune` in your main project.

### Logs

App logs go to `~/.agent-farm/logs/`. Check there for detailed error messages.

## Tech Stack

- **Electron 33** + **electron-vite 2** (build, HMR) + **electron-builder 25** (packaging)
- **TypeScript** end-to-end (main, preload, renderer)
- **React 18** + **Tailwind 3.4** (UI)
- **node-pty 1.1** (embedded terminal)
- **Fonts**: Geist, JetBrains Mono, Doto (dot-matrix)
- **Design System**: Tinted black & white, semantic state via color + dots. See [`PRODUCT.md`](./PRODUCT.md).

## Contributing

Contributions welcome. Please check [`ROADMAP.md`](./ROADMAP.md) to see what's next before opening a PR.

## License

MIT. See [`LICENSE`](./LICENSE).
