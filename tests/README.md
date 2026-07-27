# Serve Tracker — automated tests

End-to-end tests written with [Playwright](https://playwright.dev), driving
a real Chromium against `index.html` directly (no server needed).

## Setup (once)

From the project root (`~/Documents/serve-tracker`):

```
npm install
npx playwright install chromium
```

The second command downloads a real Chromium build (~150 MB) — it needs
an unrestricted internet connection.

## Running

```
npx playwright test
```

Useful variants:
- `npx playwright test --headed` — watch the browser while it runs
- `npx playwright test --ui` — interactive test runner, great for debugging
- `PAGE_URL=https://alaindesilets.github.io/serve-tracker/ npx playwright test`
  — run the same suite against the live deployed site instead of the
  local file

## What's covered

- Initial state (all counters at zero)
- Tapping each button increments its counter and the percentages
- State survives a page reload (localStorage)
- Reset flow: cancelling the save prompt vs. confirming it with a name
- Reset is a no-op (no prompt at all) when the session is empty
- History: deleting a session, the Trends tab rendering
- Export (triggers a real file download) and Import (restores state
  from a fixture file)
- Language switching (button labels, persistence across reload)
- Help panel opening/closing

## Not covered (and why)

- **The linked backup file (File System Access API)** — this API needs a
  real user gesture tied to a native OS file picker, which Playwright
  can't drive directly. Worth testing by hand occasionally.
- **Visual appearance of the donut/trend charts** — the tests check that
  the canvas exists and the panel opens, not the pixels drawn on it.
  Playwright supports screenshot comparison (`toHaveScreenshot()`) if you
  want to add that later.
- **The icon/manifest** — those matter for Android's install behavior,
  which isn't something a desktop Chromium run can verify. Worth a manual
  check on your phone after any manifest change.

## A note on how these were written

I (Claude) could not actually execute this suite in the sandbox I write
code in — it can't download the Chromium browser Playwright needs, since
its network access is limited to a short allow-list of package registries.
I've reasoned through the app's code carefully and every selector here
matches an id/class that exists in `index.html`, but please run it once
yourself before trusting it — if anything fails, it's most likely an
async-timing issue (a dialog firing before the click that's supposed to
precede it) rather than a real bug in the app.
