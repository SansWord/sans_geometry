(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Demo presets: named bundles of query params for one-click illustrations
  // of specific phenomena. `index.html#demo` (or `#demo=<name>`) redirects
  // to `index.html?<that preset's params>` before anything else runs, so a
  // short hash link is enough to share a demo.
  // ---------------------------------------------------------------------
  const DEMOS = {
    "mars-retrograde": {
      planets: "sun,earth,mars",
      date: "1433-10-10",
      zoom: "0.85",
      speed: "128",
    },
    "venus-final-phase": {
      planets: "sun,earth,venus",
      date: "1435-04-16", // Venus at ~0% lit (new phase) — skip lands on the next full (~100%)
      phase: "venus",
      speed: "128", // already faster than Venus's calculated skip speed, so the skip keeps it as-is
      // One-shot flag: fast-forward to Venus's next full/new extreme and
      // auto-pause there. See the ?autoskip= handling below.
      autoskip: "1",
    },
  };
  const DEFAULT_DEMO = "mars-retrograde";

  function demoTargetUrl(name) {
    const demo = DEMOS[name];
    if (!demo) return null;
    const url = new URL(location.href);
    url.hash = "";
    url.search = "";
    for (const [k, v] of Object.entries(demo)) url.searchParams.set(k, v);
    return url;
  }

  const demoMatch = /^#demo(?:=([\w-]+))?$/.exec(location.hash);
  if (demoMatch) {
    const target = demoTargetUrl(demoMatch[1] || DEFAULT_DEMO);
    if (target) {
      location.replace(target.toString());
      return;
    }
  }

  // ---------------------------------------------------------------------
  // Orbital data (simplified circular orbits).
  // a: semi-major axis in AU. period: sidereal period in days.
  // L0: mean longitude at J2000.0 epoch, in degrees (approximate).
  // ---------------------------------------------------------------------
  const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  const MS_PER_DAY = 86400000;
  const DAYS_PER_YEAR = 365.25;
  const DEFAULT_SPEED = 128;

  const BODIES = [
    { key: "mercury", name: "Mercury", color: "#b7b2ad", a: 0.38710, period: 87.9691,   L0: 252.25 },
    { key: "venus",   name: "Venus",   color: "#e8c39e", a: 0.72333, period: 224.701,   L0: 181.98 },
    { key: "earth",   name: "Earth",   color: "#4d8fdb", a: 1.00000, period: 365.256,   L0: 100.47 },
    { key: "mars",    name: "Mars",    color: "#d1603d", a: 1.52368, period: 686.980,   L0: 355.43 },
    { key: "jupiter", name: "Jupiter", color: "#d9a066", a: 5.20260, period: 4332.589,  L0: 34.35  },
    { key: "saturn",  name: "Saturn",  color: "#e6c88a", a: 9.55491, period: 10759.22,  L0: 50.08  },
    { key: "uranus",  name: "Uranus",  color: "#9fd8e0", a: 19.2184, period: 30688.5,   L0: 314.20 },
    { key: "neptune", name: "Neptune", color: "#5b7fe0", a: 30.1104, period: 60182.0,   L0: 304.22 },
    { key: "pluto",   name: "Pluto",   color: "#b6a6ca", a: 39.5445, period: 90560.0,   L0: 238.93 },
  ];
  const MOON = { key: "moon", name: "Moon", color: "#cfd3da", a: 0.0025696, period: 27.3217, L0: 218.32, parent: "earth" };
  const SUN_COLOR = "#ffd66b";
  const SUN = { key: "sun", name: "Sun", color: SUN_COLOR };

  const BODY_BY_KEY = Object.fromEntries(BODIES.map(b => [b.key, b]));
  const ALL_KEYS = BODIES.map(b => b.key);

  // Bodies offered in the phase widget: everything with a real phase cycle
  // as seen from Earth. Excludes Earth itself (no "phase of Earth as seen
  // from Earth") and the Sun (not illuminated by itself).
  const PHASE_BODIES = BODIES.filter(b => b.key !== "earth").concat([MOON]);

  // Bodies for which the "skip to next full/new" button is disabled: their
  // minimum illumination (at quadrature) still rounds to "100% lit" in the
  // readout, so there's no visibly different "new" extreme to fast-forward
  // to. Mars (min ~88%) and Jupiter (min ~99%) stay enabled since their dip
  // is actually visible; Saturn/Uranus/Neptune/Pluto (min ~99.7-99.98%)
  // don't. Edit this list directly if that judgment call should change.
  const PHASE_SKIP_DISABLED = new Set(["saturn", "uranus", "neptune", "pluto"]);

  function rad(deg) { return (deg * Math.PI) / 180; }

  function heliocentricPos(body, simDate) {
    const daysSinceEpoch = (simDate - J2000) / MS_PER_DAY;
    const meanLon = body.L0 + (360 * daysSinceEpoch) / body.period;
    const theta = rad(((meanLon % 360) + 360) % 360);
    return { x: body.a * Math.cos(theta), y: body.a * Math.sin(theta) };
  }

  function sunGeoAngleAt(simDate) {
    const e = heliocentricPos(BODY_BY_KEY.earth, simDate);
    return Math.atan2(-e.y, -e.x);
  }

  // ---------------------------------------------------------------------
  // Geocentric "month ring": the Sun's geocentric angle sweeps a full
  // circle once a year (it's literally the Sun's ecliptic longitude — the
  // same quantity ancient calendars tracked to know the season). We anchor
  // that sweep so Jan 1 sits at 12 o'clock (straight up) in the geocentric
  // panel, then draw a ring of month labels at their true angular
  // positions, so the Sun marker's position against that ring reads
  // directly as "roughly which month".
  // ---------------------------------------------------------------------
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const GEO_ROTATION_OFFSET = Math.PI / 2 - sunGeoAngleAt(new Date(Date.UTC(2001, 0, 1)));
  const MONTH_TICK_ANGLES = MONTH_NAMES.map((_, i) =>
    sunGeoAngleAt(new Date(Date.UTC(2001, i, 1))) + GEO_ROTATION_OFFSET
  );

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const params = new URLSearchParams(location.search);

  const state = {
    visible: new Set(ALL_KEYS.concat(["moon", "sun"])),
    simDate: new Date(),
    speed: DEFAULT_SPEED, // simulated days per real second (default when no ?speed= is given)
    playing: true,
    geoZoom: 1,        // manual zoom multiplier for the geocentric panel
    showTychonic: false, // overlay Sun-centered orbit rings on the geocentric panel
    run: { target: null, startDate: null, completed: false }, // "Run for N years"
    trailsSince: null, // simDate as of the last trail clear; set below once simDate is finalized
    phaseBody: "venus", // placeholder; finalized below once ?planets= is parsed
    phaseRun: { active: false, baselineWaxing: null }, // "skip to next full/new" fast-forward
  };

  // Order the ?planets= list was given in (not state.visible — a Set, whose
  // insertion order matters only for this, not for anything else) so the
  // phase-widget default below can pick "the first body you asked to see".
  let requestedPlanetOrder = null;
  if (params.has("planets")) {
    const requested = params.get("planets").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    requestedPlanetOrder = requested.filter(k => ALL_KEYS.includes(k) || k === "moon" || k === "sun");
    state.visible = new Set(requestedPlanetOrder);
  }
  if (params.has("date")) {
    const d = new Date(params.get("date") + (params.get("date").length <= 10 ? "T00:00:00Z" : ""));
    if (!isNaN(d)) state.simDate = d;
  }
  if (params.has("speed")) {
    const s = parseFloat(params.get("speed"));
    if (!isNaN(s) && s !== 0) state.speed = s;
  }
  if (params.has("playing")) {
    state.playing = params.get("playing") !== "false";
  }
  if (params.has("zoom")) {
    const z = parseFloat(params.get("zoom"));
    if (!isNaN(z) && z > 0) state.geoZoom = Math.min(3, Math.max(0.4, z));
  }
  if (params.has("tychonic")) {
    state.showTychonic = params.get("tychonic") !== "0" && params.get("tychonic") !== "false";
  }
  // Phase widget default: the first ?planets= body that isn't the Sun or
  // Earth (already filtered to known keys above, so anything left after
  // excluding those two is a valid PHASE_BODIES entry). Falls back to Venus
  // when ?planets= wasn't given, or only requested Sun and/or Earth. An
  // explicit ?phase= always wins over this default.
  state.phaseBody = (requestedPlanetOrder || []).find(k => k !== "sun" && k !== "earth") || "venus";
  if (params.has("phase")) {
    const p = params.get("phase").trim().toLowerCase();
    if (PHASE_BODIES.some(b => b.key === p)) state.phaseBody = p;
  }
  // "years" is handled after the run-controls / clearAllTrails machinery
  // is set up below, since starting a run needs both of those.
  let requestedYearsOnLoad = null;
  let speedWasExplicit = params.has("speed");
  if (params.has("years")) {
    const y = parseFloat(params.get("years"));
    if (!isNaN(y) && y > 0) requestedYearsOnLoad = y;
  }
  // One-shot: fast-forward the phase widget to the next full/new extreme
  // and auto-pause there, same as clicking the skip button by hand.
  // Triggered once the skip button is wired up, below. The ?autoskip= flag
  // itself is removed from the URL once the run actually completes (see
  // the phase-run completion block in render()) so a reload or copied
  // address-bar URL lands on the paused extreme instead of replaying the
  // whole fast-forward.
  const autoSkipOnLoad = params.has("autoskip") && params.get("autoskip") !== "0";
  state.trailsSince = new Date(state.simDate.getTime());

  // ---------------------------------------------------------------------
  // Controls: build planet checkboxes
  // ---------------------------------------------------------------------
  const planetListEl = document.getElementById("planetList");
  const CHIP_LIST = [SUN].concat(BODIES, [MOON]);

  CHIP_LIST.forEach(b => {
    const label = document.createElement("label");
    label.className = "planet-chip";
    label.innerHTML = `
      <span class="swatch" style="background:${b.color}"></span>
      <input type="checkbox" data-key="${b.key}" ${state.visible.has(b.key) ? "checked" : ""}>
      ${b.name}
    `;
    planetListEl.appendChild(label);
  });

  // A `null` value deletes that param instead of setting it — used to
  // clear one-shot flags like ?autoskip= once they've been consumed.
  function syncUrlParams(params) {
    const url = new URL(location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v === null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    history.replaceState(null, "", url);
  }

  planetListEl.addEventListener("change", (e) => {
    const input = e.target.closest("input[type=checkbox]");
    if (!input) return;
    const key = input.dataset.key;
    if (input.checked) {
      state.visible.add(key);
      trails[key] = [];
      lastSampleDate[key] = null;
    } else {
      state.visible.delete(key);
    }
    syncUrlParams({ planets: Array.from(state.visible).join(",") });
  });

  // ---------------------------------------------------------------------
  // Phase widget: body picker
  // ---------------------------------------------------------------------
  const phaseBodySelect = document.getElementById("phaseBodySelect");
  const phaseReadoutEl = document.getElementById("phaseReadout");
  PHASE_BODIES.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.key;
    opt.textContent = b.name;
    phaseBodySelect.appendChild(opt);
  });
  phaseBodySelect.value = state.phaseBody;

  const phaseSkipBtn = document.getElementById("phaseSkipExtreme");
  const PHASE_SKIP_TARGET_WALL_SECONDS = 4; // aim to cover the worst case (half a synodic period) in about this long

  // Reflects both possible reasons the button might be unusable right now:
  // the selected body is in PHASE_SKIP_DISABLED (permanent, until the body
  // changes), or a search is already in flight (temporary, until it lands).
  function updatePhaseSkipAvailability() {
    const body = PHASE_BODIES.find(b => b.key === state.phaseBody);
    const unsupported = PHASE_SKIP_DISABLED.has(state.phaseBody);
    phaseSkipBtn.disabled = unsupported || state.phaseRun.active;
    phaseSkipBtn.title = unsupported
      ? `${body ? body.name : "This body"}'s phase barely changes — fast-forward isn't useful here`
      : `Fast-forward to the next time ${body ? body.name : "this body"} is full or new`;
  }
  updatePhaseSkipAvailability();

  // Illuminated fraction from the previous frame, used to tell waxing from
  // waning by its trend rather than by sign conventions. Reset whenever the
  // selected body changes so the new body doesn't inherit the old one's
  // trend for one frame.
  let prevPhaseK = null;
  phaseBodySelect.addEventListener("change", () => {
    state.phaseBody = phaseBodySelect.value;
    prevPhaseK = null;
    // A body switch invalidates whatever "next extreme" search was in
    // flight for the old body — the trend being watched no longer means
    // anything.
    state.phaseRun.active = false;
    updatePhaseSkipAvailability();
    syncUrlParams({ phase: state.phaseBody });
  });

  // "Skip to next extreme": fast-forwards (reusing the same trail-sampling/
  // render loop as normal playback, just at a boosted speed — trails
  // accumulate along the way rather than being skipped over) until the
  // selected body's illuminated fraction next hits a local max (full) or
  // local min (new, for Mercury/Venus/Moon — or just "as dim as this body
  // ever gets" for an outer planet, which never truly reaches 0%), then
  // auto-pauses. Since full and new alternate, repeated clicks naturally
  // toggle between them.
  //
  // Detected in render() below by recording the current waxing/waning
  // trend on the first frame after the click, then watching for it to
  // flip. Waiting for an actual flip (not just "first frame going the
  // other way") matters because the trend at click time already IS one
  // direction or the other — recording it as the baseline is what makes
  // "next extreme" mean the *next* one, not an instant no-op stop if we
  // happen to click right after passing one.
  phaseSkipBtn.addEventListener("click", () => {
    const body = PHASE_BODIES.find(b => b.key === state.phaseBody);
    const worstCaseDays = synodicPeriodDays(body) / 2; // extremes alternate every half synodic period
    const calculatedSpeed = Math.ceil(Math.min(4096, Math.max(1 / 64, worstCaseDays / PHASE_SKIP_TARGET_WALL_SECONDS)));
    const speedBeforeRun = state.speed; // restored once the run auto-pauses, below
    // Only speed up, never slow down: if we're already going faster than
    // the "worst case in ~4s" target, leave that alone rather than
    // throttling down to it.
    if (Math.abs(speedBeforeRun) < calculatedSpeed) state.speed = calculatedSpeed;
    updateSpeedLabel();
    state.playing = true;
    updatePlayPauseButton();
    state.phaseRun = { active: true, baselineWaxing: null, speedBeforeRun };
    updatePhaseSkipAvailability();
    syncUrlParams({ speed: String(state.speed) });
  });

  if (autoSkipOnLoad && !PHASE_SKIP_DISABLED.has(state.phaseBody)) {
    // Deferred: synodicPeriodDays() (called from the click handler) reads
    // EARTH_PERIOD, a `const` initialized later in this same script — an
    // immediate synchronous call here would hit it before that
    // initialization runs. setTimeout(...,0) waits until the whole script
    // has finished executing first.
    setTimeout(() => phaseSkipBtn.click(), 0);
  }

  // ---------------------------------------------------------------------
  // Phase widget: draggable position
  // ---------------------------------------------------------------------
  // Only draggable at the desktop breakpoint (DESKTOP_BREAKPOINT_PX,
  // defined further below with the canvas-sizing code, matching the CSS
  // media query) — below that the widget is a static full-width bar in
  // normal flow, not an absolutely-positioned overlay, so there's nothing
  // to drag. It exists because a high geoZoom can grow the orbit
  // ring/month labels enough to intrude on whatever fixed corner the
  // widget sits in — no single static position avoids that at every zoom
  // level, and the fix may be to move it out of the Geocentric panel
  // entirely (e.g. onto the empty Heliocentric side), not just to a
  // different corner of the same panel.
  //
  // The widget still *lives* in the DOM inside the Geocentric panel's
  // .panel-body (needed for the mobile, non-dragged, normal-flow layout —
  // see the base, non-media-query .phase-widget rule in style.css). At the
  // desktop breakpoint it's always repositioned by JS, though (see
  // repositionPhaseWidgetOnResize below, called on load): switched to
  // `position: fixed` via inline style, which is relative to the viewport
  // regardless of DOM nesting (no ancestor here sets transform/filter/
  // perspective, which would otherwise override that), so it can be placed
  // — by default, or by a drag — anywhere across `.stage` (both panels
  // together), not just within whichever panel it happens to be nested in.
  // The plain CSS `position: absolute; top/left: 8px` corner in style.css
  // only ever shows for the single frame before that JS repositioning runs.
  //
  // Position is stored/passed around as a fraction of .stage's free space
  // (not raw px) so a saved position stays proportionally where it was
  // across window resizes, and persisted in localStorage so a drag
  // survives a reload.
  const phaseWidget = document.getElementById("phaseWidget");
  const phaseDragHandle = document.getElementById("phaseDragHandle");
  const phaseWidgetStage = document.querySelector(".stage");
  const PHASE_WIDGET_POS_KEY = "sansGeometry.phaseWidgetPos";

  function loadPhaseWidgetPos() {
    try {
      const pos = JSON.parse(localStorage.getItem(PHASE_WIDGET_POS_KEY));
      if (pos && typeof pos.xFrac === "number" && typeof pos.yFrac === "number") return pos;
    } catch { /* corrupt/blocked storage — fall back to the default position */ }
    return null;
  }

  // The out-of-the-box position (until the user drags it, or forever if
  // they never do): horizontally centered between the two panels, just
  // below the panel headings — clear of both circles regardless of
  // geoZoom. DEFAULT_PHASE_WIDGET_TOP_PX is a target pixel gap from the
  // stage top rather than a fixed yFrac, so it stays a small, roughly
  // constant gap under the headings instead of drifting down
  // proportionally to however tall the stage happens to be.
  const DEFAULT_PHASE_WIDGET_TOP_PX = 28;
  function computeDefaultPhaseWidgetPos() {
    const stageRect = phaseWidgetStage.getBoundingClientRect();
    const maxTop = Math.max(0, stageRect.height - phaseWidget.offsetHeight);
    return {
      xFrac: 0.5, // centered: widget-center === stage-center
      yFrac: maxTop > 0 ? Math.min(1, DEFAULT_PHASE_WIDGET_TOP_PX / maxTop) : 0,
    };
  }

  function applyPhaseWidgetPos(pos) {
    phaseWidget.style.position = "fixed";
    const stageRect = phaseWidgetStage.getBoundingClientRect();
    const maxLeft = Math.max(0, stageRect.width - phaseWidget.offsetWidth);
    const maxTop = Math.max(0, stageRect.height - phaseWidget.offsetHeight);
    phaseWidget.style.left = `${Math.round(stageRect.left + pos.xFrac * maxLeft)}px`;
    phaseWidget.style.top = `${Math.round(stageRect.top + pos.yFrac * maxTop)}px`;
  }

  // Re-applies the saved (or default) fraction against the current stage
  // size. Called from resizeAll() below (which already runs on load once
  // layout has settled, and again via its ResizeObserver) rather than
  // measuring here directly — this file's own canvas-sizing code already
  // notes that fonts/layout settle a tick after load, so reusing that same
  // timing avoids reading a bogus stage size before things are ready.
  function repositionPhaseWidgetOnResize() {
    if (window.innerWidth < DESKTOP_BREAKPOINT_PX) {
      // Clear any desktop-only `fixed` positioning (from a drag, or from
      // applying the default/saved position above) so the mobile CSS rule
      // — a static, full-width bar in normal flow, order:-1 — takes back
      // over cleanly instead of leaving the widget floating at its last
      // desktop pixel coordinates.
      phaseWidget.style.position = "";
      phaseWidget.style.left = "";
      phaseWidget.style.top = "";
      return;
    }
    applyPhaseWidgetPos(loadPhaseWidgetPos() || computeDefaultPhaseWidgetPos());
  }

  let phaseDrag = null;
  phaseDragHandle.addEventListener("pointerdown", (e) => {
    if (window.innerWidth < DESKTOP_BREAKPOINT_PX) return;
    e.preventDefault();
    // Re-anchor at the widget's current on-screen spot before switching to
    // `fixed` — getBoundingClientRect() is viewport-relative under either
    // position type, so this doesn't visually jump.
    const widgetRect = phaseWidget.getBoundingClientRect();
    phaseWidget.style.position = "fixed";
    phaseWidget.style.left = `${widgetRect.left}px`;
    phaseWidget.style.top = `${widgetRect.top}px`;
    phaseDrag = {
      pointerId: e.pointerId,
      startLeft: widgetRect.left,
      startTop: widgetRect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    phaseDragHandle.setPointerCapture(e.pointerId);
  });

  phaseDragHandle.addEventListener("pointermove", (e) => {
    if (!phaseDrag || e.pointerId !== phaseDrag.pointerId) return;
    const stageRect = phaseWidgetStage.getBoundingClientRect();
    const minLeft = stageRect.left, minTop = stageRect.top;
    const maxLeft = stageRect.left + Math.max(0, stageRect.width - phaseWidget.offsetWidth);
    const maxTop = stageRect.top + Math.max(0, stageRect.height - phaseWidget.offsetHeight);
    const left = Math.min(maxLeft, Math.max(minLeft, phaseDrag.startLeft + (e.clientX - phaseDrag.startX)));
    const top = Math.min(maxTop, Math.max(minTop, phaseDrag.startTop + (e.clientY - phaseDrag.startY)));
    phaseWidget.style.left = `${left}px`;
    phaseWidget.style.top = `${top}px`;
  });

  function endPhaseWidgetDrag(e) {
    if (!phaseDrag || e.pointerId !== phaseDrag.pointerId) return;
    phaseDrag = null;
    const stageRect = phaseWidgetStage.getBoundingClientRect();
    const maxLeft = Math.max(0, stageRect.width - phaseWidget.offsetWidth);
    const maxTop = Math.max(0, stageRect.height - phaseWidget.offsetHeight);
    const widgetRect = phaseWidget.getBoundingClientRect();
    const left = widgetRect.left - stageRect.left;
    const top = widgetRect.top - stageRect.top;
    const pos = { xFrac: maxLeft > 0 ? left / maxLeft : 0, yFrac: maxTop > 0 ? top / maxTop : 0 };
    try { localStorage.setItem(PHASE_WIDGET_POS_KEY, JSON.stringify(pos)); } catch { /* private browsing etc. — position just won't persist */ }
  }
  phaseDragHandle.addEventListener("pointerup", endPhaseWidgetDrag);
  phaseDragHandle.addEventListener("pointercancel", endPhaseWidgetDrag);

  phaseDragHandle.addEventListener("dblclick", () => {
    try { localStorage.removeItem(PHASE_WIDGET_POS_KEY); } catch { /* ignore */ }
    applyPhaseWidgetPos(computeDefaultPhaseWidgetPos());
  });

  // ---------------------------------------------------------------------
  // Transport controls
  // ---------------------------------------------------------------------
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnSlower = document.getElementById("btnSlower");
  const btnFaster = document.getElementById("btnFaster");
  const btnReverse = document.getElementById("btnReverse");
  const btnClearTrails = document.getElementById("btnClearTrails");
  const speedLabel = document.getElementById("speedLabel");
  const dateInput = document.getElementById("dateInput");
  const btnNow = document.getElementById("btnNow");
  const btnShare = document.getElementById("btnShare");
  const dateLabel = document.getElementById("dateLabel");
  const yearSecLabel = document.getElementById("yearSecLabel");
  const trailAgeLabel = document.getElementById("trailAgeLabel");

  function toISODateInput(d) {
    return d.toISOString().slice(0, 10);
  }
  dateInput.value = toISODateInput(state.simDate);

  function updatePlayPauseButton() {
    btnPlayPause.textContent = state.playing ? "⏸ Pause" : "▶ Play";
  }
  function formatYearSeconds(sec) {
    if (sec < 1) return `${sec.toFixed(2)}s`;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  }
  function updateSpeedLabel() {
    const mag = Math.abs(state.speed);
    const text = mag >= 1 ? `${mag}×` : `1/${Math.round(1 / mag)}×`;
    speedLabel.textContent = (state.speed < 0 ? "-" : "") + text;
    yearSecLabel.textContent = `1 year ≈ ${formatYearSeconds(DAYS_PER_YEAR / mag)}`;
  }
  updatePlayPauseButton();
  updateSpeedLabel();

  // How much simulated time has accumulated since trails were last cleared
  // (not since the page loaded) — e.g. to know when you've run long enough
  // for the slowest planet's trail to close (see docs/technical-decisions.md,
  // "Trail sampling": Pluto's geocentric loop needs ~248 simulated years).
  function formatYears(y) {
    return y < 10 ? `${y.toFixed(1)}y` : `${Math.round(y).toLocaleString()}y`;
  }
  function updateTrailAgeLabel() {
    const elapsedYears = Math.abs((state.simDate - state.trailsSince) / MS_PER_DAY / DAYS_PER_YEAR);
    trailAgeLabel.textContent = `Trail age: ${formatYears(elapsedYears)}`;
  }
  updateTrailAgeLabel();

  function clearAllTrails() {
    for (const k of Object.keys(trails)) trails[k] = [];
    for (const k of Object.keys(lastSampleDate)) lastSampleDate[k] = null;
    state.trailsSince = new Date(state.simDate.getTime());
    updateTrailAgeLabel();
  }

  btnPlayPause.addEventListener("click", () => {
    state.playing = !state.playing;
    updatePlayPauseButton();
  });

  btnClearTrails.addEventListener("click", () => {
    clearAllTrails();
  });

  // Snap to the power-of-two "rung" above/below the current speed, rather
  // than always doubling/halving whatever the exact current value is.
  // Normally these are the same thing (128 -> 256 -> 512 ...), but a
  // non-ladder speed — e.g. 1461x set by "Run for N years" — would
  // otherwise drift further from the ladder every click (1461 -> 730.5 ->
  // 365.25 ...) instead of snapping back onto it (1461 -> 1024, or
  // 1461 -> 2048).
  function powerOfTwoRung(mag, direction) {
    const exact = Math.round(Math.log2(mag));
    const onLadder = Math.abs(Math.log2(mag) - exact) < 1e-9;
    const rung = onLadder ? exact : (direction > 0 ? Math.floor(Math.log2(mag)) : Math.ceil(Math.log2(mag)));
    return Math.pow(2, rung + direction);
  }

  btnSlower.addEventListener("click", () => {
    const mag = Math.max(1 / 64, powerOfTwoRung(Math.abs(state.speed), -1));
    state.speed = state.speed < 0 ? -mag : mag;
    updateSpeedLabel();
    syncUrlParams({ speed: String(state.speed) });
  });
  btnFaster.addEventListener("click", () => {
    const mag = Math.min(4096, powerOfTwoRung(Math.abs(state.speed), 1));
    state.speed = state.speed < 0 ? -mag : mag;
    updateSpeedLabel();
    syncUrlParams({ speed: String(state.speed) });
  });
  btnReverse.addEventListener("click", () => {
    state.speed = -state.speed;
    updateSpeedLabel();
    clearAllTrails();
    syncUrlParams({ speed: String(state.speed) });
  });

  function resetSpeed() {
    state.speed = DEFAULT_SPEED;
    updateSpeedLabel();
    syncUrlParams({ speed: String(state.speed) });
  }

  dateInput.addEventListener("change", () => {
    const d = new Date(dateInput.value + "T00:00:00Z");
    if (!isNaN(d)) {
      state.simDate = d;
      clearAllTrails();
      cancelRun();
      syncUrlParams({ date: toISODateInput(state.simDate) });
    }
  });
  btnNow.addEventListener("click", () => {
    state.simDate = new Date();
    dateInput.value = toISODateInput(state.simDate);
    clearAllTrails();
    cancelRun();
    syncUrlParams({ date: toISODateInput(state.simDate) });
  });

  // ---------------------------------------------------------------------
  // "Run for N years": clear tracks, jump to a speed that finishes the
  // requested span in about RUN_TARGET_WALL_SECONDS of real time, play
  // forward, and auto-stop once that many simulated years have passed.
  // Without ever using this control the simulation just keeps running
  // indefinitely, as before.
  // ---------------------------------------------------------------------
  const yearsInput = document.getElementById("yearsInput");
  const btnRunYears = document.getElementById("btnRunYears");
  const runStatus = document.getElementById("runStatus");
  const RUN_TARGET_WALL_SECONDS = 25;

  function cancelRun() {
    state.run = { target: null, startDate: null, completed: false };
    runStatus.textContent = "";
  }

  function startYearsRun(years, { autoSpeed = true } = {}) {
    clearAllTrails();
    state.run = { target: years, startDate: new Date(state.simDate.getTime()), completed: false };
    if (autoSpeed) {
      const raw = (years * DAYS_PER_YEAR) / RUN_TARGET_WALL_SECONDS;
      state.speed = Math.min(4096, Math.max(1 / 64, raw));
      updateSpeedLabel();
    }
    state.playing = true;
    updatePlayPauseButton();
    runStatus.textContent = `0 / ${years}y`;
    syncUrlParams({ years: String(years), speed: String(state.speed), date: toISODateInput(state.simDate) });
  }

  btnRunYears.addEventListener("click", () => {
    const years = Math.max(1, parseFloat(yearsInput.value) || 100);
    yearsInput.value = years;
    startYearsRun(years);
  });

  const btnDemoMarsRetrograde = document.getElementById("btnDemoMarsRetrograde");
  btnDemoMarsRetrograde.addEventListener("click", () => {
    const target = demoTargetUrl("mars-retrograde");
    if (target) location.href = target.toString();
  });

  const btnDemoVenusFinalPhase = document.getElementById("btnDemoVenusFinalPhase");
  btnDemoVenusFinalPhase.addEventListener("click", () => {
    const target = demoTargetUrl("venus-final-phase");
    if (target) location.href = target.toString();
  });

  btnShare.addEventListener("click", async () => {
    const url = new URL(location.href);
    url.searchParams.set("planets", Array.from(state.visible).join(","));
    url.searchParams.set("date", state.simDate.toISOString().slice(0, 10));
    url.searchParams.set("speed", String(state.speed));
    url.searchParams.set("playing", String(state.playing));
    url.searchParams.set("zoom", String(state.geoZoom));
    if (state.run.target !== null) url.searchParams.set("years", String(state.run.target));
    try {
      await navigator.clipboard.writeText(url.toString());
      const original = btnShare.textContent;
      btnShare.textContent = "✅ Copied!";
      setTimeout(() => { btnShare.textContent = original; }, 1500);
    } catch (err) {
      window.prompt("Copy this link:", url.toString());
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      btnPlayPause.click();
    } else if (e.key.toLowerCase() === "c") {
      e.preventDefault();
      btnClearTrails.click();
    } else if (e.key === "[") {
      e.preventDefault();
      btnSlower.click();
    } else if (e.key === "]") {
      e.preventDefault();
      btnFaster.click();
    } else if (e.key === "\\") {
      e.preventDefault();
      resetSpeed();
    }
  });

  // ---------------------------------------------------------------------
  // Geocentric zoom sidebar
  // ---------------------------------------------------------------------
  const geoZoomSlider = document.getElementById("geoZoomSlider");
  const geoZoomLabel = document.getElementById("geoZoomLabel");
  const geoZoomIn = document.getElementById("geoZoomIn");
  const geoZoomOut = document.getElementById("geoZoomOut");
  const geoZoomReset = document.getElementById("geoZoomReset");
  const GEO_ZOOM_MIN = 0.4, GEO_ZOOM_MAX = 3;

  function setGeoZoom(z) {
    state.geoZoom = Math.min(GEO_ZOOM_MAX, Math.max(GEO_ZOOM_MIN, z));
    geoZoomSlider.value = String(state.geoZoom);
    geoZoomLabel.textContent = `${Math.round(state.geoZoom * 100)}%`;
  }
  setGeoZoom(state.geoZoom);

  geoZoomSlider.addEventListener("input", () => setGeoZoom(parseFloat(geoZoomSlider.value)));
  geoZoomIn.addEventListener("click", () => setGeoZoom(state.geoZoom + 0.2));
  geoZoomOut.addEventListener("click", () => setGeoZoom(state.geoZoom - 0.2));
  geoZoomReset.addEventListener("click", () => setGeoZoom(1));

  // ---------------------------------------------------------------------
  // Tychonic orbit overlay toggle
  // ---------------------------------------------------------------------
  const tychonicToggle = document.getElementById("tychonicToggle");
  tychonicToggle.checked = state.showTychonic;
  tychonicToggle.addEventListener("change", () => {
    state.showTychonic = tychonicToggle.checked;
    syncUrlParams({ tychonic: state.showTychonic ? "1" : null });
  });

  // ---------------------------------------------------------------------
  // Canvas setup
  // ---------------------------------------------------------------------
  const helioCanvas = document.getElementById("helioCanvas");
  const geoCanvas = document.getElementById("geoCanvas");
  const phaseCanvas = document.getElementById("phaseCanvas");
  const helioCtx = helioCanvas.getContext("2d");
  const geoCtx = geoCanvas.getContext("2d");
  const phaseCtx = phaseCanvas.getContext("2d");

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssSize = canvas.clientWidth;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return cssSize;
  }

  // Above the mobile breakpoint, the two orbit panels sit side by side, so
  // canvas size (capped at 640px in CSS) is driven by available WIDTH
  // alone — on a wide-but-short desktop window that cap can still be
  // taller than the remaining viewport height, forcing an unwanted
  // vertical scrollbar. Publish a smaller cap as a CSS custom property so
  // `canvas { max-width: min(640px, var(--canvas-vh-cap)) }` (style.css)
  // can additionally bound canvas size by height. Skipped below the
  // breakpoint, where the stage stacks into one column and a vertical
  // scrollbar is expected/acceptable.
  //
  // How much chrome surrounds the canvas isn't just header+controls+footer
  // height — it also depends on things like how many lines the shortcuts
  // bar or footer note wrap to at this width, and the geocentric panel's
  // zoom sidebar has its own fixed minimum height that can force the row
  // taller than the canvas alone would. Rather than re-deriving all of
  // that algebraically (and it drifting out of sync as the page changes),
  // just measure the actual rendered overflow and shrink the cap until it
  // goes away, capped at a few iterations since each one forces a reflow.
  // Once the canvas alone hits its own floor and overflow still remains
  // (a genuinely short/narrow desktop window), also shrink the zoom
  // sidebar's slider (--zoom-slider-h in style.css) — its fixed height
  // would otherwise pin a scrollbar in place no matter how small the
  // canvas gets.
  const DESKTOP_BREAKPOINT_PX = 781; // matches the CSS media query
  const footerNote = document.querySelector(".note");
  function updateCanvasVhCap() {
    const root = document.documentElement;
    if (window.innerWidth < DESKTOP_BREAKPOINT_PX) {
      root.style.removeProperty("--canvas-vh-cap");
      root.style.removeProperty("--zoom-slider-h");
      return;
    }
    let cap = 640;
    let sliderH = 130;
    root.style.setProperty("--zoom-slider-h", `${sliderH}px`);
    for (let i = 0; i < 8; i++) {
      root.style.setProperty("--canvas-vh-cap", `${cap}px`);
      const overflow = root.scrollHeight - window.innerHeight;
      if (overflow <= 0) break;
      if (cap > 120) {
        cap = Math.max(120, cap - overflow - 2);
      } else {
        sliderH = Math.max(40, sliderH - overflow - 2);
        root.style.setProperty("--zoom-slider-h", `${sliderH}px`);
      }
    }
  }

  let helioSize = 0, geoSize = 0, phaseSize = 0;
  function resizeAll() {
    updateCanvasVhCap();
    helioSize = fitCanvas(helioCanvas);
    geoSize = fitCanvas(geoCanvas);
    phaseSize = fitCanvas(phaseCanvas);
    repositionPhaseWidgetOnResize();
  }
  window.addEventListener("resize", resizeAll);
  // fonts/layout settle a tick after load
  requestAnimationFrame(resizeAll);

  // The chrome around the canvases (header/controls/footer) can change
  // height without a `resize` event ever firing — e.g. controls re-wrapping
  // once web fonts finish loading, or the run-status text appearing —
  // which would leave --canvas-vh-cap computed against a stale layout.
  // Watching the chrome elements directly (rather than guessing how long
  // "settling" takes) keeps it correct regardless of load timing.
  if (window.ResizeObserver) {
    const chromeObserver = new ResizeObserver(() => resizeAll());
    [document.querySelector(".topbar"), document.querySelector(".controls"), footerNote]
      .forEach(el => { if (el) chromeObserver.observe(el); });
  }

  // ---------------------------------------------------------------------
  // Trails (geocentric only) — sampled per-body at a rate that resolves
  // both the small synodic wiggle and the (often much longer) big loop
  // around Earth, so loop shapes look similarly detailed regardless of
  // simulation speed. See trailSampleThresholdDays() and
  // docs/technical-decisions.md ("Trail sampling") for why two different
  // periods are involved.
  // ---------------------------------------------------------------------
  const trails = {};
  const lastSampleDate = {};
  BODIES.forEach(b => { trails[b.key] = []; lastSampleDate[b.key] = null; });

  // Geometry from the most recent geocentric render, used to hit-test trail
  // hover (see "Trail hover tooltip" below). Set each frame in render().
  let lastGeoRender = null;

  // Deferred until here (rather than run right after parsing ?years= above)
  // because startYearsRun -> clearAllTrails needs `trails`/`lastSampleDate`,
  // which aren't declared until this point.
  if (requestedYearsOnLoad !== null) {
    yearsInput.value = requestedYearsOnLoad;
    startYearsRun(requestedYearsOnLoad, { autoSpeed: !speedWasExplicit });
  }
  // Trimmed in batches (not one-by-one) so the O(n) array shift cost is
  // amortized. See trailSampleThresholdDays() below for how many points a
  // full geocentric loop ends up costing — this cap is sized to hold at
  // least ~2 loops for every body, including the slowest outer planets,
  // before old history starts getting trimmed while playing.
  const TRAIL_MAX_POINTS = 4500;
  const TRAIL_TRIM_SLACK = 400;
  const EARTH_PERIOD = BODY_BY_KEY.earth.period;

  // The small retrograde wiggle a planet traces closes once per synodic
  // period (how often Earth laps it). But the *big* loop that sweeps all
  // the way around Earth — what "one full circle" on screen means — is
  // governed by whichever of the two bodies' own (sidereal) periods is
  // longer: for outer planets (a > 1 AU) that's the planet's own orbit
  // (Saturn: ~29.4 years to circle the whole sky, same as its "Saturn
  // Return" in astrology); for inner planets (Mercury, Venus) Earth's
  // faster sidereal motion dominates instead, so the big loop closes once
  // a year regardless of the inner planet's own (faster) period. Trails
  // used to be sized off the synodic period alone, which is close to a
  // year for every outer planet — fine for resolving the small wiggle, but
  // far too short a window to ever complete the big loop (e.g. Saturn's
  // ~29 year loop never closed no matter how long the sim ran).
  function synodicPeriodDays(body) {
    return 1 / Math.abs(1 / EARTH_PERIOD - 1 / body.period);
  }
  function geoLoopPeriodDays(body) {
    return Math.max(EARTH_PERIOD, body.period);
  }

  // Sample spacing (in simulated days) for a body's trail: fine enough to
  // resolve the big loop in ~240 steps, but never coarser than resolving
  // each small synodic wiggle in ~8 steps (otherwise, for outer planets
  // where the big loop is many decades long, the wiggles would be under-
  // sampled into a jagged/aliased mess) — whichever of the two is finer.
  const TRAIL_SAMPLES_PER_BIG_LOOP = 240;
  const TRAIL_MIN_SAMPLES_PER_SYNODIC_LOOP = 8;
  function trailSampleThresholdDays(body) {
    return Math.min(
      geoLoopPeriodDays(body) / TRAIL_SAMPLES_PER_BIG_LOOP,
      synodicPeriodDays(body) / TRAIL_MIN_SAMPLES_PER_SYNODIC_LOOP
    );
  }

  function maybeSampleTrail(key, thresholdDays, dx, dy, sampleDate) {
    const last = lastSampleDate[key];
    if (last === null || Math.abs(sampleDate - last) / MS_PER_DAY >= thresholdDays) {
      const arr = trails[key];
      arr.push({ dx, dy, date: sampleDate });
      if (arr.length > TRAIL_MAX_POINTS + TRAIL_TRIM_SLACK) {
        arr.splice(0, arr.length - TRAIL_MAX_POINTS);
      }
      lastSampleDate[key] = sampleDate;
    }
  }

  // A single frame can advance the simulation by many days at once — a
  // slow frame (e.g. the browser still busy right after page load) with a
  // high `speed`, or just a high `speed` at a normal frame rate, since
  // dtSeconds is only capped at 0.25s, not at some small number of
  // simulated days. Sampling the trail only once per *render* frame in
  // that case skips over the threshold entirely, so the trail gets one
  // point far from the last instead of several close ones — a visible
  // kink/facet where frames were slow, most noticeable right at page
  // load. Sub-stepping here (independent of render, which is still only
  // called once per frame) keeps trail resolution tied to simulated time
  // instead of to however fast frames happened to render.
  const TRAIL_SUBSTEP_CAP = 64;
  function sampleTrailsAlong(fromDate, toDate) {
    const visibleBodies = BODIES.filter(b => b.key !== "earth" && state.visible.has(b.key));
    if (visibleBodies.length === 0) return;
    const totalDays = Math.abs(toDate - fromDate) / MS_PER_DAY;
    if (totalDays === 0) return;
    const minThreshold = Math.min(...visibleBodies.map(b => trailSampleThresholdDays(b)));
    const steps = Math.min(TRAIL_SUBSTEP_CAP, Math.max(1, Math.ceil(totalDays / minThreshold)));
    for (let i = 1; i <= steps; i++) {
      const t = fromDate.getTime() + (toDate.getTime() - fromDate.getTime()) * (i / steps);
      const sampleDate = new Date(t);
      const earthPos = heliocentricPos(BODY_BY_KEY.earth, sampleDate);
      visibleBodies.forEach(b => {
        const p = heliocentricPos(b, sampleDate);
        maybeSampleTrail(b.key, trailSampleThresholdDays(b), p.x - earthPos.x, p.y - earthPos.y, sampleDate);
      });
    }
  }

  // ---------------------------------------------------------------------
  // Scaling helper: sqrt-scaled radial mapping so both inner and outer
  // bodies are visible on the same canvas.
  // ---------------------------------------------------------------------
  function makeScale(size, distances, zoom = 1) {
    const R = size / 2;
    const INNER = size * 0.05 + 14;
    const OUTER = 16;
    const maxD = Math.max(1e-6, ...(distances.length ? distances : [1]));
    return (d) => INNER + Math.sqrt(Math.max(0, d) / maxD) * (R - INNER - OUTER) * zoom;
  }

  function drawOrbitRing(ctx, cx, cy, r, color) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawBody(ctx, cx, cy, radiusPx, color, label) {
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = radiusPx * 1.6;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (label) {
      ctx.fillStyle = "#cfd3e6";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, cx, cy - radiusPx - 6);
    }
  }

  // The geocentric panel mirrors the x-axis (cx - r*cos, instead of +) so
  // that, combined with GEO_ROTATION_OFFSET pinning Jan 1 to 12 o'clock,
  // the months run clockwise around the ring like a normal clock face.
  function geoXY(cx, cy, r, angle) {
    return { x: cx - r * Math.cos(angle), y: cy - r * Math.sin(angle) };
  }

  function drawTrail(ctx, cx, cy, points, toPx, color, rotationOffset = 0) {
    if (points.length < 2) return;
    ctx.beginPath();
    points.forEach((p, i) => {
      const dist = Math.hypot(p.dx, p.dy);
      const angle = Math.atan2(p.dy, p.dx) + rotationOffset;
      const r = toPx(dist);
      const { x, y } = geoXY(cx, cy, r, angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Tychonic orbit ring: a planet's true circular orbit is centered on the
  // Sun, not Earth, but toPx()/geoXY() work in Earth-centered polar
  // coordinates with a non-linear (sqrt) distance scale — so a geometrically
  // true circle around the Sun's current position does NOT project to a
  // circle in screen space. It has to be walked point-by-point: each sample
  // is "Sun's geocentric position + orbitRadiusAU in direction theta",
  // converted through the same Earth-distance/angle -> pixel pipeline the
  // trails and body dots already use, so a body's actual plotted position
  // always lands exactly on this ring.
  function drawTychonicRing(ctx, cx, cy, toPx, sunGeo, orbitRadiusAU, color, rotationOffset = 0) {
    const SEGMENTS = 72;
    ctx.beginPath();
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      const px = sunGeo.dx + orbitRadiusAU * Math.cos(theta);
      const py = sunGeo.dy + orbitRadiusAU * Math.sin(theta);
      const dist = Math.hypot(px, py);
      const angle = Math.atan2(py, px) + rotationOffset;
      const r = toPx(dist);
      const { x, y } = geoXY(cx, cy, r, angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawMonthRing(ctx, cx, cy, R) {
    ctx.save();
    ctx.strokeStyle = "#5a6290";
    ctx.fillStyle = "#8890b5";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    MONTH_TICK_ANGLES.forEach((angle, i) => {
      const p1 = geoXY(cx, cy, R - 10, angle);
      const p2 = geoXY(cx, cy, R, angle);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const l = geoXY(cx, cy, R - 20, angle);
      ctx.globalAlpha = 0.8;
      ctx.fillText(MONTH_NAMES[i], l.x, l.y);
    });
    ctx.restore();
  }

  const MOON_PIXEL_RADIUS_HELIO = 13;
  const MOON_PIXEL_RADIUS_GEO = 26;

  // ---------------------------------------------------------------------
  // Phase widget math. Uses the law-of-cosines-equivalent vector form of
  // the standard planetary phase angle (Sun-Object-Earth, vertex at the
  // object) — this is the same quantity that made Venus's phases the
  // historical argument against a strict geocentric model. The disk is
  // drawn at a fixed size (distance also affects apparent size in reality,
  // but mixing that into the same icon reads as an unrelated "zoom" rather
  // than the phase cycle, especially for outer planets where distance
  // swings with the synodic period while illumination barely moves).
  // ---------------------------------------------------------------------
  function computePhase(objPos, earthPos) {
    const toSun = { x: -objPos.x, y: -objPos.y };            // object -> Sun
    const toEarth = { x: earthPos.x - objPos.x, y: earthPos.y - objPos.y }; // object -> Earth
    const magSun = Math.hypot(toSun.x, toSun.y);
    const magEarth = Math.hypot(toEarth.x, toEarth.y);
    const cosAlpha = (magSun && magEarth)
      ? Math.max(-1, Math.min(1, (toSun.x * toEarth.x + toSun.y * toEarth.y) / (magSun * magEarth)))
      : 1;
    const k = (1 + cosAlpha) / 2; // illuminated fraction, 0=new, 1=full

    // Which side of the disk (as seen looking from Earth toward the
    // object) faces the Sun, so the crescent/gibbous bulge points the
    // right way and swings smoothly as the body orbits. This is an
    // internal, self-consistent convention (not tied to real sky
    // orientation) — the panels themselves already use a similar artificial
    // convention for GEO_ROTATION_OFFSET.
    const view = { x: objPos.x - earthPos.x, y: objPos.y - earthPos.y }; // Earth -> object
    const rightPerp = { x: -view.y, y: view.x };
    const litOnRight = (toSun.x * rightPerp.x + toSun.y * rightPerp.y) >= 0;

    return { k, litOnRight };
  }

  const PHASE_DARK = "#12162c";

  function drawPhaseDisk(ctx, size, k, litOnRight, litColor) {
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const r = size / 2 - 3;
    const kk = Math.max(0, Math.min(1, k));

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = PHASE_DARK;
    ctx.fill();

    if (kk <= 0.001) return; // new: nothing more to draw
    if (kk >= 0.999) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = litColor;
      ctx.fill();
      return;
    }

    // Classic phase-disk construction: a half-circle arc (the fully-lit
    // limb) joined to a half-ellipse (the terminator) back to the start —
    // the ellipse bulges the same side as the arc for a crescent (a thin
    // lune next to the limb) or the opposite side for a gibbous (extending
    // light past the center line into the far half).
    const rx = r * Math.abs(1 - 2 * kk);
    const gibbous = kk > 0.5;
    const ellipseAnticlockwise = gibbous ? !litOnRight : litOnRight;

    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !litOnRight);
    ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, ellipseAnticlockwise);
    ctx.closePath();
    ctx.fillStyle = litColor;
    ctx.fill();
  }

  function render(positions) {
    // positions: map key -> {x,y} heliocentric AU
    const earth = positions.earth;
    const moonAngle = rad(((MOON.L0 + (360 * ((state.simDate - J2000) / MS_PER_DAY)) / MOON.period) % 360 + 360) % 360);

    // ---------------- Heliocentric panel ----------------
    {
      const ctx = helioCtx;
      const size = helioSize;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;

      const shown = BODIES.filter(b => state.visible.has(b.key) && (b.key !== "earth" || state.visible.has("earth")));
      const distances = shown.map(b => b.a);
      const toPx = makeScale(size, distances);

      // orbit rings + planets
      shown.forEach(b => {
        const r = toPx(b.a);
        drawOrbitRing(ctx, cx, cy, r, b.color);
      });

      // The Sun is the fixed reference point of this panel, so it's always
      // shown here regardless of the checkbox — mirroring how Earth is
      // always shown at the center of the geocentric panel.
      drawBody(ctx, cx, cy, 10, SUN_COLOR, "Sun");

      shown.forEach(b => {
        const p = positions[b.key];
        const r = toPx(b.a);
        const angle = Math.atan2(p.y, p.x);
        const x = cx + r * Math.cos(angle);
        const y = cy - r * Math.sin(angle);
        drawBody(ctx, x, y, b.key === "earth" ? 6 : 4.5, b.color, b.name);

        if (b.key === "earth" && state.visible.has("moon")) {
          drawOrbitRing(ctx, x, y, MOON_PIXEL_RADIUS_HELIO, MOON.color);
          const mx = x + MOON_PIXEL_RADIUS_HELIO * Math.cos(moonAngle);
          const my = y - MOON_PIXEL_RADIUS_HELIO * Math.sin(moonAngle);
          drawBody(ctx, mx, my, 2.5, MOON.color, null);
        }
      });
    }

    // ---------------- Geocentric panel ----------------
    {
      const ctx = geoCtx;
      const size = geoSize;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;

      const others = BODIES.filter(b => b.key !== "earth" && state.visible.has(b.key));
      const geoOf = {};
      others.forEach(b => {
        const p = positions[b.key];
        geoOf[b.key] = { dx: p.x - earth.x, dy: p.y - earth.y };
      });
      const sunGeo = { dx: -earth.x, dy: -earth.y };

      // Use each body's worst-case geocentric distance (a + Earth's orbital
      // radius of 1 AU) rather than its live distance, so the scale stays
      // fixed and the whole track fits — no continuous zoom in/out as
      // bodies move closer to or farther from Earth over time.
      const distances = [1].concat(others.map(b => b.a + 1));
      const toPx = makeScale(size, distances, state.geoZoom);

      // Snapshot of the geometry used to draw trails this frame, so trail
      // hover hit-testing (below) can map cursor position -> AU distance ->
      // screen position the same way the trails themselves were drawn.
      lastGeoRender = { cx, cy, toPx, others };

      // Calendar ring: Jan sits at 12 o'clock, so the Sun's position below
      // reads directly as "roughly which month".
      drawMonthRing(ctx, cx, cy, size / 2 - 6);

      // Tychonic orbit structure: each visible planet's true orbit, drawn
      // centered on the Sun's current (geocentric) position rather than
      // Earth's. The planet dots below already use the real Earth-relative
      // position (positions[b.key] - earth), so they land exactly on these
      // rings — this overlay adds the "why" without changing where anything
      // is actually plotted.
      if (state.showTychonic) {
        others.forEach(b => {
          drawTychonicRing(ctx, cx, cy, toPx, sunGeo, b.a, b.color, GEO_ROTATION_OFFSET);
        });
      }

      // sample + draw trails first (under the bodies) — sampling keeps
      // running even while Tychonic rings hide the trails, so toggling back
      // off picks up right where the trail actually is, nothing lost.
      others.forEach(b => {
        maybeSampleTrail(b.key, trailSampleThresholdDays(b), geoOf[b.key].dx, geoOf[b.key].dy, state.simDate);
        if (!state.showTychonic) drawTrail(ctx, cx, cy, trails[b.key], toPx, b.color, GEO_ROTATION_OFFSET);
      });

      // Earth glyph fixed at center
      drawBody(ctx, cx, cy, 8, BODY_BY_KEY.earth.color, "Earth");

      if (state.visible.has("sun")) {
        // Sun traces a perfect circle in the geocentric frame (radius 1 AU)
        drawOrbitRing(ctx, cx, cy, toPx(1), SUN_COLOR);

        const dist = 1;
        const angle = Math.atan2(sunGeo.dy, sunGeo.dx) + GEO_ROTATION_OFFSET;
        const r = toPx(dist);
        const { x, y } = geoXY(cx, cy, r, angle);
        drawBody(ctx, x, y, 8, SUN_COLOR, "Sun");
      }

      others.forEach(b => {
        const g = geoOf[b.key];
        const dist = Math.hypot(g.dx, g.dy);
        const angle = Math.atan2(g.dy, g.dx) + GEO_ROTATION_OFFSET;
        const r = toPx(dist);
        const { x, y } = geoXY(cx, cy, r, angle);
        drawBody(ctx, x, y, 4.5, b.color, b.name);
      });

      if (state.visible.has("moon")) {
        drawOrbitRing(ctx, cx, cy, MOON_PIXEL_RADIUS_GEO, MOON.color);
        const m = geoXY(cx, cy, MOON_PIXEL_RADIUS_GEO, moonAngle);
        drawBody(ctx, m.x, m.y, 3, MOON.color, "Moon");
      }
    }

    // ---------------- Phase widget ----------------
    {
      const bodyKey = state.phaseBody;
      const bodyColor = bodyKey === "moon" ? MOON.color : BODY_BY_KEY[bodyKey].color;
      const objPos = bodyKey === "moon"
        ? { x: earth.x + MOON.a * Math.cos(moonAngle), y: earth.y + MOON.a * Math.sin(moonAngle) }
        : positions[bodyKey];
      const { k, litOnRight } = computePhase(objPos, earth);
      // Whether there was a real previous sample to compare against — the
      // `k >= 0.5` fallback below (used when there wasn't, e.g. the very
      // first frame ever rendered) answers "which half of the cycle is
      // this", not "is illumination rising or falling right now". Those
      // only agree away from the extremes; right at a 0%/100% extreme
      // (e.g. a phase-skip run started there) it can disagree with the
      // real trend, so it must never be trusted as a phaseRun baseline —
      // see the hadRealPrevK check below.
      const hadRealPrevK = prevPhaseK !== null;
      const waxing = hadRealPrevK ? k >= prevPhaseK : k >= 0.5;
      prevPhaseK = k;
      drawPhaseDisk(phaseCtx, phaseSize, k, litOnRight, bodyColor);
      phaseReadoutEl.textContent = `${Math.round(k * 100)}% lit · ${waxing ? "waxing" : "waning"}`;

      if (state.phaseRun.active) {
        if (state.phaseRun.baselineWaxing === null) {
          // Only commit a baseline once `waxing` reflects a real
          // two-sample trend (see hadRealPrevK above) — otherwise wait for
          // the next frame rather than risk locking in a wrong baseline.
          if (hadRealPrevK) state.phaseRun.baselineWaxing = waxing;
        } else if (waxing !== state.phaseRun.baselineWaxing) {
          // Trend just flipped — reached the extreme (full or new/minimum)
          // right after the one that was current when we started.
          state.phaseRun.active = false;
          state.playing = false;
          // Roll back to whatever speed was active before this skip sped
          // things up — see the "only speed up, never slow down" comment
          // in the click handler above.
          state.speed = state.phaseRun.speedBeforeRun;
          updatePlayPauseButton();
          updateSpeedLabel();
          updatePhaseSkipAvailability();
          // Bake the reached date into the URL and drop the one-shot
          // ?autoskip= flag — otherwise a reload (or an address-bar copy,
          // as opposed to "Copy link") would still show the original start
          // date and immediately re-run the whole fast-forward instead of
          // landing on this paused extreme.
          dateInput.value = toISODateInput(state.simDate);
          syncUrlParams({ date: toISODateInput(state.simDate), playing: "false", autoskip: null, speed: String(state.speed) });
        }
      }
    }
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // ---------------------------------------------------------------------
  // Trail hover tooltip (geocentric panel): find the sampled trail point
  // nearest the cursor and show which planet was there and when. A body's
  // geocentric loop retraces roughly the same screen position once per
  // synodic period, so several sampled dates can sit under the cursor at
  // once — among those, show the most recent (latest) date.
  // ---------------------------------------------------------------------
  const geoTooltip = document.getElementById("geoTooltip");
  const geoPanelBody = geoCanvas.closest(".panel-body");
  const TRAIL_HOVER_RADIUS_PX = 9;

  function formatTrailDate(d) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function findHoveredTrailPoint(mx, my) {
    if (!lastGeoRender) return null;
    const { cx, cy, toPx, others } = lastGeoRender;
    const radius2 = TRAIL_HOVER_RADIUS_PX * TRAIL_HOVER_RADIUS_PX;
    let best = null; // { name, date, dist2 }
    others.forEach(b => {
      const points = trails[b.key];
      for (const p of points) {
        const dist = Math.hypot(p.dx, p.dy);
        const angle = Math.atan2(p.dy, p.dx) + GEO_ROTATION_OFFSET;
        const r = toPx(dist);
        const { x, y } = geoXY(cx, cy, r, angle);
        const dx = x - mx, dy = y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 > radius2) continue;
        // Within hit radius: prefer the latest date, breaking ties on
        // screen-distance so an exact cursor position still wins on
        // closeness when dates are equal.
        if (!best || p.date > best.date || (p.date.getTime() === best.date.getTime() && d2 < best.dist2)) {
          best = { name: b.name, date: p.date, dist2: d2 };
        }
      }
    });
    return best;
  }

  function hideGeoTooltip() {
    geoTooltip.hidden = true;
  }

  geoCanvas.addEventListener("mousemove", (e) => {
    const rect = geoCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = findHoveredTrailPoint(mx, my);
    if (!hit) {
      hideGeoTooltip();
      return;
    }
    const bodyRect = geoPanelBody.getBoundingClientRect();
    geoTooltip.style.left = `${e.clientX - bodyRect.left}px`;
    geoTooltip.style.top = `${e.clientY - bodyRect.top}px`;
    geoTooltip.innerHTML = `<span class="tip-planet">${hit.name}</span><br>${formatTrailDate(hit.date)}`;
    geoTooltip.hidden = false;
  });

  geoCanvas.addEventListener("mouseleave", hideGeoTooltip);

  // ---------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------
  let lastTs = null;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    const dtSeconds = Math.min(0.25, (ts - lastTs) / 1000);
    lastTs = ts;

    if (state.playing) {
      const prevSimDate = state.simDate;
      state.simDate = new Date(state.simDate.getTime() + state.speed * dtSeconds * MS_PER_DAY);
      sampleTrailsAlong(prevSimDate, state.simDate);
    }

    if (state.run.target !== null && !state.run.completed) {
      const elapsedYears = (state.simDate - state.run.startDate) / MS_PER_DAY / DAYS_PER_YEAR;
      if (Math.abs(elapsedYears) >= state.run.target) {
        const sign = elapsedYears < 0 ? -1 : 1;
        state.simDate = new Date(state.run.startDate.getTime() + sign * state.run.target * DAYS_PER_YEAR * MS_PER_DAY);
        state.run.completed = true;
        state.playing = false;
        updatePlayPauseButton();
        runStatus.textContent = `Done: ${state.run.target}y`;
      } else {
        runStatus.textContent = `${Math.abs(elapsedYears).toFixed(1)} / ${state.run.target}y`;
      }
    }

    const positions = {};
    BODIES.forEach(b => { positions[b.key] = heliocentricPos(b, state.simDate); });

    render(positions);
    dateLabel.textContent = formatDate(state.simDate);
    updateTrailAgeLabel();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
