<!--
  For human readers. 
  
  This is a file of general instructions for Claude AI coding agent.

  But it also contains some useful information for human contributors to the project (ex: coding and design guidelines)
  

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

# Purpose of this app

The purpose of this app is to help a tennis player keep track of his or her serve percentages (1st serve in / 2nd serve in / double fault), and to visualise progress. 

You can try it on github Pages: https://alaindesilets.github.io/serve-tracker/

## Technical constraints

- We want the app to be able to run on Android or iPhone, as well as on a computer (Mac, Windows, Linux)

## Architecture

- Static HTML page with JS, packaged as an installable, offline-capable PWA (Progressive Web App)
  - This makes it easy to deploy on computer or phone.
  - To deploy on phone, point Chrome or Safari to the github Pages url (see top of this document), and click: Install and create a shortcut > Install (this is for Chrome. Not sure what it is for Safari)
- `index.html` — the whole app (HTML/CSS/vanilla JS, no build step,
  no framework). Must keep working by just opening the file.
- `icon.png`, `manifest.json` — plain files, not inlined base64.
- `service-worker.js` — service worker, registered by `AppUpdater` in `index.html`. Caches
  the app shell (`index.html`/`manifest.json`/`icon.png`, not Google Fonts —
  see the comment at the top of the file for why) so the app can still launch
  without a successful network fetch. This is what makes "installing" the app
  actually work offline, instead of just being a shortcut that reloads over
  the network every time. Doesn't run over `file://` or on browsers without
  the API — silently no-ops there, same as before it existed. Not exercised
  by any test (service workers need a secure context, and the automated
  suite runs over `file://`) — verify manually on the deployed site after
  touching it.
- We use the browser's built-in storage as a simple, zero-backend persistence layer: localStorage holds the app data as plain JSON (tallies, history, language, last export date); IndexedDB just stashes a FileSystemFileHandle so repeat backups can write to the same file without re-prompting.
- `tests/` — Playwright, two projects, each in its own subfolder:
  - `fully-automated`: Tests that can be run in fully autonomous fashion (`npm test`, live in `tests/fully-automated-tests/`) and
  - `semi-automated`: Tests where the system may need to pause to ask the human to verify something that is hard or impossible for the machine to verify (`npm run test:semi`, live in `tests/semi-automated-tests/`).

## Design and Coding Guidelines

### Use MVC as much as possible

As much as possible, separate the business logic from the visual appearance of the page.

For example:

- Chart rendering is split model/view: `DonutChart.computeSegments()` /
  `EvolutionPane.computeSeries()` in `index.html` are pure (no Canvas) and
  are what gets unit-tested; `DonutChart.render()` / `EvolutionPane.render()`
  only paint their output.
- When a cluster of functions/constants all reference the same concept
  (e.g. everything about the Trends tab, or everything about persistence),
  that naming pattern itself is a signal to extract a class named after
  that concept — see `DataStore`, `DonutChart`, `EvolutionPane`.

### Use Page Manipulators when writing tests

- When writing tests, avoid explicitly refering to the HTML elements. Instead, implement a Page Manipulator class, and implement helper methods that allow the tests to manipulate the page, and check some things about its current state.
  - See class ServeTrackerManipulator for an example.
  - Note how we call this a Page Manipulator instead of the more standard Page Object. We find Page Object sounds too much like the model in a MVC pattern (and this is not the same thing)
- Test-first: tests are written by the project owner, before the
  implementation, on purpose — never let an AI write both the code and
  the test that validates it. Don't modify an existing test to make it
  pass without flagging that explicitly first.

### English is the coding language  
- All dev-facing text (comments, test names, semi-automated test
  prompts) is in English, regardless of the app's own UI language
  (which defaults to French).
- Some developers may chose to speak to Claude in other languages (ex: French), but their instructions are to be carried out in the form of code, comments and documentation written in English.

### Comments versus proper naming

- Use comments sparingly. 
- If you feel the need to write a comment to explain the purpose of a method, function, attribute, variable, see if changing the name might not achieve the same clarity.
- If you feel the need to write a comment to explain a section of a function/method, see if you can achieve the same clarity by turning that section into a function/method, and giving it a clear name.
- Appropriate use of comments
  - Put a comment at the top of each package, file, class (compulsory)
  - If a section of a function/method does something that is not clear, and it is difficult to clarify that section by turning it into a properly named function/method, then by all means, write a comment.
  - If there is something non-obvious about the rationale for why a particular section is written the way it is, then by all means, write a comment.
  - In HTML files. There is no clean way to give a clear "name" to a section of HTML code. So by all means, use comments there, to clarify what the different sections correspond to and what they are used for.

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

## Git History

Git history gets squashed periodically (soft-reset + force-push) to
stay readable — fine to keep doing that before pushing a session with
a lot of trial and error.

## How to behave towards human devs

- Don't be a sycophant. If you disagree with a decision being taken by a human dev, say so.
- But stay diplomatic.
- And in the end, the human has the final word.
