# MAGNITUDE

A question-led data publication. Every post is a **question** answered with one
or two charts. The question is the unit of the site — not the card, not the
date, not the byline.

Three surfaces:

| Route | What it is |
|---|---|
| `/` and `/[category]` | The wall — ten questions from one category, full screen, never scrolls. Wheel, drag, arrow keys or the colour bands switch category with a full-screen colour sweep. |
| `/[category]/all` | The archive — every question in the category as a numbered editorial list. |
| `/[category]/[slug]` | The article — mostly white and black, so the charts own the colour. |

Astro + MDX, static output, hand-written CSS, no UI framework. Most charts are
computed with D3 scales at build time and shipped as inert inline SVG, so a post
is plain HTML by the time it reaches a browser. One — the wage explorer — is
interactive, and still server-renders a flat version for readers without
JavaScript.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:4321/Magnitude
npm run build    # type-checks, then writes dist/
npm run preview  # serve dist/ exactly as it will be served in production
npm run data     # rebuild src/data/wages.json from data/source/
```

---

## Adding a post

Create `src/content/questions/<slug>.mdx`. The filename is the URL:
`src/content/questions/who-is-the-average-landlord.mdx` publishes at
`/housing/who-is-the-average-landlord`.

```mdx
---
question: Who is the average landlord?
answer: One sentence that actually answers the question. This runs as the standfirst.
category: housing        # housing | work | energy | health | food | mobility | culture
sources:
  - ONS                  # the first one shows in the metadata line
  - Land Registry
charts: 1
readingMinutes: 4
date: 2026-07-01
draft: false             # drafts show in `npm run dev` and never in a build
---

import Figure from '../../components/Figure.astro';
import BarChart from '../../components/charts/BarChart.astro';

Prose. Plain paragraphs, `##` for a section, `###` for a small mono label like
the METHOD heading at the foot of the shipped posts.

<Figure n={1} title="What the chart shows" source="ONS, table 5, 2024">
  <BarChart
    caption="One line saying what is plotted."
    suffix="%"
    bars={[
      { label: 'Owns one', value: 43 },
      { label: 'Owns 2–4', value: 38 },
    ]}
  />
</Figure>
```

That is the whole workflow. No index to update, no list to edit — the post
appears on the wall, in the archive, and at its own URL on the next build.

### The question pipeline

`src/data/pipeline.ts` holds the questions you intend to answer but have not
written yet. They fill the wall and the archive as plain type (marked `SOON`,
not links), so the site reads as a publication from day one.

When a post's `question` frontmatter matches a pipeline entry, the entry
disappears and the real post takes its place — matching ignores case and
punctuation, so near-misses still resolve. **Published posts sort newest first
and take the biggest slots on the wall**, pipeline questions fill the rest.

Delete anything in that file freely. It is scaffolding for your own questions.

---

## The three components a post is built from

**`<Figure n title source>`** — wraps a chart with the hairline, the
`FIG. 1 · …` line in the category colour, and the source note underneath. On
screens ≥ 1200px it bleeds 80px left into the margin rail.

**`<KeyNumber value note>`** — the pull-quote number: 44px mono in the category
colour on the faintest wash of it, between two hairlines. One per post at most.

**`<MarginNote>`** — sits in the left rail on wide screens, folds into the
column below 1200px.

---

## Charts

Three components. `BarChart` and `LineChart` compute their geometry with D3
scales at build time and ship no JavaScript at all; `WageShapes` is the one
interactive chart on the site.

**`<BarChart>`** — comparing magnitude across named things.

```jsx
<BarChart
  caption="What is plotted."
  bars={[{ label: 'Paris', value: 14.6 }]}
  decimals={1}      // optional
  prefix="€"        // optional
  suffix=" yrs"     // optional
  max={20}          // optional; otherwise the largest value, nice()'d
/>
```

**`<WageShapes>`** — the engraved silhouettes built for the wages post. Reads
`src/data/wages.json`, takes no props. The only chart on the site that ships
JavaScript; everything else is inert SVG. Two arrangements — a stacked wave and
a 7×7 specimen sheet — with the shapes morphing between them, and three
orderings. Direction of lean is carried twice, by a diverging ink and by the
hatch angle (╲ where the bottom stretches, ╱ where the top does), with the
spacing of the hatch carrying how far, so it never rests on colour alone.

**`<LineChart>`** — change over a continuous x (time, months, age).

```jsx
<LineChart
  caption="What is plotted."
  series={[{ name: 'Seville', points: [{ x: 1, y: 85 }] }]}
  xTicks={[{ value: 1, label: 'Jan' }]}
  yTicks={[{ value: 0, label: '0' }]}
  yDomain={[0, 200]}  // optional
  height={300}        // optional, CSS pixels
  area={true}         // optional wash; ignored unless the axis starts at zero
  xLabel="Month"      // heading for the x column in the table view
  suffix=" kWh"
