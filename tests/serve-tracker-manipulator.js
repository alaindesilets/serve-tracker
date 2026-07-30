// @ts-check
// Manipulator for Serve Tracker: every CSS selector and dialog-handling
// detail lives here. Tests should never reference an #id or .class —
// they call these methods instead, named after what a tennis player is
// actually doing ("register a first serve"), not how the UI is built.
// It also owns a few assertion helpers (expectSegmentsToBe) for the same
// reason: the shape of what's being compared is a UI/model detail too.

const { expect } = require('@playwright/test');

class ServeTrackerManipulator {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  // --- app lifecycle -------------------------------------------------

  async open(url) {
    await this.page.goto(url);
  }

  /** Wipes all local data (session + history) and reloads to a clean slate. */
  async resetAllData() {
    await this.page.evaluate(() => localStorage.clear());
    await this.page.reload();
  }

  async reload() {
    await this.page.reload();
  }

  // --- recording serves ------------------------------------------------

  async registerSuccessfulFirstServes(n) {
    for (let i = 0; i < n; i++) await this.page.click('#btn-first');
  }

  async registerSuccessfulSecondServes(n) {
    for (let i = 0; i < n; i++) await this.page.click('#btn-second');
  }

  async registerDoubleFaults(n) {
    for (let i = 0; i < n; i++) await this.page.click('#btn-fault');
  }

  /**
   * Registers a full set of serves in one call, e.g.
   * `registerServes({ first: 2, second: 1, fault: 1 })`. Any outcome left
   * out defaults to zero.
   */
  async registerServes({ first = 0, second = 0, fault = 0 } = {}) {
    await this.registerSuccessfulFirstServes(first);
    await this.registerSuccessfulSecondServes(second);
    await this.registerDoubleFaults(fault);
  }

  // --- reading the current session's stats ------------------------------

  async getTotalPoints() {
    return Number(await this.page.locator('#total-n').textContent());
  }

  async getFirstServeCount() {
    return Number(await this.page.locator('#c-first').textContent());
  }

  async getSecondServeCount() {
    return Number(await this.page.locator('#c-second').textContent());
  }

  async getDoubleFaultCount() {
    return Number(await this.page.locator('#c-fault').textContent());
  }

  /**
   * Asserts the current session's counts match exactly, e.g.
   * `expectCountsToBe({ first: 2, second: 1, fault: 1 })`. Any outcome
   * left out defaults to zero; `total` defaults to the sum of the three,
   * but can be overridden to check a mismatch.
   * @param {{ first?: number, second?: number, fault?: number, total?: number }} counts
   */
  async expectCountsToBe({ first = 0, second = 0, fault = 0, total = first + second + fault } = {}) {
    expect(await this.getFirstServeCount()).toBe(first);
    expect(await this.getSecondServeCount()).toBe(second);
    expect(await this.getDoubleFaultCount()).toBe(fault);
    expect(await this.getTotalPoints()).toBe(total);
  }

  async getFirstServePercentage() {
    return this._percentageFrom('#leg-first');
  }

  async getSecondServePercentage() {
    return this._percentageFrom('#leg-second');
  }

  async getDoubleFaultPercentage() {
    return this._percentageFrom('#leg-fault');
  }

  async _percentageFrom(selector) {
    const text = await this.page.locator(selector).textContent();
    const match = /^(\d+)%/.exec(text || '');
    return match ? Number(match[1]) : null;
  }

  // --- donut chart model (no pixels involved) ---------------------------

  /**
   * Computes what the donut chart *should* show for an arbitrary
   * {first, second, fault} count, straight from the app's own model
   * function — no canvas, no pixel reading. Use this to test the chart's
   * math (percentages, angles, colors) in isolation.
   */
  async computeChartSegmentsFor(counts) {
    return this.page.evaluate((c) => donutChart.computeSegments(c), counts);
  }

  /** Same, but reads whatever the current on-screen session actually is. */
  async getCurrentChartSegments() {
    return this.page.evaluate(() => donutChart.computeSegments(state));
  }

  /**
   * Computes the chart's counts from `expSegments` (so the counts and
   * the expected result never have to be written twice), then asserts
   * the model's actual output matches — key, value, and percentage per
   * segment, in order.
   * @param {Array<{key: string, value: number, percentage: number}>} expSegments
   */
  async expectSegmentsToBe(expSegments) {
    const counts = { first: 0, second: 0, fault: 0 };
    expSegments.forEach((s) => { counts[s.key] = s.value; });

    const { segments: actual } = await this.computeChartSegmentsFor(counts);

    expect(actual.map((s) => s.key)).toEqual(expSegments.map((s) => s.key));
    expect(actual.map((s) => s.value)).toEqual(expSegments.map((s) => s.value));
    expect(actual.map((s) => s.percentage)).toEqual(expSegments.map((s) => s.percentage));
  }

  /**
   * Screenshots the donut chart's canvas to `screenshotPath`, for a human to eyeball.
   * @param {string} screenshotPath
   */
  async screenshotDonutChart(screenshotPath) {
    await this.page.locator('#chart').screenshot({ path: screenshotPath });
  }

  // --- trends chart model (no pixels involved) ---------------------------

  /**
   * Computes what the Trends chart *should* show for an arbitrary list of
   * saved sessions (newest-first, same shape as history entries), straight
   * from the app's own model function — no canvas involved.
   */
  async computeEvolutionSeriesFor(historyList) {
    return this.page.evaluate((list) => evolutionPane.computeSeries(list), historyList);
  }

  /** Same, but reads whatever history is actually saved right now. */
  async getCurrentEvolutionSeries() {
    return this.page.evaluate(async () => {
      const list = await loadHistoryList();
      return evolutionPane.computeSeries(list);
    });
  }

