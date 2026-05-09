# Agent Farm

## Register

`brand` — the marketing site is the surface in scope. The CLI and Mac app are the products being marketed.

## What it is

A small open-source orchestrator that spawns N Claude Code processes in parallel, each isolated in its own git worktree. Ships as both a Node CLI (terminal-native) and a Mac desktop app (Electron + TS + React). Ports nothing; orchestrates everything; gets out of the way.

## Users

Senior engineers who already use Claude Code daily and have hit the wall of single-task pair-programming. They are skeptical of marketing pages by reflex, read manuals for fun, run their terminal at 50% opacity over their code editor, and judge tools by the second screen they look at. They will reject the page in 5 seconds if anything looks like generic AI SaaS.

## Brand voice (three concrete words)

**Industrial. Opinionated. Quiet.**

- **Industrial**: the page is built like a piece of equipment, not a brochure. Hard color, dense information, real terminal output, no decorative elements that don't carry weight.
- **Opinionated**: the page makes claims, not features. Tells the user what it doesn't do as confidently as what it does.
- **Quiet**: when something is loud (the hero color drench), nothing else competes. No racing micro-animations, no decorative pills, no scrolling parallax.

## Strategic principles

1. **The work IS the marketing.** Real terminal sessions, real commands, real ASCII. Not screenshots of an app that doesn't exist yet.
2. **Color drench over restraint.** A single saturated brand color carries 50–70% of the surface. Off-white type sits on top. The brand IS the color. Restraint here would be invisible.
3. **One sans family.** Multiple weights, tight tracking, strong weight contrast. No serif. No display + body pairing.
4. **Density when it matters, breath when it counts.** Not equal whitespace. The hero breathes; the install instructions are dense.
5. **One animated moment.** Type rises on first paint. Nothing scroll-jacks. Nothing pulses for attention.
6. **Anti-template by negation.** No card grids, no eyebrow pills, no gradient text, no 3D mockups, no hero-metric template, no centered-stack, no chrome around code blocks pretending to be a terminal window.

## Anti-references

What this site is **not**:

- Linear / Raycast — clean indigo, generic Mac-native polish, "Built for the way you actually work". Saturated by every YC-S24 dev tool. No.
- Stripe Press / Notion blogs — cream paper, Newsreader / Fraunces serif, italic drop caps, ruled separators, broadsheet grid. The current saturated trap. Banned by impeccable's reflex-reject lane list. No.
- Vercel monochrome — pure black with one neon accent. Strong, but already the second-most-saturated dev-tool aesthetic after Linear. Avoid.
- Old-school Electron-app landing pages — screenshot grid with feature blurbs. Generic. No.

## Real reference

**Klim Type Foundry's `#ff4500` orange drench** as the strategic anchor. A committed warm color carries the entire surface. Off-white type sits on top. Mono used only for code, never for "tech costume". Layout is asymmetric and confident, not centered.

Specific lift: a single committed hue (warm burnt orange in the `#E25C2A`–`#D44E1F` range), Switzer or similar humanist grotesque (NOT on impeccable's reflex-reject list), Departure Mono for terminal blocks (distinctive, NASA-control-panel inspired, NOT Space Mono / IBM Plex / JetBrains Mono).

## Tone of copy

- Active voice. Short sentences. No hedging.
- Claims, not features. "Six tasks. Six worktrees. One you." > "Built for the way you actually work."
- No em dashes (`—`). Use commas, colons, periods, parentheses.
- No corporate softening ("we believe", "we think", "designed to help you"). Direct subject + verb.
- Terminal output is real, not stylized. Commands you would actually type.

## Success criteria

A skeptical senior engineer scrolls the page once, says "huh, that's not AI-shaped", and either bookmarks it or installs it. They cannot guess the aesthetic family from the category alone.
