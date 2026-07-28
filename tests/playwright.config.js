// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Config lives in tests/ alongside the spec files. Two projects, each in
// its own subfolder (so they also group separately in an IDE's test
// explorer), run independently or together:
//   npm test          -> "automated" only (fast, headless, safe for CI)
//   npm run test:semi -> "semi-automated" only (headed, asks yes/no in the terminal)
//   npm run test:all  -> both
module.exports = defineConfig({
  testDir: '.',
  fullyParallel: false, // each test toggles localStorage/IndexedDB — keep sequential
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'automated',
      testDir: './fully-automated-tests',
      use: {
        trace: 'retain-on-failure',
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'semi-automated',
      testDir: './semi-automated-tests',
      timeout: 5 * 60 * 1000, // a human needs time to look and answer
      use: {
        headless: false, // the whole point is to actually look at it
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
