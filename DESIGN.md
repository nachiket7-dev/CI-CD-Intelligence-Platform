# Design: CI/CD Intelligence Platform

The locked system. Every Hallmark run reads this first and screens share it. Change it on purpose; the file is the rule. `frontend/src/tokens.css` is the source of truth for values.

## System
- Genre: modern-minimal
- Shape of the first page: app screen (the run ledger)
- Theme: Console, graphite colourway (from Hallmark, `references/themes/console.md`)
- Axes: dark / grotesk-sans / chromatic-amber, posture restrained
- Signature: the prediction receipt, one risk reading set large in the measured face, then its signals and a trail showing the score came before the outcome

## What colour means
Colour carries meaning here. Do not use it for decoration.
- **Amber (`accent`)**: a person's action or choice. The primary button, the selected filter, an active model.
- **Cool blue (`cool`)**: something the model measured. Risk readings, model scores, the loud chart series.
- **Green (`ok`) and red (`bad`)**: outcomes and direction. Passed or failed, a signal that lowers or raises risk.
- **Greys (`paper`, `ink`, `muted`, `rule`)**: everything else. Three surface steps and no shadows.

## Tokens
`tokens.css` is the source of truth. The roles:
```css
:root {
  --color-paper: oklch(17% 0.008 250);  --color-paper-2: oklch(21% 0.009 250);  --color-paper-3: oklch(13.5% 0.007 250);
  --color-ink: oklch(95% 0.005 250);  --color-ink-2: oklch(83% 0.008 250);  --color-muted: oklch(71% 0.01 250);
  --color-rule: oklch(31% 0.01 250);  --color-rule-2: oklch(42% 0.012 250);
  --color-accent: oklch(82% 0.15 80);  --color-accent-ink: oklch(18% 0.04 75);  --color-accent-soft: oklch(29% 0.05 80);  --color-focus: oklch(82% 0.15 80);
  --color-cool: oklch(77% 0.12 245);  --color-cool-soft: oklch(29% 0.05 245);
  --color-ok: oklch(76% 0.15 150);  --color-ok-soft: oklch(24.5% 0.03 150);  --color-bad: oklch(70% 0.17 25);  --color-bad-soft: oklch(24.5% 0.035 25);
  --font-display: "Host Grotesk Variable", system-ui, sans-serif;  --font-body: var(--font-display);  --font-outlier: "Atkinson Hyperlegible Mono", ui-monospace, monospace;
  --radius-card: 10px;  --radius-pill: 6px;  --rule-hair: 1px;  --shadow-card: none;
}
```
The spacing scale, the type scale (a fixed 1.2 ratio for app screens), the easings and the durations live in `tokens.css`. In Tailwind they are utilities: `bg-paper-2`, `text-muted`, `border-rule`, `font-outlier`, `rounded-card`.

Colourways: graphite (shipped). `paper` (light) is defined in Hallmark's Console theme and not built yet; see `docs/UI_BRIEFS.md`.

## Type
- Host Grotesk for everything a person reads. Weight 500 for headings, never 700. Sentence case everywhere.
- Atkinson Hyperlegible Mono (`font-outlier`) only for what was measured: percentages, ids, timestamps, scores. Always with `num` (tabular numerals). Never for labels, heads or buttons.
- Labels, captions and table heads: the body face, one step smaller, `text-muted`, not capitals, not tracked.

## Controls
- Primary: amber fill, 6px radius, 36px high (44px on touch). One per screen.
- Secondary: outlined, same radius and height. Quiet: text only.
- Selected filter: `accent-soft` background with `accent` text.
- Every control has hover, focus-visible, active, disabled and busy states.

## Layout and data
- Shell: a top bar with four destinations. Add a sidebar only past about seven.
- Tables before cards. Horizontal rules only, no outer border. Panels are one hairline surface and are never nested.
- Every region that loads data draws four states through `DataState`: loading (a skeleton in the shape of the content), empty (what belongs here and the one action that fills it), error (what broke and what to do), full.
- Filters, tabs and pages live in the URL (`useUrlState`).
- Charts are hand-written SVG: one y-axis, zero baseline, hairline grid, one loud series (cool), the rest neutral.

## Motion
- Character: still. State changes only (`--dur-micro`, `--dur-short`). No entrance animations. Under reduced motion everything ends at once.

## Writing
- Name things by what people do, not how the system is built: "Score this run", not "Invoke predict".
- A button keeps its name through the flow. Errors say what happened and what to do, and do not apologise.
- Never invent a figure. Sample data is labelled, and the "synthetic data" banner is always on screen.

## Exports
`tokens.css` in this project. Tailwind v4 is already wired through `@theme static`. DTCG or shadcn blocks on request, per Hallmark's `export-formats.md`.
