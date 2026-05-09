# Agent Farm

Run Claude Code agents in parallel, each in its own isolated git worktree, from a native Mac app.

> Marketing site lives in its own repo: [vraj00222/agent-farm-website](https://github.com/vraj00222/agent-farm-website)
> Live: [website-topaz-phi-53.vercel.app](https://website-topaz-phi-53.vercel.app)

## What it is

A small Electron desktop app that orchestrates the `claude` CLI on your machine. Each task spawns a worktree, a branch, and a `claude -p` process. The app surfaces structured events as they stream in, lets you review diffs, and cherry-picks the wins. Main branch stays untouched until you choose to touch it.

Not a hosted service. No server in the data path. Brings your own `claude` login (Pro, Max, Team, or API key).

## Status

**v0.1.0 — UI complete, runtime not yet wired.** The full visual surface ships: welcome screen, agent list, main panel, prompt bar, model picker, Create-project modal. Spawning is currently stubbed pending main-process IPC. See [`ROADMAP.md`](./ROADMAP.md) for the dependency-ordered path to v1.0.

## Develop

```bash
git clone git@github.com:vraj00222/agent-farm.git
cd agent-farm
npm install
npm run dev
```

This opens an Electron window with hot reload. Edit anything under `src/renderer/src/` and the renderer refreshes; edit `src/main/` and the main process restarts.

## Build

```bash
# Type-check + bundle (no DMG)
npm run build

# Build + package as unsigned macOS DMG (output: release/)
npm run package
```

## Tech stack

- **Electron 33** + **electron-vite 2** (build) + **electron-builder 25** (packaging)
- **TypeScript** end to end (main, preload, renderer)
- **React 18** + **Tailwind 3.4** in the renderer
- **Geist** + **JetBrains Mono** + **Doto** (dot-matrix display) via Google Fonts
- Custom design system: pure tinted black & white, no accent color, semantic state via dots only. See [`PRODUCT.md`](./PRODUCT.md) for the full direction.

## Layout

```
agent-farm/
├── src/
│   ├── main/                  Electron main process (Node)
│   │   ├── index.ts
│   │   └── tsconfig.json
│   ├── preload/               contextBridge surface
│   │   ├── index.ts
│   │   └── tsconfig.json
│   └── renderer/              React app (browser context)
│       ├── index.html
│       ├── tsconfig.json
│       └── src/
│           ├── App.tsx
│           ├── components/    UI components
│           ├── lib/           Pure helpers
│           ├── styles/        Tailwind globals
│           └── types/         Shared TS types
├── electron.vite.config.ts    Build config (defines __APP_VERSION__)
├── electron-builder.yml       Mac DMG packaging config (unsigned for now)
├── tailwind.config.ts         Design tokens (palette, fonts, motion)
├── postcss.config.cjs
├── tsconfig.json              Project references
├── PRODUCT.md                 Brand voice + design direction
└── ROADMAP.md                 Dependency-ordered path to v1.0
```

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for the full plan. Critical path to v1.0 in eight phases:

| phase | what |
|---|---|
| A | Typed IPC + preload + settings + logger |
| B | Open / Create / Recent / Clone projects |
| C | Spawn claude (port runner from CLI to TS), live event stream |
| D | Diff view, cherry-pick action, conflict UI |
| E | Claude detection on first launch, error toasts, loading states |
| F | App icon, native macOS menu, settings panel |
| G | Apple Developer ID signing + notarization + GitHub Releases |
| H | Real screenshots, demo video, custom domain, Show HN |

~10 focused dev days, ~3 weeks calendar.

## License

MIT. See [`LICENSE`](./LICENSE).
