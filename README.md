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
npm run data     # rebuild every src/data/*.json from data/source/
                 # one at a time: data:wages, data:leaving-home, data:power
                 # data:power:fetch re-pulls the price record from the API
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

Five components. `BarChart`, `LineChart`, `Doorways` and `CheapestHour` compute
their geometry at build time and ship no JavaScript at all; `WageShapes` is the
one interactive chart on the site.

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

End labels are pushed apart when series finish close together: the dots stay on
their data and only the numbers move, by the least that clears them. Four series
ending within two hundredths of each other stack into an unreadable smudge
otherwise.

**`<Doorways>`** — where a set of countries sits on one axis, and how little
each has moved along it. Reads `src/data/leaving-home.json` and takes an
optional `highlight` country code. Each row carries two marks and no more: a
door at the latest reading, and one hairline per earlier year, on the travel
line joining them. The second mark is the same quantity as the first, one year
at a time, so there is nothing to learn before the chart can be read — the key
is the marks themselves, set in the line that names them, and there is no legend
box at all.

Only one survey is drawn. The dataset carries a break in series, and a figure
from either side of it is not the same measurement, so the older survey is not
in this figure — it has its own, on its own axis.

Horizontal positions are percentages and every vertical dimension is CSS pixels,
so it reflows on a phone rather than scrolling. The door is one SVG symbol
placed 28 times; nothing else is SVG. The scale bar sits under the axis rather
than beside the column note, because two notes anchored to different marks
cannot be kept clear of each other at every width — an audit across eight
viewports is what found them colliding between 861 and 1080px, well above the
breakpoint meant to catch it.

**`<CheapestHour>`** — one clock per month, its hand on the hour that month was
cheapest. Reads `src/data/power-prices.json` and takes no props. A 24-hour dial
with midnight at the top and noon at the bottom, so the answer to the question
is the direction the hands point and the grid is read before it is explained.
The hour is comparable across months whatever the price level was, which is why
the hand carries the hour and not the price. Each dial is its own small SVG in a
grid cell: the twelve columns hold at every width and the dials shrink with
them, down to 22px on a 360px screen, where a hand is still legible.

Two wrappers keep their posts' shaping out of the MDX. `LeavingHomeLines` picks
countries by code, cuts every series at the break year and intersects the years
so the table stays aligned row for row. `DayShape` divides each hour by its own
year's average, because the years being compared are two-to-one apart in price
and the figure is about shape.

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

## The data behind the leaving-home post

| File | What it is |
|---|---|
| `eurostat-yth_demo_030.json` | the raw Eurostat JSON-stat response, exactly as it came |
| `scripts/build-leaving-home.mjs` | splits each country at the break in series and writes `src/data/leaving-home.json` |

Eurostat flags a **break in series** in 2021 — the EU Labour Force Survey was
redefined — for 34 of the 36 territories in the dataset. The build splits every
country into the survey before it and the survey after, and nothing downstream
subtracts across that year: a range quoted for a country is always one survey's
own. The script **refuses to write** if that break stops being general, if a
value falls outside a plausible age, or if any figure the post states in prose
has moved.

A country earns a row only if the older survey covered it at least ten times,
the newer one at least three, and it reported in the last year available — one
axis, one year, or the numbers down the right-hand column would not be
comparable.

---

## The data behind the electricity post

| File | What it is |
|---|---|
| `ree-pvpc-hourly.json` | every response the price API gave, one per month, untouched |
| `scripts/fetch-power-prices.mjs` | pulls the record a month at a time; the endpoint refuses longer ranges |
| `scripts/build-power-prices.mjs` | reduces 40,201 hourly prices to what the charts draw |

The series is the PVPC, the regulated tariff for small consumers with tolls and
charges included, for the peninsular system. It begins on **1 June 2021**, the
day the time-of-use tariff came into force: ask the API for May and it answers
with an error, because there is no such price. Year figures use complete
calendar years only.

Hours are local clock hours, taken from the offset the API stamps on each
reading — the hour people live by. On the two clock changes a year one hour goes
missing and one happens twice; both are kept as published.

The fetch script never re-asks for a month already on disk, and rewrites the
file after each one, so a stall costs a single request. The build script
**refuses to write** if the record is short, if a value is not a plausible
price, if a year is missing hours, or if any figure the post states has moved.

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