  /**
   * Given the same `historyList` you'd pass to computeEvolutionSeriesFor,
   * asserts each outcome's percentage series (oldest to newest) matches
   * `expectedPercentagesByKey`, e.g. { first: [50, 66], second: [...], fault: [...] }.
   */
  async expectEvolutionSeriesToBe(historyList, expectedPercentagesByKey) {
    const { sessionCount, series } = await this.computeEvolutionSeriesFor(historyList);
    expect(sessionCount).toBe(historyList.length);

    Object.keys(expectedPercentagesByKey).forEach((key) => {
      const found = series.find((s) => s.key === key);
      const actualPercentages = found.points.map((p) => p.percentage);
      expect(actualPercentages).toEqual(expectedPercentagesByKey[key]);
    });
  }

  /**
   * Screenshots the Trends chart's canvas to `screenshotPath`, for a human to eyeball.
   * @param {string} screenshotPath
   */
  async screenshotTrendsChart(screenshotPath) {
    await this.page.locator('#evo-chart').screenshot({ path: screenshotPath });
  }

  // --- ending a practice session -----------------------------------------

  /**
   * Ends the session without keeping a record of it (declines the save
   * prompt). Safe to call even with an empty session — no prompt appears
   * in that case, and this simply does nothing.
   */
  async endSessionWithoutSaving() {
    this.page.once('dialog', (dialog) => dialog.dismiss());
    await this.page.click('#reset-btn');
  }

  /** Ends the session and archives it in history under the given name. */
  async endSessionAndSave(name) {
    this.page.once('dialog', (dialog) => dialog.accept(name));
    await this.page.click('#reset-btn');
  }

  /**
   * Clicks Reset and reports whether the app actually asked to save
   * (used to confirm that an empty session resets silently).
   */
  async endSessionAndCheckIfPromptAppeared() {
    let promptAppeared = false;
    this.page.once('dialog', (dialog) => {
      promptAppeared = true;
      dialog.dismiss();
    });
    await this.page.click('#reset-btn');
    return promptAppeared;
  }

  // --- session history -----------------------------------------------------

  async openHistory() {
    await this.page.click('#history-btn');
  }

  async closeHistory() {
    await this.page.click('#history-close');
  }

  async viewSessionList() {
    await this.page.click('.hist-tab[data-view="list"]');
  }

  async viewTrends() {
    await this.page.click('.hist-tab[data-view="chart"]');
  }

  async getSavedSessionNames() {
    return this.page.locator('.hist-name').allTextContents();
  }

  async hasSavedSession(name) {
    return (await this.getSavedSessionNames()).includes(name);
  }

  async hasNoSavedSessions() {
    return this.page.locator('.hist-empty').isVisible();
  }

  /**
   * Reads the total points and per-outcome percentages displayed for the
   * saved session matching this exact name, in the List tab.
   * @param {string} name
   */
  async getSavedSessionStats(name) {
    const text = await this.page.locator('.hist-item', { hasText: name }).locator('.hist-stats').textContent();
    const match = /(\d+)\s*pts(\d+)%\s*\/\s*(\d+)%\s*\/\s*(\d+)%/.exec(text || '');
    if (!match) return null;
    const [, total, firstPercentage, secondPercentage, faultPercentage] = match;
    return {
      total: Number(total),
      firstPercentage: Number(firstPercentage),
      secondPercentage: Number(secondPercentage),
      faultPercentage: Number(faultPercentage),
    };
  }

  /** Deletes the first saved session matching this exact name. */
  async deleteSavedSession(name) {
    const item = this.page.locator('.hist-item', { hasText: name });
    this.page.once('dialog', (dialog) => dialog.accept());
    await item.locator('.hist-delete').click();
  }

  /** Clicks Clear All and confirms, deleting the entire saved history. */
  async clearAllHistory() {
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.page.click('#clear-history-btn');
  }

  /** Clicks Clear All but cancels the confirmation, leaving history untouched. */
  async clearAllHistoryButCancel() {
    this.page.once('dialog', (dialog) => dialog.dismiss());
    await this.page.click('#clear-history-btn');
  }

  async isTrendsChartVisible() {
    return this.page.locator('#evo-chart').isVisible();
  }

  // --- backup: export / import -----------------------------------------

  /** Opens History, clicks Export, and returns the triggered download. */
  async exportBackup() {
    await this.openHistory();
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 5000 }),
      this.page.click('#export-btn'),
    ]);
    return download;
  }

  /**
   * Opens History and imports a backup file, accepting the
   * "replace current data?" confirmation and the resulting alert.
   * @param {string} filePath
   */
  async importBackup(filePath) {
    await this.openHistory();
    this.page.on('dialog', (dialog) => dialog.accept());
    await this.page.setInputFiles('#import-file', filePath);
  }

  // --- language ---------------------------------------------------------

  async switchLanguageTo(langCode) {
    await this.page.selectOption('#lang-select', langCode);
  }

  async getSelectedLanguage() {
    return this.page.locator('#lang-select').inputValue();
  }

  async getFirstServeButtonLabel() {
    return this.page.locator('#btn-first').textContent();
  }

  async getDoubleFaultButtonLabel() {
    return this.page.locator('#btn-fault').textContent();
  }

  // --- help panel ---------------------------------------------------------

  async openHelp() {
    await this.page.click('#help-btn');
  }

  async closeHelp() {
    await this.page.click('#help-close');
  }

  async isHelpOpen() {
    const cls = await this.page.locator('#help-overlay').getAttribute('class');
    return (cls || '').includes('open');
  }

  async getHelpText() {
    return this.page.locator('#help-body').textContent();
  }
}

module.exports = { ServeTrackerManipulator };
