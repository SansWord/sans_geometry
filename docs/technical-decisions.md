# Technical decisions

This document explains the non-obvious design choices in `script.js` /
`style.css` — the *why*, not the *what* (the code itself is short enough to
read for the what). See [`orbital-data.md`](orbital-data.md) for where the
actual planetary constants come from.

## Circular orbits, not Kepler ellipses

Every body's position is computed as uniform circular motion:

```
meanLongitude(t) = L0 + 360° * (daysSinceJ2000 / period)
x = a * cos(θ), y = a * sin(θ)
```

Real orbits are ellipses (eccentricity ranges from ~0.007 for Venus to
~0.25 for Pluto), so a real planet speeds up near perihelion and slows down
near aphelion. Modeling that properly means solving Kepler's equation
(`M = E - e·sin(E)`) iteratively for every body, every frame. For this
visualization — whose whole point is to make relative motion and the
geocentric retrograde-loop shape easy to see — that added complexity buys
essentially no visible improvement, so it was left out. The tradeoff is
disclosed directly in the page's footer ("not for precision ephemeris
work").

## Two independent coordinate frames from one shared model

Rather than maintaining two separate simulations, everything is computed
once in heliocentric coordinates, and the geocentric panel is derived by
vector subtraction:

```
geocentric(body) = heliocentric(body) - heliocentric(earth)
geocentric(sun)  = -heliocentric(earth)
```

This single fact — that the Sun's geocentric position is just the negated
Earth vector — is also why the Sun traces a **perfect circle** around
Earth in the geocentric panel (radius exactly 1 AU) while every other
planet traces a *retrograde loop* instead of a circle: their geocentric
loop period is the *synodic* period (how often Earth laps them), not their
own sidereal period, so the loop shape and the slow zodiacal drift are two
different phenomena riding on the same body. See the "Trail sampling"
section below for why that distinction mattered for smoothness.

## Per-panel square-root distance scaling

Both panels map true AU distance to pixel radius via
`pixelRadius ∝ sqrt(distance / maxDistance)`, not a linear map. A linear
map would put Mercury (0.39 AU) and Neptune (30 AU) 77× apart in pixels —
useless on a single canvas. Square-root compression keeps the *ordering*
and relative spacing visually meaningful while letting both the innermost
and outermost bodies stay legible on the same canvas.

## The geocentric scale bound is fixed, not live

Early on, the geocentric panel's scale was computed from each selected
body's **current** distance from Earth. That distance changes continuously
(e.g. Mars ranges roughly 0.5–2.5 AU from Earth), so the whole panel
visibly "breathed" in and out every frame — distracting, and it also made
already-drawn trail points jump around since they're re-projected through
the current scale on every redraw.

The fix: scale against each body's **worst-case** geocentric distance,
`a + 1 AU` (its own semi-major axis plus Earth's, which bounds the true
distance for circular orbits), instead of the live value. This bound only
changes when the *set of selected bodies* changes, never while time
advances, so the scale — and the whole picture — is stable while playing.
A manual zoom slider (0.4×–3×) was added afterward specifically so users
can still get a closer look without reintroducing that instability.

## Trail sampling: two different "loop" periods, not one

Trails are geocentric-only (the heliocentric panel already draws static
orbit rings, since those orbits *are* circles by construction). There are
actually two different periodic phenomena riding on the same trail, and
the code has to size itself off *both*:

- The small retrograde wiggle closes once per **synodic period** (how
  often Earth laps the body) — `1 / |1/earthPeriod - 1/bodyPeriod|`.
- The **big loop that sweeps all the way around Earth** — what "the trail
  makes a full circle" actually means visually — is governed by whichever
  of the two bodies' own sidereal periods is longer:
  `geoLoopPeriod = max(earthPeriod, bodyPeriod)`. For outer planets
  (Mars–Pluto) that's the planet's own orbit; for Mercury/Venus, Earth's
  faster orbit dominates instead, so their big loop closes once a year
  regardless of their own (faster) period.

