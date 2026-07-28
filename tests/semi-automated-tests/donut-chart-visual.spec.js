// @ts-check
// Semi-automated visual checks: the setup (recording serves) is
// automated, but a human confirms the chart actually *looks* right —
// something the fully-automated model tests (see ../serve-tracker.spec.js)
// deliberately don't check, since pixel-diffing a canvas is brittle
// across machines/browser versions. A human eyeballing it once in a
// while is a much cheaper, more reliable check for "does this render
// correctly", while the model tests keep catching regressions in the math
// on every run without needing anyone to look at anything.
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

// A PNG here (same basename as the screenshot below) is shown next to the
// question as a reference. Click it (or the empty placeholder) in the
// browser prompt to set/replace it from your own machine.
const EXPECTED_DIR = path.join(__dirname, 'expected');

test.describe('donut chart — visual check', () => {
  test('2 first / 1 second / 1 fault renders as 50% / 25% / 25%, green/yellow/red from the top', async ({ page }) => {
    const app = new ServeTrackerManipulator(page);
    await app.open(PAGE_URL);
    await app.resetAllData();
    await app.switchLanguageTo('en'); // keep the app UI in English during the check,
                                       // consistent with the English question/buttons below —
                                       // otherwise this defaults to French for every dev,
                                       // since resetAllData() clears the saved preference.

    await app.registerSuccessfulFirstServes(2);
    await app.registerSuccessfulSecondServes(1);
    await app.registerDoubleFaults(1);

    const screenshotPath = path.join(SCREENSHOT_DIR, 'donut-50-25-25.png');
    await page.locator('#chart').screenshot({ path: screenshotPath });

    const question =
      "Expected: donut chart, 12 o'clock, clockwise:\n" +
      '1st serve: 50% (green)   2nd serve: 25% (yellow)   Double fault: 25% (red)\n' +
      'Does the chart above match this?';

    const referenceImagePath = path.join(EXPECTED_DIR, 'donut-50-25-25.png');
    const result = await askHuman(page, question, referenceImagePath);
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
