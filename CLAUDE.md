<!--
  For human readers. 
  
  This is a file of general instructions for Claude AI coding agent.
  

  Keep this file SHORT. It's a current-state reference, not a log.
  - Update a bullet in place when something changes; don't append a new
    section describing the same area of the app twice.
  - If a decision needs real rationale/history, put it in
    decisions/NNNN-slug.md (create the decisions/ folder if needed) and
    link it here in one line — don't paste the reasoning into this file.
  - Prune anything no longer true (a fixed gotcha, an outdated
    convention) rather than leaving it to accumulate.

  Language:
  - The app should be coded in English. This includes the default prompts that appear in the UI, comments, design documents, etc... 
  - Some devs (the initial creator in particular) may talk to you in other languages. But assume that they all are fluent in English, and that in the context of this project, they do all their coding in English.
-->

# Serve Tracker — project context for Claude Code

Single-file HTML/JS PWA for tennis serve practice tracking (1st serve in /
2nd serve in / double fault), with a donut chart, session history, a
trends chart, French/English UI, export/import backup. Hosted on GitHub
Pages: https://alaindesilets.github.io/serve-tracker/

## Architecture

- `index.html` — the whole app (HTML/CSS/vanilla JS, no build step,
  no framework). Must keep working by just opening the file.
- `icon.png`, `manifest.json` — plain files, not inlined base64.
- `tests/` — Playwright, two projects, each in its own subfolder:
  `automated` (`npm test`, lives in `tests/fully-automated-tests/`) and
  `semi-automated` (`npm run test:semi`, opens a browser, asks a human
  to confirm a chart visually — see `tests/semi-automated-tests/`).

## Conventions

- Chart rendering is split model/view: `getChartSegments()` /
  `getEvolutionSeries()` in `index.html` are pure (no Canvas) and are
  what gets unit-tested; `drawChart()` / `renderEvolutionChart()` only
  paint their output.
- Test helper class is `ServeTrackerManipulator`, not "Page Object" —
  tests never touch a selector directly, only manipulator methods
  (`app.registerSuccessfulFirstServes(2)`, `app.expectSegmentsToBe(...)`).
  Assertion helpers live on the manipulator too, not as free functions.
- Test-first: tests are written by the project owner, before the
  implementation, on purpose — never let an AI write both the code and
  the test that validates it. Don't modify an existing test to make it
  pass without flagging that explicitly first.
- All dev-facing text (comments, test names, semi-automated test
  prompts) is in English, regardless of the app's own UI language
  (which defaults to French).

## Testing modes

Three ways to run the test suite:
- `npm test` — automated only. Fast, headless, no human needed. Safe
  to run unattended, including right before a commit.
- `npm run test:semi` — semi-automated only. Opens a real, visible
  browser and asks a human to confirm charts render correctly via
  on-page Yes/No buttons. Only meaningful with a human present and
  watching — never click those buttons yourself, and never assume the
  result without the human confirming what happened.
- `npm run test:all` — runs both, one after the other.

Before creating a commit, ask which of the three (or none) the human
wants run — don't default to just `npm test` without asking.

## Gotchas

- `URL.revokeObjectURL()` right after a download click can cancel it —
  the export code defers cleanup with `setTimeout`.
- `window.alert()` blocks the page's JS thread — avoid firing one right
  after starting a download.
- A WebKit test failing only against `file://` (not against the
  deployed HTTPS site) is a known `file://` quirk, not a real bug.

## History

Git history gets squashed periodically (soft-reset + force-push) to
stay readable — fine to keep doing that before pushing a session with
a lot of trial and error.