These two periods are the *same order of magnitude* for Mercury–Saturn,
but diverge enormously for the far outer planets — Pluto's synodic period
is barely more than a year (Earth laps it constantly), while its sidereal
period, and therefore its geocentric big loop, is **~248 years**. An
earlier version sized sampling and trail-history depth off the synodic
period alone, which produced nicely smooth small wiggles but meant the big
loop could never complete for Saturn/Uranus/Neptune/Pluto no matter how
long the simulation ran — there just wasn't enough history retained to
cover it. Sample spacing is now
`min(geoLoopPeriod / 240, synodicPeriod / 8)` days: fine enough to resolve
the big loop in ~240 steps, but never coarser than ~8 steps per small
wiggle (otherwise, since the big loop is many decades long for the
farthest planets, the wiggles would be badly under-sampled into a jagged
mess).

**Testing that every planet's trail can fully surround Earth:** the
slowest body, Pluto, needs its full ~248-year geocentric loop to actually
close — run the simulation for **about 270 years** (a little past 248, so
the loop visibly closes and overlaps rather than just barely reaching
back around) to confirm every planet's trail, not just the faster inner
ones, forms a closed ring around Earth. At the default speed a run that
long takes a while in real time, so bump the speed (or use "Run for N
years") rather than waiting at 1×.

## Trail buffer size and trimming strategy

Each body keeps up to 4500 sampled points — enough to hold at least two
full geocentric loops (see above) for every body, including Pluto's
~248-year loop at its ~46-day sample spacing. At that size, the array is
trimmed in batches (only once it overshoots the cap by 400, via a single
`splice`) rather than shifting one element off on every single push — an
O(1)-amortized approach instead of paying an O(n) `shift()` per sample. In
practice this is cheap either way (worst case is a few hundred pushes per
second, gated by the animation frame rate, not by simulation speed), but
the batching avoids paying that cost needlessly often now that the buffer
is larger.

Trails always start empty — nothing is pre-computed or backfilled on page
load or when a planet is switched on. An earlier version seeded ~2 loops
of *past* history (computed directly from the orbital formulas) so a
fresh load showed a full loop immediately; this was removed because it
made the page look like trails were "already there" before the simulation
had actually run any time, which was surprising. Trails now only ever
reflect time the simulation has actually played through.

## Month ring: anchoring and mirroring the geocentric frame

The Sun's geocentric angle is literally its ecliptic longitude — the same
quantity historically used to read the season from the sky. To make that
legible at a glance, the geocentric panel's angular origin is rotated so
that **Jan 1 lands at 12 o'clock**, computed once at load time by finding
the Sun's geocentric angle on a reference Jan 1 and offsetting everything
by however much that takes to reach 90° (straight up) in screen
coordinates.

Increasing angle in the underlying math (matching true prograde orbital
motion, viewed from north) rotates counterclockwise on screen. Left as-is,
month labels would run counterclockwise from Jan (Feb at 11 o'clock, not
1 o'clock) — technically consistent, but backwards from how a clock face
reads. Since the month ring exists purely as a human-readable reference
dial (not a claim about which way anything "really" spins), the geocentric
panel's x-axis is mirrored at draw time (`x = cx - r·cos(angle)` instead of
`cx + r·cos(angle)`) so months run clockwise like an ordinary clock. This
mirroring is applied uniformly to every body drawn in that panel (Sun,
planets, trails, Moon) so the picture stays internally consistent; it does
not touch the heliocentric panel.

## Sun/Earth visibility is scoped per panel, not global

Unchecking "Sun" hides it only from the geocentric panel; it always
renders in the heliocentric panel, since it's that panel's fixed reference
point. Symmetrically, Earth's checkbox only affects its marker in the
heliocentric panel — it's always drawn at the center of the geocentric
panel. Both bodies' positions are still computed regardless of checkbox
state, since Earth's position is required to project every other body into
the geocentric frame.

## URL sync strategy: sync on change, not on every tick

Selecting/deselecting a planet, changing speed, or setting a date all call
`history.replaceState` immediately, so the address bar always reflects
those choices without the user needing to click "Copy link." The
continuously-advancing simulated date **while playing** deliberately does
*not* write to the URL on every animation frame — only on explicit
date-setting actions (date picker, "Today"). Syncing on every frame would
serve no purpose (nobody can copy a URL mid-scrub) while spamming
`replaceState` up to 60 times a second. "Copy link" still exists
separately to snapshot the complete current state (including the
in-progress date and geocentric zoom level) into one shareable URL on
demand.

## "Run for N years": date-based countdown, not a wall-clock timer

The run is tracked as `{ target, startDate, completed }` in years and a
simulated `Date`, checked once per frame *after* `simDate` advances:

```
elapsedYears = (simDate - startDate) / msPerDay / 365.25
if |elapsedYears| >= target: clamp simDate to startDate ± target years, pause, mark completed
```

Anchoring to the simulated date rather than a wall-clock `setTimeout`
means pausing and resuming mid-run "just works" with no extra state — the
countdown only progresses when `simDate` does, and manually pausing
doesn't need to stop or restart a timer. `completed` (rather than
resetting `target` to `null` on completion) exists so that pressing Play
again afterward keeps running indefinitely instead of instantly re-firing
the cap.

