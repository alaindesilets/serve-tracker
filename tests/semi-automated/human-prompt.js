// @ts-check
// Pauses a semi-automated test and asks a yes/no question *inside the
// browser page itself* — not the terminal. Terminal stdin doesn't reliably
// reach a test running inside one of Playwright's worker processes, so a
// readline-based prompt can hang forever waiting for input that never
// arrives. An on-page overlay sidesteps that entirely: the human clicks a
// real button in the browser window that's already open in front of them.
// The overlay only occupies the bottom of the page, so it never covers
// whatever is being visually checked (e.g. the chart near the top).
//
// On "No", the overlay asks for a short comment describing what's wrong,
// which the caller can fold into the test's failure message — so the
// test report tells you *why* a human rejected it, not just that they did.

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} question
 * @returns {Promise<{ passed: boolean, comment: string|null }>}
 */
async function askHuman(page, question) {
  return page.evaluate((q) => {
    return new Promise((resolve) => {
      const bar = document.createElement('div');
      bar.id = '__human-test-prompt';
      bar.style.cssText = `
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 999999;
        background: rgba(10, 17, 13, 0.96); color: #EDEAE1;
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        padding: 18px 16px; font-family: sans-serif;
        border-top: 2px solid #4E9B5E;
      `;

      const text = document.createElement('div');
      text.style.cssText = 'font-size: 15px; text-align: center; white-space: pre-line;';
      text.textContent = q;

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 16px; align-items: center;';

      function cleanup() { bar.remove(); }

      function styledButton(label, bg) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = `
          font-size: 16px; padding: 10px 28px; border-radius: 8px; border: none;
          background: ${bg}; color: #14231A; font-weight: 600; cursor: pointer;
        `;
        return b;
      }

      function showYesNo() {
        row.innerHTML = '';

        const yesBtn = styledButton('Yes', '#4E9B5E');
        yesBtn.onclick = () => { cleanup(); resolve({ passed: true, comment: null }); };

        const noBtn = styledButton('No', '#D6483F');
        noBtn.onclick = showCommentBox;

        row.appendChild(yesBtn);
        row.appendChild(noBtn);
      }

      function showCommentBox() {
        row.innerHTML = '';

        const textarea = document.createElement('textarea');
        textarea.placeholder = "What's wrong with it?";
        textarea.style.cssText = `
          width: 280px; height: 56px; font-size: 14px; padding: 8px;
          border-radius: 6px; border: none; resize: vertical; font-family: inherit;
        `;

        const submitBtn = styledButton('Submit', '#D6483F');
        submitBtn.onclick = () => {
          const comment = textarea.value.trim() || '(no comment provided)';
          cleanup();
          resolve({ passed: false, comment });
        };

        row.appendChild(textarea);
        row.appendChild(submitBtn);
        textarea.focus();
      }

      bar.appendChild(text);
      bar.appendChild(row);
      document.body.appendChild(bar);
      showYesNo();
    });
  }, question);
}

module.exports = { askHuman };
