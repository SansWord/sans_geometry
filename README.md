# Heliocentric vs Geocentric Orbit Simulator

**Live demo:** [sansword.github.io/sans_geometry](https://sansword.github.io/sans_geometry/)

| Demo | Params | What it shows |
|------|--------|----------------|
| [Mars retrograde](https://sansword.github.io/sans_geometry/#demo) | `date=1433-10-10`, `zoom=0.85`, `speed=128` | Mars traces out its retrograde loop in the geocentric panel |
| [Venus final phase](https://sansword.github.io/sans_geometry/#demo=venus-final-phase) | `date=1435-04-16`, `phase=venus`, `autoskip=1` | Fast-forwards Venus's phase widget from new (0% lit) to its next full phase (~100% lit), auto-pausing once it gets there |

A single-page, dependency-free HTML/CSS/JS simulation that shows the Solar
System from two points of view side by side:

- **Left panel — Heliocentric:** the Sun fixed at the center, planets
  orbiting it (the modern, Copernican view).
- **Right panel — Geocentric:** Earth fixed at the center, everything else
  (Sun, Moon, planets) plotted relative to Earth (the ancient, "observer's
  eye view" — this is also where planets visibly trace their
  [retrograde loops](https://en.wikipedia.org/wiki/Apparent_retrograde_motion)).

Both panels are driven by the same underlying simplified orbital model and
the same simulated date/time, so you can directly compare "where things
really are" against "what it would look like standing on Earth."

Open `index.html` in a browser (or serve the folder with any static file
server, e.g. `python3 -m http.server`) — there is no build step and no
external dependencies.

## Features

- All nine traditionally-named planets (Mercury–Pluto) plus the Moon, each
  individually toggleable via checkboxes (including the Sun itself, which
  can be hidden from the geocentric panel while remaining the fixed center
  of the heliocentric one).
- Date control (date picker, "Today" button) and a live date/time readout,
  with a "1 year ≈ Ns" readout next to it showing how much real time one
  simulated year takes at the current speed.
- Play / Pause, speed up / down (0.015625×–4096×, in both directions,
  128× by default), and a Reverse-time button.
- A **month ring** around the geocentric panel: the frame is anchored so
  Jan 1 sits at 12 o'clock and months run clockwise, so the Sun's position
  against that ring reads directly as "roughly what month it is" — the
  same principle ancient calendars used to track the seasons from the
  Sun's position against the zodiac.
- Retrograde-loop **trails** in the geocentric panel, with a manual zoom
  sidebar (40%–300%) so you can inspect the loop shapes closely.
- A "Clear tracks" button and the **C** keyboard shortcut to wipe all
  trails; **Space** toggles play/pause; **[** / **]** speed down/up
  (snapping to the same 1×/2×/4×/…/4096× ladder as the +/- Speed buttons);
  **\\** resets speed to the 128× default. A reference list of all of
  these sits permanently in a thin bar above the heliocentric canvas —
  visible at a glance, no click required, and never overlapping the
  orbits since it's never stacked on top of the circle.
- A **"Run for N years"** control (default 100): clears trails, auto-picks
  a speed that finishes the run in about 25 real seconds, plays forward,
  and auto-stops exactly N simulated years later — a quick way to see
  everything a human could observe accumulate over a lifetime. Leave it
  alone and the simulation just keeps running indefinitely, as always.
- A **phase widget** alongside the geocentric panel (an overlay in its
  top-left corner on desktop; its own bar above the canvas on narrow/mobile
  layouts, so it never overlaps the circle): pick any planet or the Moon
  and watch its illuminated fraction change live as the simulation runs.
  This is the same Sun-Object-Earth phase-angle geometry behind
  [Galileo's observation of Venus's phases](https://en.wikipedia.org/wiki/Phases_of_Venus),
  historically one of the pieces of evidence against a strict geocentric
  model (which can't produce a full or gibbous Venus) — Venus swings
  through its whole phase range as it orbits, while an outer planet like
  Jupiter stays close to full, since Earth can never get far enough
  "around" it to see much of its night side. A **⏭ button** next to the
  body picker fast-forwards (auto-picking a speed so the wait is a few
  seconds regardless of body) to the next time its phase peaks or bottoms
  out, then auto-pauses — trails accumulate along the way rather than
  being skipped over. Since full and new alternate, repeated clicks
  naturally toggle between them (for an outer planet, which never
  reaches true "new," between its peak and whatever its dimmest point
  is — e.g. Mars alternates between full and ~88% lit).
- The current view (selected bodies, date, speed, playing state, zoom,
  phase-widget body) is reflected live in the URL's query string, and a
  "Copy link" button copies a fully shareable URL.

## Query parameters

The page reads its initial state from the URL, so a link like

```
index.html?planets=earth,mars,moon&date=2026-01-01&speed=30&playing=true&zoom=1
```

loads with only Earth, Mars, and the Moon selected, starting Jan 1 2026,
playing at 30 simulated days per second.

| Param     | Values                                              | Default  |
|-----------|------------------------------------------------------|----------|
| `planets` | comma-separated list of `sun,mercury,venus,earth,mars,jupiter,saturn,uranus,neptune,pluto,moon` | all of them |
| `date`    | `YYYY-MM-DD`                                        | today    |
| `speed`   | simulated days per real second (negative = reverse) | `128`    |
| `playing` | `true` / `false`                                    | `true`   |
| `zoom`    | geocentric panel manual zoom, `0.4`–`3`              | `1`      |
| `phase`   | which body the phase widget shows: `mercury,venus,mars,jupiter,saturn,uranus,neptune,pluto,moon` | first non-Sun, non-Earth body in `planets` (in the order given); `venus` if `planets` wasn't given, or requested only Sun and/or Earth |
| `years`   | clears trails and runs forward exactly this many simulated years from `date`, then auto-stops (speed is auto-picked unless `speed` is also given) | unset — runs indefinitely |

## Accuracy

This is a simplified, circular-orbit visualization meant for seeing
*relative* motion, scale, and the retrograde-loop phenomenon clearly — it
is **not** a precision ephemeris. See
[`docs/orbital-data.md`](docs/orbital-data.md) for exactly which
constants are used and where they come from, and
[`docs/technical-decisions.md`](docs/technical-decisions.md) for the
rendering and architecture choices behind the two panels, the trails, and
the month ring.

## Cost & how this was built

This project was built collaboratively with
[Claude Code](https://claude.com/claude-code):

| Model | Session usage | Real time | Prompts |
|-------|---------------|-----------|---------|
| Claude Sonnet 5 | ~49% of the 5-hour session limit | ~2 hours | 14 |

See [`docs/build-log.md`](docs/build-log.md) for a per-prompt breakdown of
what was asked and what it cost, and [`docs/devlog.md`](docs/devlog.md)
for the technical and process learnings from that session.
