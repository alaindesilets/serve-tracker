// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Config lives in tests/ alongside the spec files, so testDir is just '.'.
// Run it from the project root with:
//   npx playwright test --config=tests/playwright.config.js
// (the npm scripts in package.json already do this for you)
module.exports = defineConfig({
  testDir: '.',
  fullyParallel: false,     // each test toggles localStorage/IndexedDB — keep sequential
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