**Why auto-scale speed:** even at the default 128×, a 100-year run takes
almost 5 minutes of real time — too slow for actually feeling what
accumulates over a lifetime in one sitting. Clicking "Run" computes
`speed = years·365.25 / 25` (clamped to
the existing 1/64×–4096× range) so any requested span finishes in roughly
25 real seconds, then leaves the normal speed controls free to override it
mid-run. The one exception is loading via the `years` URL parameter
*together with* an explicit `speed` parameter — there, the user's explicit
speed choice wins and auto-scaling is skipped, since an explicit `speed`
in a shared link is assumed to be intentional.

That auto-scaled speed is essentially never a clean power of two (e.g.
`1461×` for a 100-year run) — but +/- Speed always worked by doubling or
halving whatever the current value was, so clicking -Speed from `1461×`
used to land on `730.5×`, then `365.25×`, permanently off the
1×/2×/4×/…/4096× ladder those buttons otherwise stick to. `powerOfTwoRung()`
fixes this by snapping to the nearest power-of-two rung *above or below*
the current speed rather than literally doubling/halving it: from `1461×`,
-Speed goes to `1024×` and +Speed goes to `2048×`. When the current speed
is already exactly on the ladder (the normal case), this produces the same
result as plain doubling/halving always did, so existing behavior is
unchanged — it only changes what happens right after an arbitrary speed
(currently, only the years-run auto-scale produces one) is in effect.

**Why cancel on manual date changes but not on Reverse:** the countdown's
`startDate` is only meaningful relative to *how* the run began. Jumping to
a different date (date picker, "Today") invalidates that reference, so
both cancel any in-progress run. Reversing direction mid-run doesn't — the
elapsed-years check uses an absolute value, so reversing just walks the
countdown back toward (and potentially past, symmetrically) the start
date, which is a coherent thing to watch rather than an error case.

## "1 year ≈ Ns" header readout

`speed` is stored as simulated days per real second, which isn't
intuitive on its own — "1461×" doesn't tell you much by itself. The header
instead shows how much real time one simulated year takes at the current
speed: `365.25 / |speed|` seconds, reformatted into seconds / minutes /
hours depending on magnitude. It's derived from `state.speed` alone and
updates wherever `updateSpeedLabel()` already runs (speed +/-, reverse,
starting a years-run), so it never needs its own separate update path.

## Phase widget: illuminated fraction from vectors, not sky orientation

Illuminated fraction is `k = (1 + cosα) / 2`, where `α` is the angle at the
object between its direction to the Sun and its direction to Earth — the
standard planetary phase angle. Computed directly from vectors:

