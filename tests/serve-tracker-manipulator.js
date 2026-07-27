// @ts-check
// Manipulator for Serve Tracker: every CSS selector and dialog-handling
// detail lives here. Tests should never reference an #id or .class —
// they call these methods instead, named after what a tennis player is
// actually doing ("register a first serve"), not how the UI is built.

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

  /** Deletes the first saved session matching this exact name. */
  async deleteSavedSession(name) {
    const item = this.page.locator('.hist-item', { hasText: name });
    this.page.once('dialog', (dialog) => dialog.accept());
    await item.locator('.hist-delete').click();
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
