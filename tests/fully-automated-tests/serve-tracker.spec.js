// @ts-check
// Fully-automated tests: everything here runs headless with no human
// involved (`npm test`). 
// 
// Tests that require visual confirmation by a human tester live 
// separately in ../semi-automated-tests/.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ServeTrackerManipulator } = require('../serve-tracker-manipulator');

const APP_PATH = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
const PAGE_URL = process.env.PAGE_URL || APP_PATH;

/** @type {ServeTrackerManipulator} */
let app;

test.beforeEach(async ({ page }) => {
  app = new ServeTrackerManipulator(page);
  await app.open(PAGE_URL);
  await app.resetAllData(); // always start from zero counters, empty history
});

test.describe('initial state', () => {
  test('loads with all counters at zero', async () => {
    await app.expectCountsToBe({});
  });
});

test.describe('recording serves', () => {
  test('each outcome increments its own counter and the total', async () => {
    await app.registerSuccessfulFirstServes(1);
    await app.expectCountsToBe({ first: 1 });

    await app.registerSuccessfulSecondServes(1);
    await app.registerDoubleFaults(1);
    await app.expectCountsToBe({ first: 1, second: 1, fault: 1 });
  });

  test('percentages reflect the split between the three outcomes', async () => {
    // 2 first-serve-in, 1 second-serve-in, 1 double-fault -> 50/25/25
    await app.registerServes({ first: 2, second: 1, fault: 1 });

    expect(await app.getFirstServePercentage()).toBe(50);
    expect(await app.getSecondServePercentage()).toBe(25);
    expect(await app.getDoubleFaultPercentage()).toBe(25);
  });

  test('counts survive a page reload', async () => {
    await app.registerServes({ first: 1, fault: 1 });
    await app.reload();
    expect(await app.getTotalPoints()).toBe(2);
  });
});

test.describe('donut chart model', () => {
  test('an empty session has no segments', async () => {
    const { totalPoints, segments } = await app.computeChartSegmentsFor({ first: 0, second: 0, fault: 0 });
    expect(totalPoints).toBe(0);
    expect(segments).toEqual([]);
  });

  test('each segment gets the right percentage, color, and key', async () => {
    // 2 first-serve-in, 1 second-serve-in, 1 double-fault -> 50/25/25
    await app.expectSegmentsToBe([
      { key: 'first', value: 2, percentage: 50 },
      { key: 'second', value: 1, percentage: 25 },
      { key: 'fault', value: 1, percentage: 25 },
    ]);

    // colors should still be distinct from one another
    const { segments } = await app.computeChartSegmentsFor({ first: 2, second: 1, fault: 1 });
    expect(new Set(segments.map(s => s.color)).size).toBe(3);
  });

  test('a zero-count outcome is skipped entirely, not drawn as an empty slice', async () => {
    await app.expectSegmentsToBe([
      { key: 'first', value: 3, percentage: 75 },
      { key: 'fault', value: 1, percentage: 25 },
    ]);
  });

  test('segments are contiguous and sweep exactly a full circle', async () => {
    const { segments } = await app.computeChartSegmentsFor({ first: 5, second: 3, fault: 2 });

    // starts at 12 o'clock
    expect(segments[0].startAngleRadians).toBeCloseTo(-Math.PI / 2, 5);

    // each segment picks up exactly where the previous one ended
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startAngleRadians).toBeCloseTo(segments[i - 1].endAngleRadians, 5);
    }

    // the whole ring sweeps exactly 360 degrees (2*PI), no gaps or overlap
    const totalSweep = segments.reduce((sum, s) => sum + (s.endAngleRadians - s.startAngleRadians), 0);
    expect(totalSweep).toBeCloseTo(Math.PI * 2, 5);
  });

  test('reflects whatever is actually on screen after tapping buttons', async () => {
    await app.registerServes({ first: 1, fault: 1 });

    const { totalPoints, segments } = await app.getCurrentChartSegments();
    expect(totalPoints).toBe(2);
    expect(segments.map(s => s.key)).toEqual(['first', 'fault']);
    expect(segments.map(s => s.percentage)).toEqual([50, 50]);
  });
});

