# Build Log

A per-prompt record of the session that took this project from a plain
heliocentric/geocentric simulator to what's deployed at
[sansword.github.io/sans_geometry](https://sansword.github.io/sans_geometry/).
Referenced from [`devlog.md`](devlog.md) and the main
[README](../README.md).

Claude Code doesn't expose exact token counts per individual prompt — the
figures below are the session-level totals as reported by the user from
their own usage view, plus a qualitative "relative cost" per prompt based
on how much tool-calling (file edits, browser automation, deploys) it
took.

**Session totals:**

| Model | Session usage | Real time | Prompts |
|-------|---------------|-----------|---------|
| Claude Sonnet 5 | ~49% of the 5-hour session limit | ~2 hours | 14 |

## Prompt-by-prompt

| # | Prompt (paraphrased) | What happened | Relative cost |
|---|---|---|---|
| 1 | Read the *Orb: On the Movements of the Earth* Wikipedia page; find one astronomical phenomenon per part that the simulator could demonstrate | Fetched the article, broke it down by part, matched Part Two's Mars retrograde motion to the app's existing retrograde-trail feature | medium |
| 2 | Add a Mars retrograde demo button, plus an `index.html#demo` hash that redirects to the preset URL | Added a `DEMOS` registry and hash-redirect in `script.js`, a button in `index.html`; verified in a real browser and found/fixed a pre-existing `?years=` on-load bug (`ReferenceError` from a TDZ violation) that was silently blanking both canvases | heavy |
| 3 | Change the demo to zoom 85%, date 1944-03-31, run 2 years | Edited the `DEMOS` preset object | light |
| 4 | Set demo speed to 128 | Edited the preset | light |
| 5 | Remove `years` from the preset | Edited the preset | light |
| 6 | Set demo to `date=1433-10-10&zoom=0.85&speed=128&years=2.5` | Edited the preset | light |
| 7 | Remove `years` again | Edited the preset | light |
| 8 | Rename the folder to `sans_geometry`, create a GitHub repo, deploy to GitHub Pages | Confirmed repo visibility with the user, `git init`/commit, `gh repo create --public --push`, enabled Pages via the GitHub API, polled the build until live | heavy |
| 9 | Add GitHub and Wiki links to the page | Added header nav links + CSS, verified in browser, committed and pushed | medium |
| 10 | Fix the header links jumping left/right as the date readout changes length | Diagnosed a `justify-content: space-between` flex issue, grouped title + nav into one wrapper, verified, committed and pushed | medium |
| 11 | Design a favicon: Earth dot at center, Mars retrograde track around it, sized appropriately | Iterated through several curve designs (limaçon, hypotrochoid, two overlapping circles), rendered actual 16×16/32×32 PNGs with `rsvg-convert` to judge real legibility, shipped `favicon.svg` + a packed `favicon.ico` | heavy |
| 12 | Would sharing the link on Threads show a preview image? | Explained that Open Graph meta tags were missing, so no — no file changes yet | light |
| 13 | Take the OG preview screenshot from the specific demo URL, after its 2.5-year run finishes | Navigated to that exact state, waited for "Done: 2.5y", captured and cropped/resized the screenshot to 1200×630, added Open Graph / Twitter Card meta tags, committed and pushed | heavy |
| 14 | Add the GitHub Pages `#demo` link to the README, session cost/build stats, and this build log | This entry, plus the devlog entry and README updates | medium |
