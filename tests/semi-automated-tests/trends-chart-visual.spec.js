// @ts-check
// Semi-automated visual check for the Trends chart: the setup (saving a
// few sessions) is automated, but a human confirms the chart actually
// *looks* right — same rationale as ../donut-chart-visual.spec.js (a
// human eyeballing a canvas once in a while beats brittle pixel-diffing).
//
// Run with: npm run test:semi (always headed, one at a time, no rush).
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { ServeTrackerManipulator } = require('../serve-tracker-manipulator');
const { askHuman } = require('./human-prompt');

const APP_PATH = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
const PAGE_URL = process.env.PAGE_URL || APP_PATH;

const SCREENSHOT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

test.describe('trends chart — visual check', () => {
  test('3 sessions render as rising 1st-serve / falling 2nd-serve / falling fault lines', async ({ page }) => {
    const app = new ServeTrackerManipulator(page);
    await app.open(PAGE_URL);
    await app.resetAllData();
    await app.switchLanguageTo('en'); // keep the app UI in English during the check,
                                       // consistent with the English question/buttons below —
                                       // otherwise this defaults to French for every dev,
                                       // since resetAllData() clears the saved preference.

    // Oldest session: 25% / 25% / 50%
    await app.registerSuccessfulFirstServes(1);
    await app.registerSuccessfulSecondServes(1);
    await app.registerDoubleFaults(2);
    await app.endSessionAndSave('Session 1');

    // Middle session: 50% / 25% / 25%
    await app.registerSuccessfulFirstServes(2);
    await app.registerSuccessfulSecondServes(1);
    await app.registerDoubleFaults(1);
    await app.endSessionAndSave('Session 2');

    // Newest session: 100% / 0% / 0%
    await app.registerSuccessfulFirstServes(4);
    await app.endSessionAndSave('Session 3');

    await app.openHistory();
    await app.viewTrends();

    const screenshotPath = path.join(SCREENSHOT_DIR, 'trends-rising-first-serve.png');
    await page.locator('#evo-chart').screenshot({ path: screenshotPath });

    const question =
      'Expected: Trends chart, 3 points left (oldest) to right (newest):\n' +
      '1st serve (green): 25% -> 50% -> 100%\n' +
      '2nd serve (yellow): 25% -> 25% -> 0%\n' +
      'Double fault (red): 50% -> 25% -> 0%\n' +
      'Does the chart above match this?';

    const result = await askHuman(page, question);
    const failureMessage = result.comment
      ? '\n' +
        '='.repeat(60) + '\n' +
        'HUMAN REJECTED THIS CHART\n' +
        `Comment: "${result.comment}"\n` +
        '='.repeat(60) + '\n'
      : 'a human confirmed the rendered chart matches the expected description';
    expect(result.passed, failureMessage).toBe(true);
  });
});