```
toSun   = Sun - objectPos           (Sun is the origin, so this is just -objectPos)
toEarth = earthPos - objectPos
cosα    = dot(toSun, toEarth) / (|toSun| · |toEarth|)
```

This is the same formula for every body, including the Moon — its position
is approximated as `earth + MOON.a·(cos, sin)(moonAngle)` (a small offset
from Earth, using the existing geocentric moon angle already computed for
the two orbit panels) rather than treating it as a special case. Which side
of the disk is lit (so the crescent/gibbous bulge points the right way and
swings smoothly as the body orbits) is decided the same way, by projecting
the Sun direction onto the perpendicular of the Earth→object viewing axis.
This is an internal, self-consistent convention, not tied to real sky
orientation — the same spirit as `GEO_ROTATION_OFFSET` below, which is
also an artificial-but-consistent convention rather than a claim about
real orientation.

## Phase disk is a fixed size, not distance-scaled

An earlier version scaled the drawn disk's radius with 1/distance, so a
body's rendered size grew as it approached Earth — motivated by the real
Venus/Mercury size-phase correlation (a big thin crescent near Earth, a
small near-full disk on the far side of the Sun) that's part of the
historical argument against a strict geocentric model. In practice this
read as an unrelated "zoom" rather than a phase cue, and was actively
confusing for outer planets: their illuminated fraction barely moves
(Jupiter's phase angle never exceeds ~11°) while their Earth-distance still
swings substantially over a synodic period (Jupiter: ~4.2–6.2 AU), so the
disk visibly resized while looking almost uniformly full the whole time —
two different signals moving on two different rhythms, layered onto one
icon. The disk is now drawn at a constant size; only its shading encodes
phase.

## Responsive placement: corner overlay vs. bar above the canvas

Below the desktop breakpoint the geoCanvas can shrink well under 400px
(see `--canvas-vh-cap` above), leaving too little of the square canvas's
empty corner (outside its circular clip) to hold the widget without
overlapping the circle. Above the breakpoint there's real corner space to
spare. So `.phase-widget` is one DOM element repositioned entirely by CSS:
an unconditional base rule lays it out as a full-width bar that
`flex-wrap`s onto its own line above the canvas+zoom-sidebar row (same
principle as `.shortcuts-bar` — never stacked on top of the circle, and
the canvas itself is never resized to make room), and a
`@media (min-width: 781px)` override switches it to `position: absolute`
in the corner instead.

**Gotcha this produced:** that override originally lived in an *earlier*
`@media` block in the file (grouped with the unrelated pre-existing
canvas-sizing rule), textually *before* the unconditional base rule. Since
both rules have equal specificity, the later, unconditional rule won on
every property they both set (`flex-direction`, `padding`, `background`,
...) at any width — including desktop — while `position: absolute` from
the media block still applied (the base rule never touched `position`).
The result was a very confusing hybrid: an absolutely-positioned box
overlapping the canvas, but laid out and styled like the mobile bar. The
fix was purely reordering — moving the override to *after* the
unconditional rule it's meant to override. General lesson: a media-query
override must come after the rule it overrides in source order, even
though the two rules "obviously" target different widths — CSS doesn't
know that; it only sees two rules of equal specificity and picks the later
one for whatever properties they share.

## Fixed-width phase readout

`.phase-readout`'s text ("13% lit · waxing") changes length every frame as
the percentage and waxing/waning word change, and it sits in a row/column
with other items centered as a group — so without a fixed width, the
select and disk before it visibly shifted left/right as the trailing text
grew and shrank. `min-width: 9.5em` (long enough for the longest reading,
`"100% lit · waning"`) pins the row/column's total width constant, so nothing
before it moves regardless of what the readout says.

## "Skip to next extreme": trend-reversal detection, not a closed-form search

The button fast-forwards live (reusing the exact same play loop and trail
sampling as normal playback, just at a boosted `state.speed`) until the
selected body's illuminated fraction next hits a local max (full) or local
min (new, or "as dim as this body gets" for an outer planet), then
auto-pauses. Detection: the render loop already computes a `waxing`
boolean (this frame's `k` vs. the previous frame's) for the readout text.
On the first frame after the click, that value is recorded as a baseline;
on every later frame, if `waxing` no longer matches the baseline, the
trend has flipped — we just passed the next extreme. Recording a baseline
*instead of* just checking "is it decreasing now" matters because the
button is pressed with the body already mid-trend one way or the other;
comparing against that starting trend is what makes "next extreme" mean
the *next* one chronologically; a plain "first frame going the other way"
check would misfire near the very body/date the user started from — Venus
sitting near its dimmest, clicked right before turning brighter, would
otherwise still be treated as "already at an extreme" and stop instantly
rather than travelling on to the actual next peak.

Speed is auto-picked so the worst-case wait finishes in about 4 seconds
regardless of body: `synodicPeriodDays(body) / 2 / 4`. The `/2` is a
conservative upper bound, not exact — extrema alternate every *half*
synodic period for Mercury, Venus, and the Moon (new ↔ full, since a
strict inferior conjunction and a strict superior conjunction are the only
two alignments), but every *quarter* synodic period for superior planets:
both opposition (Δlongitude = 0°) *and* solar conjunction (Δlongitude =
180°) put Sun, Earth, and the planet exactly colinear and therefore give
`k = 1`, with the two quadratures in between (Δlongitude = 90° and 270°)
each giving the planet's minimum. So a superior-planet skip typically
finishes faster than its 4-second target rather than slower — an
acceptable asymmetry rather than a bug, since the `/2` figure only needs
to bound the wait, not predict it exactly.

## Bodies excluded from "skip to next extreme"

`PHASE_SKIP_DISABLED` (a plain `Set`, edited directly to change which
bodies it covers) disables the button for Saturn, Uranus, Neptune, and
Pluto: their minimum illumination, at quadrature, is 99.7–99.98% — always
rounds to "100% lit" in the readout, so there's no visibly different "new"
extreme to fast-forward to. Mars (min ~88%) and Jupiter (min ~99%) stay
enabled since their dip is actually visible in the rounded readout.

## Tychonic orbit overlay: point-sampled ring, not a drawn circle

A planet's true orbit is a circle centered on the Sun, but `toPx()` maps
*distance from Earth* to pixel radius through a non-linear (square-root)
scale, and `geoXY()` places points by polar angle from Earth. Feeding a
constant AU radius straight into `drawOrbitRing()` (as the heliocentric
panel does, where distances genuinely are Sun-centered) would draw a
circle centered on the Sun's *screen* position but sized/shaped as if the
scale applied uniformly around it — which it doesn't, since the sqrt
compression depends on each point's own distance from Earth, and points
on a Sun-centered circle are at a range of different Earth-distances.

Instead `drawTychonicRing()` walks 72 sample angles around the true AU-space
circle (`sunGeo + orbitRadiusAU · (cosθ, sinθ)`), computes each sample
point's real Earth-distance and Earth-angle, and pushes it through the
exact same `toPx`/`geoXY` pipeline the trails and body dots already use.
This guarantees the ring passes exactly through wherever that body is
actually plotted (same math, no separate approximation to drift out of
sync) at the cost of a polyline instead of a single `ctx.arc()` call.

## Tychonic overlay hides trails without clearing them

Trails and Tychonic rings drawn together were visually noisy (loops and
dashed rings overlapping at the same scale), so the overlay's checkbox
skips `drawTrail()` while checked. `maybeSampleTrail()` still runs every
frame regardless — sampling and drawing were already separate calls in the
same loop — so toggling the overlay off resumes the trail exactly where it
would have been anyway, rather than showing a gap or restarting it.

## No build step, no dependencies

Plain `index.html` + `style.css` + `script.js`, rendered with a single
`<canvas>` per panel and driven by `requestAnimationFrame`. Given the
scope (two canvases, some DOM controls, no persistence beyond the URL),
a framework or bundler would add ceremony without solving a real problem
here.
