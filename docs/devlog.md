# Devlog

Running log of what was built, when, and what we learned along the way.

### Learning tags

| Tag | Meaning |
|-----|---------|
| `[note]` | Useful context, well-documented — good to have written down but you'd find it in the docs |
| `[insight]` | Non-obvious; meaningfully changes how you design or debug something |
| `[gotcha]` | A specific trap that bit you; high risk of biting you again — bookmark this |

## TL;DR

| Version | Summary |
|---------|---------|
| [v1.1.0](#v110--phase-widget-skip-to-extreme-control-and-mobile-layout-fixes-2026-09-10-1053) | Added a live phase widget (illuminated-fraction disk + skip-to-next-extreme control) to the geocentric panel, and fixed several mobile-layout issues along the way |
| [v1.0.0](#v100--two-panel-simulator-ships-with-mars-retrograde-demo-2026-09-10-0250) | Renamed to `sans_geometry`, deployed to GitHub Pages, added a Mars-retrograde demo button + `#demo` hash link, a favicon, and an Open Graph preview image |

## v1.1.0 — Phase widget, skip-to-extreme control, and mobile layout fixes (2026-09-10 10:53)

**Review:** not yet

**What was built:**
- Added a phase widget to the geocentric panel: pick any planet or the
  Moon and watch its illuminated fraction change live, computed from the
  same heliocentric positions the sim already tracks (no new orbital data
  needed) — motivated by discussing how Venus's phases historically argued
  against a strict geocentric model.
- Iterated the widget through several rounds of feedback: removed a
  distance-based size-scaling animation that read as an unrelated "zoom"
  rather than a phase cue; matched the lit disk's color to each body's own
  orbit-dot color; fixed the readout text's variable width visibly
  shifting the disk left/right; fixed a mobile-only overlap with the
  circular canvas by giving the widget a responsive layout (a bar above
  the canvas below the desktop breakpoint, a corner overlay above it).
- Moved the geocentric zoom control to a horizontal bar pinned above the
  transport controls on mobile too, so the circle and the zoom slider are
  both visible together without scrolling.
- Made the `?phase=` URL default to the first non-Sun/non-Earth body
  listed in `?planets=`, falling back to Venus if there isn't one.
- Added a "skip to next extreme" (`⏭`) button that fast-forwards playback
  (trails accumulate along the way, nothing is skipped over) to the next
  time the selected body is full or new, then auto-pauses; since full and
  new alternate, repeated clicks naturally toggle between them. Disabled,
  via an editable `PHASE_SKIP_DISABLED` list, for Saturn/Uranus/
  Neptune/Pluto, whose minimum illumination always rounds to "100% lit."

**Key technical learnings:**
- `[insight]` Illuminated fraction is just the Sun-object-Earth angle
  computed from vectors already in the sim (Sun at the origin, Earth and
  the object's heliocentric positions) — works identically for the Moon
  (using its existing geocentric offset from Earth) with no special-casing
  needed.
- `[gotcha]` A `@media` override placed *before* the unconditional rule it's
  meant to override loses to it in the cascade at any width, even inside
  the media query's own range — equal specificity means source order alone
  breaks the tie. Produced a genuinely confusing symptom (an
  absolutely-positioned box, but laid out and styled like the *other*
  breakpoint) that took real investigation to trace back to plain rule
  ordering rather than a logic bug.
- `[insight]` For a superior planet, "full" occurs at *both* opposition and
  solar conjunction (both are exact Sun-Earth-planet alignments), with the
  two quadratures in between giving its minimum — so its illuminated
  fraction has four extrema per synodic period, not two like an inferior
  planet's or the Moon's (new ↔ full only). Mattered directly for sizing
  the fast-forward speed and for reasoning through whether the "alternate
  between extremes" behavior generalized correctly to outer planets.
- `[gotcha]` Comparing a value to itself while the simulation is paused
  (`k >= prevK`, when neither has actually changed) trivially reads as
  "true" — harmless as a cosmetic quirk (the phase readout shows "waxing"
  while idle regardless of the real trend) until it's fed into
  trend-reversal detection logic that assumes the label reflects genuine
  motion, which briefly looked like a real bug before tracing it back to
  this.
- `[note]` The browser automation's window-resize tool was unreliable this
  session (silently kept the previous width across repeated calls);
  closing the tab and opening a fresh one, or just taking a `computer`
  screenshot (which seems to force a backgrounded tab to actually paint
  and run `requestAnimationFrame`), got layout verification unstuck when
  it happened.

## v1.0.0 — Two-panel simulator ships with Mars retrograde demo (2026-09-10 02:50)

**Review:** not yet

**What was built:**
- Read Wikipedia's plot summary for *Orb: On the Movements of the Earth* and matched each of its four parts against what the simulator can actually show — Part Two's "Mars unexpectedly retrogrades" is the one phenomenon the app was already built to demonstrate directly.
- Added a **Mars retrograde demo** preset button and an `index.html#demo` hash shortcut that redirects to the full preset query string, so the demo is a single click or a short link away.
- Tuned the preset over several follow-ups to its final form: `date=1433-10-10&zoom=0.85&speed=128`.
- Renamed the project folder from `geocentric` to `sans_geometry`, created the public GitHub repo, and deployed it to GitHub Pages.
- Added GitHub and Wikipedia links to the header, then fixed a layout bug where they visibly jumped left/right as the date/speed readout changed width.
- Designed a favicon — a blue Earth dot with an orange Mars retrograde-loop track around it — simplified until it stayed legible at true 16×16.
- Added Open Graph / Twitter Card meta tags and a real screenshot (`og-image.png`, taken from the demo preset right after its run completes) so shared links get a preview image on Threads, Slack, iMessage, etc.

**Key technical learnings:**
- `[gotcha]` A `const` declared later in the same IIFE (`trails`, `lastSampleDate`) throws `ReferenceError: Cannot access 'trails' before initialization` if earlier synchronous startup code calls a function that closes over it — even though nothing else had exercised that path yet. The `?years=` on-load handler ran before those `const`s were declared, so *any* link using the documented `years` query param silently blanked both canvases. Fix: moved the on-load trigger to after the declarations.
- `[insight]` `justify-content: space-between` on a flex container with three-plus children lets a middle item drift whenever a sibling's content changes width — here, the header's date/speed readout changing length shifted the GitHub/Wiki nav sitting between it and the title. Grouping the stable items into one wrapper `<div>` fixes their position regardless of what the variable-width sibling does.
- `[note]` The detail budget at 16×16 favicon size is brutal — a mathematically accurate retrograde-loop curve (a limaçon or hypotrochoid) just reads as a blur. Two overlapping thick-stroke circles (a ring + a smaller loop) reads clearly as "track with a kink" at real favicon sizes; verified by rendering actual 16×16 PNGs with `rsvg-convert` rather than judging from a scaled-up preview.
- `[note]` Chrome throttles `requestAnimationFrame` in a tab driven by browser automation, so simulated time advances far slower than the configured speed suggests when checking progress via periodic screenshots — worth bumping speed way up (or just waiting longer) rather than assuming something's broken.

**Process learnings:**
- `[note]` Session build stats, as reported by the user from their own usage view: model **Claude Sonnet 5**, ~49% of the 5-hour session usage limit consumed, ~2 hours of real time, across 14 prompts in one continuous session. See [`build-log.md`](build-log.md) for what each prompt asked for and roughly what it cost.
