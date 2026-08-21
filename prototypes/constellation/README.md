# The constellation

No articles, no prose. Five questions are five stars in a real sky, and you fly
to them. Arriving does not open a page: the star's light floods the screen, and
when it clears you are somewhere else, with that star's own colour, its own
clouds, its own dust hanging in the air, and its chart building itself out of
the light in front of you.

Open `constellation.html`. Nothing to install, nothing to serve. `node
bundle.mjs` rebuilds `constellation.json` from `src/data/`.

Files: `engine.js` camera, star fields, nebulae · `journey.js` the flight ·
`render.js` the scene · `chart.js` the charts · `input.js` control and start-up.
`constellation.html` is all of them concatenated with the data inlined.

## Why it is in three dimensions

Because a flat map zoomed in and out can only slide, and sliding is what tells
you it is a web page. Everything is projected by hand from real positions at
real depths, so near stars tear past while far ones hold still, and that
difference is the whole sensation of travel. The constellation itself has
depth: the third axis of the feature vector is distance, so a shape from out
here is a shape you fly *into*.

The sky is in two halves and the split matters. **Three thousand deep stars sit
on a shell fifty to a hundred and thirty thousand units out**, wrapping all the
way round, so half of them are always behind you and none of them move: that is
what makes the constellation still the same constellation after a journey. A
**nearer drift field is recycled as you pass it**, so the travel never runs out
of space to travel through.

## The flight has four legs, not one tween

1. **Turn.** The camera yaws and pitches to face the star, banking up to a
   quarter of a radian into the turn and back out of it.
2. **Go.** A cubic path whose first control point sits *behind where you are
   standing*, so the camera retreats before it commits, and whose second sits
   behind the target, so it arrives along the star's own axis instead of
   sideswiping it. The camera covers three or four times the straight-line
   distance, and that extra distance is why it reads as flight: five hundred
   units of drift is a pan, six thousand is a journey. The field of view widens
   by a third at peak speed and comes back.
3. **The light of arriving.** A white flood centred on the star. This is the
   join: it is what lets one sky become a different sky without the eye
   catching the cut.
4. **And then you are somewhere else.** The marks fly out of the star along
   their own paths, each with its own lag and its own depth to fall through, so
   the chart blooms from the middle rather than snapping open. The rules and
   labels draw themselves on last, once the marks have stopped moving.

Streak length, bloom, chromatic aberration and vignette all key off one number:
how far the camera moved this frame, measured **per millisecond**, not per
frame. A frame that took a quarter of a second because the tab was busy is not
the camera moving fast, and treating it as such smears the whole screen for no
reason. That bug is the reason the number is a rate.

## Traps worth remembering

- **Bloom is a light effect, not a paint effect.** Composited at full strength
  it turns every chart into neon. It belongs to speed and to the flash; while a
  chart is being read it drops to a third, and a mark stops feeding the glow
  buffer once it has landed.
- **Dust is two pixels, whatever the camera is doing.** Scaling motes with
  perspective turned the room into a bokeh photograph.
- **A cloud tile has to be feathered to nothing at its edges** and blurred once
  at generation. Without the mask you see the square; without the blur, a
  420-pixel tile blown up to forty thousand units shows every blob it was built
  from, and blobs at that size read as pattern.
- **A flat tinted wash reads as fog.** The colour of a star's world comes from a
  radial light *behind the chart*, where the star actually is.

## Where the stars sit

An embedding of **stated features, not of language**: four axes written by
hand describing what a question is about, laid out by stress majorization, each
star joined to its two nearest neighbours. Say so plainly anywhere this ships.

## Not built

Touch pans, pinches and taps, but there is no inertia. All five charts are real
data from `src/data/`, but only the day wall and the electricity dial are as
legible as the published versions. No deep links: the sky is one page.
