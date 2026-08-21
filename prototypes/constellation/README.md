# The constellation

A prototype of a different shape for MAGNITUDE: no articles, no prose. Five
questions are five stars. Zooming into one does not open a page, it takes the
star apart: the point of light *is* the chart, folded up, and it comes back
apart as it grows on screen.

Open `constellation.html`. Nothing to install, nothing to serve.

## What is worth keeping

**The camera is Van Wijk and Nuij's smooth zoom-and-pan** (`flight()` in
`app.js`). Given two views of the world it returns the path a viewer perceives
as moving at a constant speed: it pulls back far enough to cover the ground,
then drops in. Measured on the path from the electricity star to the day star,
the camera goes from 1,460 world units wide out to 3,283 at the halfway point
and back down to 1,330. That pull-back is not an effect added on top; it falls
out of the maths, which is why it never overshoots and never crawls.
Interpolating x, y and scale separately with an ease curve is what makes most
zooming interfaces lurch.

**Nothing about the unfolding knows about clicks.** `resolveOf(star)` is a pure
function of the camera width and that star's own bounding box. Zoom by wheel, by
pinch, by keyboard or by flight and the chart comes apart at exactly the same
point. There is no open/closed state to keep in sync, which is the usual source
of a half-open chart stuck on screen.

**Each star is framed by its own chart, not by one number.** Charts are not all
the same shape, so `fitW()` measures each one and binds on whichever side runs
out first. It also frames the chart into the band left between the question
above and the source below, so the words sit in space the chart was never given.

**The furniture is generated with the data.** Rules, ticks and words come out of
`bundle.mjs` as primitives in local coordinates, and arrive only once a chart is
mostly open, so a half-open star stays a picture rather than a diagram.

## Where the stars sit

Positions are an embedding of **stated features, not of language**. Four axes
describe what a question is about; the pairwise distances are laid out in two
dimensions by stress majorization. Each star is joined to its two nearest
neighbours, and those lines are the constellation. Say so plainly anywhere this
ships: it is a hand-written feature vector, not a model.

## What is not built

Touch has pan, pinch and tap, but no inertia. Every chart is real data from
`src/data/`, but only the day and the electricity dial are as legible as the
published versions. There is no route, no deep link and no share target: the
sky is one page.

`node bundle.mjs` rebuilds `constellation.json` from `src/data/`.