test.describe('ending a practice session', () => {
  test('declining to save still clears the counters, and keeps no record', async () => {
    await app.registerServes({ first: 1, fault: 1 });

    await app.endSessionWithoutSaving();
    expect(await app.getTotalPoints()).toBe(0);

    await app.openHistory();
    expect(await app.hasNoSavedSessions()).toBe(true);
  });

  test('saving archives the session under the given name', async () => {
    await app.registerServes({ first: 1, second: 1 });

    await app.endSessionAndSave('Practice A');
    expect(await app.getTotalPoints()).toBe(0); // counters cleared either way

    await app.openHistory();
    expect(await app.hasSavedSession('Practice A')).toBe(true);
  });

  test('an empty session resets silently, with no save prompt at all', async () => {
    const promptAppeared = await app.endSessionAndCheckIfPromptAppeared();
    expect(promptAppeared).toBe(false);
  });
});

test.describe('session history', () => {
  test('deleting a saved session removes it from the list', async () => {
    await app.registerSuccessfulFirstServes(1);
    await app.endSessionAndSave('To delete');

    await app.openHistory();
    expect(await app.hasSavedSession('To delete')).toBe(true);

    await app.deleteSavedSession('To delete');
    expect(await app.hasNoSavedSessions()).toBe(true);
  });

  test('the Trends tab renders a chart once there is history', async () => {
    await app.registerSuccessfulFirstServes(1);
    await app.endSessionAndSave('Session 1');

    await app.openHistory();
    await app.viewTrends();
    expect(await app.isTrendsChartVisible()).toBe(true);
  });

  test('opening and closing History does not lose the in-progress session', async () => {
    await app.registerServes({ first: 2, second: 1, fault: 1 });

    await app.openHistory();
    await app.closeHistory();

    await app.expectCountsToBe({ first: 2, second: 1, fault: 1 });

    await app.endSessionAndSave('Checked session');

    await app.openHistory();
    expect(await app.getSavedSessionStats('Checked session')).toEqual({
      total: 4,
      firstPercentage: 50,
      secondPercentage: 25,
      faultPercentage: 25,
    });
  });

  test('each saved session displays its own stats, not mixed up with another', async () => {
    await app.registerServes({ first: 3, fault: 1 });
    await app.endSessionAndSave('Session A');

    await app.registerServes({ second: 1, fault: 1 });
    await app.endSessionAndSave('Session B');

    await app.openHistory();

    expect(await app.getSavedSessionStats('Session A')).toEqual({
      total: 4,
      firstPercentage: 75,
      secondPercentage: 0,
      faultPercentage: 25,
    });

    expect(await app.getSavedSessionStats('Session B')).toEqual({
      total: 2,
      firstPercentage: 0,
      secondPercentage: 50,
      faultPercentage: 50,
    });
  });

  test('Clear All, once confirmed, deletes every saved session', async () => {
    await app.registerServes({ first: 1 });
    await app.endSessionAndSave('Session A');

    await app.registerServes({ second: 1 });
    await app.endSessionAndSave('Session B');

    await app.openHistory();
    expect(await app.getSavedSessionNames()).toEqual(['Session B', 'Session A']);

    await app.clearAllHistory();

    expect(await app.hasNoSavedSessions()).toBe(true);
  });

  test('Clear All, if cancelled, leaves the saved history untouched', async () => {
    await app.registerServes({ first: 1 });
    await app.endSessionAndSave('Session A');

    await app.registerServes({ second: 1 });
    await app.endSessionAndSave('Session B');

    await app.openHistory();
    expect(await app.getSavedSessionNames()).toEqual(['Session B', 'Session A']);

    await app.clearAllHistoryButCancel();

    expect(await app.getSavedSessionNames()).toEqual(['Session B', 'Session A']);
  });
});