/>
```

The SVG holds nothing but geometry, in a normalised 0–100 box. Margins, type
sizes and the end dots are CSS pixels, so a chart reflows on a phone without
the labels shrinking with it. A `Show the numbers` table sits under every line
chart, so no value is reachable only by looking.

### Rules the charts follow

These are not stylistic preferences; breaking them makes charts that mislead.

- **Text set into SVG needs an inline style, not a presentation attribute.** A
  stylesheet rule beats `.attr('font-size', …)`, so a label sized that way keeps
  the CSS size and any width you computed from it is wrong. `.style()` wins.
- **Six series colours, in order**, set in `src/lib/chart.ts`. They are
  validated as a categorical set against this site's paper (`#fdfdfc`):
  lightness band, chroma floor, protanopia/deuteranopia separation (worst
  adjacent pair ΔE 9.1) and normal-vision separation (ΔE 19.6). Slots 3–5 sit
  below 3:1 on the paper, which is legal only alongside visible direct labels or
  a table view — so any chart reaching four series must ship one. **A seventh
  series is not a seventh colour** — fold the tail into "other", split into two
  charts, or change the form.
- **A colour belongs to a series, not to a row number.** Removing one series
  must never repaint the others.
- **One series, one colour.** Bar length already encodes the value; colouring
  each bar differently spends the identity channel on nothing.
- **Never two y-axes.** Two measures of different scale are two charts, or both
  indexed to a common base.
- **Text never wears the data colour.** Labels, values and axis type use
  `--ink` / `--ink-soft`; the coloured mark beside them carries identity.
- **No area fill on a truncated axis.** `LineChart` enforces this — a fill
  implies magnitude from zero.
- A legend appears automatically for two or more series; a single series gets
  none, because the caption already names it.

---

### One catch worth knowing

Astro scopes a component's `<style>` by stamping a `data-astro-cid-*` attribute
on the elements it renders. Anything **built by a script at runtime** never gets
that attribute, so its rules must live in a `<style is:global>` block, fenced
behind the component's root class. `WageShapes.astro` does this for its
silhouettes, its rules and its labels. Put a runtime element's styles in the scoped
block and they will simply not apply.

---

## The data behind the wages post

`data/source/` holds the chain, so every figure on the page can be traced:

| File | What it is |
|---|---|
| `ine-36830.json` | the raw INE API response, exactly as it came |
| `salaries.json` | the Python pipeline's output: curves, densities, provenance |
| `occupations.yml` | the curated occupation list, each matched to its exact INE series name |
| `reference.yml` | the minimum wage; national median and mean come from the INE itself |
| `curves.py`, `build_dataset.py` | the reconstruction, kept for reference |

`npm run data` compacts `salaries.json` into `src/data/wages.json`, which is
what the chart loads. It **refuses to write** if any reconstructed percentile
drifts more than 0.5% from the figure the INE published.

The five published percentiles per occupation are the only measured numbers.
The curve between them is a monotone PCHIP interpolation in log-salary; outside
p10–p90 nothing is published and the tails continue the slope of the outermost
measured pair. The chart draws those stretches dashed on shaded ground and the
scrubber's hairline goes dotted when you cross into them.

---

## Design

`src/styles/magnitude.css` holds every token. The two palettes:

**Categories** — each owns a page background, an ink and a saturated band
colour, in `src/data/categories.ts`:

| | bg | ink | band |
|---|---|---|---|
| Housing | `#f3d9d2` | `#5c2418` | `#e9a894` |
| Work | `#d9e3f2` | `#1d3a5f` | `#9db6d8` |
| Energy | `#f5eac2` | `#5c4a10` | `#e6cf7f` |
| Health | `#d6e8de` | `#17453a` | `#96c4ae` |
| Food | `#f8e2ca` | `#64411b` | `#eab77e` |
| Mobility | `#e4dff1` | `#3a2f5e` | `#b8abd9` |
| Culture | `#f0dbe8` | `#55284a` | `#d9a6c6` |

