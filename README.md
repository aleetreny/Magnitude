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

Astro + MDX, static output, hand-written CSS, no UI framework. Charts are
computed with D3 scales at build time and shipped as inline SVG, so a post is
plain HTML by the time it reaches a browser.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:4321/Magnitude
npm run build    # type-checks, then writes dist/
npm run preview  # serve dist/ exactly as it will be served in production
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

Two components cover most questions. Both compute their geometry with D3 scales
at build time; neither ships any JavaScript.

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

- **Two series colours, in order** — `#2a78d6` then `#eb6834`, set in
  `src/lib/chart.ts`. They are validated as a categorical pair against this
  site's paper (`#fdfdfc`): lightness band, chroma floor, protanopia/deuteranopia
  separation (ΔE 24.7), normal-vision separation (ΔE 33.6) and ≥ 3:1 contrast.
  **A third series is not a third colour** — fold the tail into "other", split
  into two charts, or change the form.
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
- On phones the wall becomes a scrolling column and the bands become slivers.
  Their widths and `--gutter` in `magnitude.css` have to move together.

---

## Deploying

Pushing to `main` builds and publishes through
`.github/workflows/deploy.yml`. Once, before the first deploy:

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

The site is served from a subpath, so `astro.config.mjs` sets
`site: 'https://aleetreny.github.io'` and `base: '/Magnitude'`. Always build
internal links with the `url()` helper in `src/lib/url.ts` rather than writing
`/housing` by hand, or they will 404 in production.

Moving to a custom domain later: set `site` to the domain, `base` to `'/'`, and
add a `public/CNAME`.

---

## Licence

Text and charts CC BY 4.0. Data belongs to the sources named in each post.