test.describe('trends chart model', () => {
  test('an empty history has no sessions and no points', async () => {
    const { sessionCount, series } = await app.computeEvolutionSeriesFor([]);
    expect(sessionCount).toBe(0);
    series.forEach((s) => expect(s.points).toEqual([]));
  });

  test('one series per outcome, in the same order every time', async () => {
    const { series } = await app.computeEvolutionSeriesFor([
      { name: 'A', date: new Date().toISOString(), first: 1, second: 0, fault: 0 },
    ]);
    expect(series.map((s) => s.key)).toEqual(['first', 'second', 'fault']);
  });

  test('sessions are read oldest-to-newest, even though history is stored newest-first', async () => {
    // History is stored newest-first (unshift), so entry [0] here is the
    // most recent session — the model must reverse it back to chronological
    // order before turning it into chart points.
    const historyNewestFirst = [
      { name: 'Most recent',  date: new Date().toISOString(), first: 4, second: 0, fault: 0 }, // 100%
      { name: 'Oldest',       date: new Date().toISOString(), first: 1, second: 0, fault: 1 }, // 50%
    ];

    await app.expectEvolutionSeriesToBe(historyNewestFirst, {
      first: [50, 100], // oldest session first, then the most recent
    });
  });

  test('each session\'s percentage is relative to its own total, not the others', async () => {
    const historyNewestFirst = [
      { name: 'Small session', date: new Date().toISOString(), first: 1, second: 0, fault: 1 }, // 50%
      { name: 'Big session',   date: new Date().toISOString(), first: 8, second: 0, fault: 2 }, // 80%
    ];

    await app.expectEvolutionSeriesToBe(historyNewestFirst, {
      first: [80, 50], // chronological: "Big session" first, then "Small session"
    });
  });

  test('reflects real saved sessions, oldest to newest', async () => {
    await app.registerSuccessfulFirstServes(1);
    await app.endSessionAndSave('AAA First saved');

    await app.registerServes({ first: 1, fault: 1 });
    await app.endSessionAndSave('BBB Second saved');

    await app.openHistory();
    const list = await app.getSavedSessionNames(); // sanity: both are there

    // Notice how the sessions appear most recent first, eventhough the alphabetical 
    // order would be the other way around
    expect(list).toEqual(['BBB Second saved', 'AAA First saved']);

    const { sessionCount } = await app.getCurrentEvolutionSeries();
    expect(sessionCount).toBe(2);
  });
});

test.describe('backing up data', () => {
  test('Export downloads a JSON file', async () => {
    await app.registerSuccessfulFirstServes(1);
    await app.endSessionAndSave('Backed up');

    const download = await app.exportBackup();
    expect(download.suggestedFilename()).toMatch(/^suivi-service-.*\.json$/);
  });

  test('Import restores a previously exported backup', async () => {
    const fixture = {
      exportedAt: new Date().toISOString(),
      currentSession: { first: 3, second: 1, fault: 2 },
      history: [
        { name: 'Imported session', date: new Date().toISOString(), first: 4, second: 2, fault: 1 },
      ],
    };
    const tmpFile = path.join(os.tmpdir(), 'serve-tracker-fixture.json');
    fs.writeFileSync(tmpFile, JSON.stringify(fixture));

    await app.importBackup(tmpFile);

    expect(await app.getTotalPoints()).toBe(6); // 3 + 1 + 2
  });
});

test.describe('language switching', () => {
  test('switching to English updates the button labels', async () => {
    expect(await app.getFirstServeButtonLabel()).toContain('1er service');
    await app.switchLanguageTo('en');
    expect(await app.getFirstServeButtonLabel()).toContain('1st serve');
    expect(await app.getDoubleFaultButtonLabel()).toContain('Double fault');
  });

  test('the chosen language persists across a reload', async () => {
    await app.switchLanguageTo('en');
    await app.reload();
    expect(await app.getSelectedLanguage()).toBe('en');
    expect(await app.getFirstServeButtonLabel()).toContain('1st serve');
  });
});

test.describe('help panel', () => {
  test('opens and closes, showing the active language', async () => {
    await app.openHelp();
    expect(await app.isHelpOpen()).toBe(true);
    expect(await app.getHelpText()).toContain('service'); // French by default

    await app.closeHelp();
    expect(await app.isHelpOpen()).toBe(false);
  });
});
