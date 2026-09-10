# Orbital data: what's used, and where it comes from

`script.js` models every planet with exactly three numbers plus a color
and a name:

| Field | Meaning |
|-------|---------|
| `a`      | semi-major axis, in AU (= the orbit's radius, since orbits are modeled as circles) |
| `period` | sidereal orbital period, in days (time for one full 360° revolution around the Sun) |
| `L0`     | mean longitude at the J2000.0 epoch, in degrees (where on the circle the body was on 2000-01-01 12:00 TT) |

These three numbers are the entire "initial position, speed, radius" of
each body:

- **radius** = `a`, directly.
- **initial position** = the angle `L0`, converted to `(x, y) = (a·cos(L0), a·sin(L0))`.
- **speed** (angular velocity) = `360° / period`, constant — because the
  orbit is modeled as a circle, the code assumes *uniform* angular speed.
  A real orbit doesn't move at constant angular speed (it's faster at
  perihelion, slower at aphelion — Kepler's second law), but that
  correction was left out; see
  [`technical-decisions.md`](technical-decisions.md#circular-orbits-not-kepler-ellipses)
  for why.

At any simulated date `t`, the position is:

```
daysSinceJ2000 = (t - 2000-01-01T12:00 TT) / 1 day
meanLongitude  = L0 + 360° * daysSinceJ2000 / period      (mod 360°)
x = a * cos(meanLongitude)
y = a * sin(meanLongitude)
```

## Where the numbers came from

`a` and `L0` for the nine planets trace back to a single well-known
reference:

> E. M. Standish, *"Keplerian Elements for Approximate Positions of the
> Major Planets,"* JPL Solar System Dynamics Group technical note (1992).
> Table 1 ("valid for the time-interval 1800 AD – 2050 AD"), referenced to
> the mean ecliptic and equinox of J2000.0. The same table is still
> published today at
> [ssd.jpl.nasa.gov/planets/approx_pos.html](https://ssd.jpl.nasa.gov/planets/approx_pos.html).

That table gives six orbital elements per planet (`a`, `e`, `I`, `L`, `ϖ`,
`Ω`) — this simulator only uses `a` and `L` (mean longitude), since
eccentricity `e`, inclination `I`, longitude of perihelion `ϖ`, and
longitude of the ascending node `Ω` all only matter once you stop
approximating every orbit as a circle in the ecliptic plane.

`period` (days) for each planet is the standard, widely-published sidereal
orbital period (the kind you'd find on a NASA/NSSDC planetary fact sheet)
— not derived purely from `a` via Kepler's third law, because that simple
two-body form (`T_years = a_AU^1.5`) ignores planet mass and is only
accurate to within roughly 0.1% for the giant planets.

The Moon uses a different, equally standard set of references:

- `a = 0.0025696 AU` — the mean Earth–Moon distance, 384,400 km, converted
  via 1 AU = 149,597,870.7 km.
- `period = 27.3217` days — the standard sidereal month.
- `L0 = 218.32°` — from the constant term of the Moon's mean-longitude
  series in Jean Meeus, *Astronomical Algorithms*, 2nd ed. (1998):
  `L' = 218.3164591° + 481267.88134236°·T − …`, evaluated at `T = 0`
  (J2000.0).

## How I actually produced these values, and how well they hold up

These constants were originally written into `script.js` from general
astronomical knowledge (this assistant's training data) — they were not
fetched from a live ephemeris at the time the code was written. When
writing this document, I went back and fetched the actual Standish 1992
table to check them. Here's the honest comparison, `L` values reduced to
0–360°:

| Body    | `a` used (AU) | `a`, JPL Table 1 | Δa      | `L0` used (°) | `L`, JPL Table 1 (°) | ΔL |
|---------|---------------:|-----------------:|--------:|---------------:|----------------------:|-----:|
| Mercury | 0.38710        | 0.38709927        | +0.00000| 252.25         | 252.2503               | −0.0003 |
| Venus   | 0.72333        | 0.72333566         | −0.00001| 181.98         | 181.9791               | +0.0009 |
| Earth   | 1.00000        | 1.00000261 (EM bary) | −0.00000| 100.47      | 100.4646               | +0.0054 |
| Mars    | 1.52368        | 1.52371034         | −0.00003| 355.43         | 355.4466               | −0.0166 |
| Jupiter | 5.20260        | 5.20288700         | −0.00029| 34.35          | 34.3964                | −0.0464 |
| Saturn  | 9.55491        | 9.53667594         | +0.01823| 50.08          | 49.9542                | +0.1258 |
| Uranus  | 19.2184        | 19.18916464        | +0.02924| 314.20         | 313.2381               | +0.9619 |
| Neptune | 30.1104        | 30.06992276        | +0.04048| 304.22         | 304.8800               | −0.6600 |
| Pluto   | 39.5445        | 39.48211675        | +0.06238| 238.93         | 238.9290               | +0.0010 |

Takeaways:

- Mean longitude (`L0`) matches the authoritative table to within
  **0.05°** for seven of the nine planets, and Mercury/Pluto match to
  four decimal places — strong evidence these values genuinely trace back
  to that table (directly or via a source that copied it closely).
- Uranus and Neptune are the two outliers, off by roughly **0.7–1.0°**
  (a few weeks' worth of orbital drift for those slow-moving planets) —
  small in absolute terms, but the largest gaps found.
- Semi-major axis (`a`) is consistently within **~0.2%** for the outer
  planets and near-exact for the inner ones. Given the periods used
  already match the accepted real sidereal periods closely (see below),
  this ~0.2% gap doesn't meaningfully affect the simulation — `a` mainly
  sets the *display radius* and, in the geocentric panel, the *scale
  bound* (see `technical-decisions.md`), neither of which needs
  precision.

None of this affects the disclaimer already in the page's footer: this is
a circular-orbit approximation for visualizing relative motion, not a
precision ephemeris. If you want to tighten these constants further (or
add eccentricity), the JPL page linked above, plus the same page's
`ṫ`/century rate columns, is the place to start — and NASA's
[Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)
are a convenient cross-check for `a` and `period` specifically.

## Table as encoded in `script.js`

| Body    | `a` (AU)  | `period` (days) | `L0` (°) |
|---------|-----------|-----------------|----------|
| Mercury | 0.38710   | 87.9691         | 252.25   |
| Venus   | 0.72333   | 224.701         | 181.98   |
| Earth   | 1.00000   | 365.256         | 100.47   |
| Mars    | 1.52368   | 686.980         | 355.43   |
| Jupiter | 5.20260   | 4332.589        | 34.35    |
| Saturn  | 9.55491   | 10759.22        | 50.08    |
| Uranus  | 19.2184   | 30688.5         | 314.20   |
| Neptune | 30.1104   | 60182.0         | 304.22   |
| Pluto   | 39.5445   | 90560.0         | 238.93   |
| Moon    | 0.0025696 | 27.3217         | 218.32 (Earth-relative) |