**Articles** — paper `#fdfdfc`, ink `#16181a`, soft `#6b7176`, hairline
`rgba(22,24,26,.14)`. The category survives only as a 4px bar at the very top of
the page, the kicker, the figure numbers, the link underlines and the key
number — type and hairlines, never a large fill. That is deliberate: your chart
colours never have to fight the page.

Type does the rest. Helvetica Neue for display and body, IBM Plex Mono
(self-hosted at build time) for everything mono. No icons, no illustrations, no
shadows, no cards, no gradients, no rounded corners except the pill controls and
the bands.

### Behaviour worth knowing before you change it

- **The wall never scrolls.** It is measured against the stage on load, on
  category change and on resize, then scaled down to fit (floor `0.62`).
- **Entrance animations use `animation-fill-mode: backwards`, never `both`,**
  and no `filter` or `clip-path` survives into the final keyframe. A retained
  `filter: blur(0)` keeps a GPU layer alive and permanently degrades text
  antialiasing.
- **The bands are real links.** Every category is a server-rendered page at its
  own URL, so deep links and no-JS both work; the script upgrades a click into
  an in-place switch because a page load would throw away the colour sweep.
- **The active band's label morphs** by animating `font-size` and
  `letter-spacing`. There is no second element cross-fading.
- **`prefers-reduced-motion` keeps the colour change and drops everything else.**
- On phones the wall still never scrolls: it shows as many questions as fit and
  hides the rest, because shrinking 21px type is worse than showing fewer. The
  bands turn ninety degrees into a bottom tab bar, with the category name on the
  active tab. Their heights and `--band-bar` in `magnitude.css` have to move
  together, and the shell reserves `--band-bar` so nothing can pass under it.

### Three things that were measured, and must not come back

A category change animates ten entrances, seven bands and a full-screen sweep at
once. Three habits each cost it most of its frame budget, and all three look
harmless in the source:

- **Never transition `color` on `.shell`.** It is inherited, so every frame of
  the fade re-resolves the computed style of the whole document — 589ms of style
  recalculation per switch, measured. Only the background cross-fades. Ink fades
  on the wordmark and the pill, which are the only things still visible while
  the sweep crosses.
- **Never animate `clip-path`.** It was the entire remaining cost: 25 dropped
  frames out of 90 with the masks on, 14 with the mask left on the headline
  alone, 2 with none. The blur next to it measured free, which is why the blur
  stayed and the wipes did not.
- **Replay entrances in one batch.** `classList.remove` → one `offsetWidth` →
  `classList.add`, for the whole set. A forced reflow per element is thirteen
  synchronous layouts on a switch.

Same reasoning behind the smaller ones: the sweep disc is a flat fill rastered
at `20vmax` and scaled 11.5×, the bands lighten with an opacity overlay rather
than a transitioned inset shadow, and the non-passive `wheel` listener is not
registered on phones at all. None of this is visible by reading the CSS: it came
out of sampling `requestAnimationFrame` deltas during a switch under 6× CPU
throttling, then removing one ingredient at a time. Do that again before
trusting a guess about which of these is expensive.

---

## Deploying

Pushing to `main` builds and publishes through
`.github/workflows/deploy.yml`. Two settings have to be right, and both are in
the repository, not in this code:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
   (not "Deploy from a branch").
2. **Settings → General → Default branch: `main`.**
3. **Settings → Environments → `github-pages` → Deployment branches and tags:
   `main` must be listed.**

The third one is the trap, and the second does not fix it. When Pages is set to
the Actions source, GitHub creates a `github-pages` environment and writes a
deployment branch rule naming whatever branch was default *at that moment*. The
rule holds a branch name, not the idea of "the default branch", so renaming or
switching the default afterwards leaves it pointing at the old one.

The failure signature: `build` goes green and uploads its artifact, then
`deploy` fails in about a second with `runner_id: 0`, no runner name and no
steps at all. No logs, because the job never started. It reads like a Pages
outage rather than a permissions rule.

This was verified rather than guessed — the same commit was pushed to `main`
(default, `deploy` failed) and dispatched on the old branch (not default,
`deploy` succeeded) a minute apart. If you see that signature, open the
environment's branch rule before looking anywhere else.

The site is served from a subpath, so `astro.config.mjs` sets
`site: 'https://aleetreny.github.io'` and `base: '/Magnitude'`. Always build
internal links with the `url()` helper in `src/lib/url.ts` rather than writing
`/housing` by hand, or they will 404 in production.

Moving to a custom domain later: set `site` to the domain, `base` to `'/'`, and
add a `public/CNAME`.

---

## Licence

Text and charts CC BY 4.0. Data belongs to the sources named in each post.
