# Heliocentric vs Geocentric Orbit Simulator

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
- The current view (selected bodies, date, speed, playing state, zoom) is
  reflected live in the URL's query string, and a "Copy link" button
  copies a fully shareable URL.

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
