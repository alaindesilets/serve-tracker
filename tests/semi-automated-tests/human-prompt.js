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
//
// A reference image is optional, and deliberately never generated from
// the app's own code (that would let a shared bug produce a "reference"
// that agrees with the very output it's supposed to be checking, leaving
// the human nothing to catch it against). It's a PNG the project owner
// supplies from their own machine, via a small thumbnail + "Change" link
// in the bottom bar — that upload writes straight to `referenceImagePath`
// on disk, independently of the Yes/No verdict.
//
// Clicking the thumbnail opens the reference image in a separate, real
// browser *window*, positioned next to the main one — zooming, resizing
// and moving that window is then plain Chrome window behavior, not
// anything this file has to get right, so it can be put side by side with
// the app to compare both at once. Three things that broke this early on,
// all fixed now:
//   - Chrome's built-in viewer for a direct file:// navigation to a PNG
//     has its own fixed sizing, so a tiny generated HTML wrapper shows the
//     image via plain CSS (object-fit: contain) instead.
//   - `window.open()` must run synchronously inside the click handler, or
//     Chrome no longer treats it as a trusted popup request and silently
//     ignores the width/height/resizable features (or blocks it outright).
//     So the wrapper file is written up front (before the prompt is even
//     shown), not fetched from Node on demand at click time — the click
//     handler never awaits anything before calling `window.open()`.
//   - A popup opened at some arbitrary fixed size (e.g. 480x360) stretches
//     or shrinks the reference image to fit, which visually reads as "the
//     image doesn't match" when actually only its display size is off. The
//     popup is instead sized to the image's own native pixel dimensions
//     (read straight from the PNG header, see getPngDimensions), capped to
//     fit the screen — see openReferenceWindow.
const fs = require('fs');
const path = require('path');
const os = require('os');

// PNG dimensions live right after the fixed 8-byte signature + IHDR chunk
// header: a 4-byte big-endian width then a 4-byte big-endian height, at
// fixed offsets 16 and 20. Reading them directly avoids pulling in an image
// decoding library just to size a popup window.
function getPngDimensions(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function writeViewerFile(dataUri) {
  // A fresh filename every time, deliberately — reusing one fixed path let
  // Chrome serve a stale cached copy of this page (from earlier in a
  // debugging session) even after its on-disk content changed, since nothing
  // about the URL itself ever changed to signal "this isn't what you saw
  // last time". A never-before-requested URL can't be served from cache.
  //
  // Sized with viewport units (100vw/100vh) + object-fit:contain, not JS —
  // the window this opens in is itself already sized to the image's native
  // dimensions (see openReferenceWindow below), so this is only here to
  // keep the image from distorting if the human resizes that window by
  // hand afterwards.
  const viewerPath = path.join(os.tmpdir(), `serve-tracker-reference-viewer-${Date.now()}.html`);
  const html = '<!doctype html><html><head><meta charset="utf-8">' +
    '<title>Reference image</title><style>' +
    'html,body{margin:0;padding:0;height:100%;width:100%;background:#0A110D;overflow:hidden;}' +
    '</style></head><body>' +
    `<img id="ref-img" src="${dataUri}" alt="Reference" ` +
    'style="display:block;width:100vw;height:100vh;object-fit:contain;">' +
    '</body></html>';
  fs.writeFileSync(viewerPath, html);
  return viewerPath;
}

let saveFunctionExposed = new WeakSet();

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} question
 * @param {string} [referenceImagePath] - absolute path to a PNG showing what
 *   the result should look like. Optional: if omitted, or the file doesn't
 *   exist yet, the prompt shows a "click to upload" placeholder instead —
 *   nothing fails because a reference hasn't been supplied yet.
 * @returns {Promise<{ passed: boolean, comment: string|null }>}
 */
async function askHuman(page, question, referenceImagePath) {
  let referenceImageDataUri = null;
  let viewerUrl = null;
  let referenceImageWidth = null;
  let referenceImageHeight = null;
  if (referenceImagePath && fs.existsSync(referenceImagePath)) {
    const buffer = fs.readFileSync(referenceImagePath);
    referenceImageDataUri = 'data:image/png;base64,' + buffer.toString('base64');
    viewerUrl = 'file://' + writeViewerFile(referenceImageDataUri);
    ({ width: referenceImageWidth, height: referenceImageHeight } = getPngDimensions(buffer));
  }

  // Exposed once per page: lets the in-page upload handler hand a newly
  // picked file's bytes back to Node, which is the only side that can
  // write to disk. Also regenerates the viewer file (fresh filename, see
  // writeViewerFile) and returns its URL and native size, so a subsequent
  // "view" click picks up the just-changed image — both its pixels and the
  // window size it opens at — instead of whatever was there before.
  // Registered lazily (not every test needs it) and only once per page,
  // since Playwright throws if the same name is exposed twice.
  if (referenceImagePath && !saveFunctionExposed.has(page)) {
    await page.exposeFunction('__saveReferenceImage', (targetPath, base64Data) => {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
      const { width, height } = getPngDimensions(buffer);
      return { viewerUrl: 'file://' + writeViewerFile('data:image/png;base64,' + base64Data), width, height };
    });
    saveFunctionExposed.add(page);
  }

  return page.evaluate(({ q, imgSrc, refPath, viewerUrl, imgWidth, imgHeight }) => {
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

      const content = document.createElement('div');
      content.style.cssText = 'display: flex; align-items: center; gap: 16px;';

      // --- reference image (thumbnail + "open in its own window") ---------
      let fileInput = null;
      let refWindow = null;

      if (refPath) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.cssText = 'display: none;';
        document.body.appendChild(fileInput);

        const refGroup = document.createElement('div');
        refGroup.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 4px;';

        // Fully synchronous — no await between the click and window.open,
        // or Chrome stops treating it as a trusted popup request.
        //
        // Sized to the image's own native pixel dimensions (never
        // upscaled — only shrunk if it wouldn't fit the screen), so the
        // reference always shows at full, undistorted resolution instead
        // of whatever a fixed window size happened to stretch or shrink
        // it to.
        function openReferenceWindow() {
          if (!viewerUrl) return;
          if (refWindow && !refWindow.closed) refWindow.close();
          const margin = 80;
          const maxW = screen.availWidth - margin;
          const maxH = screen.availHeight - margin;
          const nativeW = imgWidth || maxW;
          const nativeH = imgHeight || maxH;
          const scale = Math.min(1, maxW / nativeW, maxH / nativeH);
          const w = Math.round(nativeW * scale);
          const h = Math.round(nativeH * scale);
          const left = window.screenX + window.outerWidth;
          const top = window.screenY;
          refWindow = window.open(
            viewerUrl,
            'serveTrackerReferenceImage_' + Date.now(),
            `width=${w},height=${h},left=${left},top=${top},resizable=yes`
          );
        }

        function renderThumb(src) {
          refGroup.innerHTML = '';

          const img = document.createElement('img');
          img.src = src;
          img.alt = 'Expected result — click to open larger in its own window';
          img.title = 'Click to open this image in its own window, resizable/movable like any browser window';
          img.style.cssText = `
            width: 90px; height: 60px; object-fit: contain; cursor: zoom-in;
            border-radius: 6px; border: 1px solid #4E9B5E; background: #0A110D;
          `;
          img.onclick = openReferenceWindow;
          refGroup.appendChild(img);

          const changeLink = document.createElement('div');
          changeLink.textContent = 'Change';
          changeLink.style.cssText = 'font-size: 10px; color: #7C9285; text-decoration: underline; cursor: pointer;';
          changeLink.onclick = () => fileInput.click();
          refGroup.appendChild(changeLink);
        }

        function renderPlaceholder() {
          refGroup.innerHTML = '';

          const div = document.createElement('div');
          div.textContent = 'Click here to upload a reference image';
          div.style.cssText = `
            width: 140px; height: 60px; display: flex; align-items: center;
            justify-content: center; text-align: center; font-size: 11px;
            color: #7C9285; border: 1px dashed #7C9285; border-radius: 6px;
            cursor: pointer; padding: 4px;
          `;
          div.onclick = () => fileInput.click();
          refGroup.appendChild(div);
        }

        if (imgSrc) renderThumb(imgSrc); else renderPlaceholder();
        content.appendChild(refGroup);

        fileInput.addEventListener('change', () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUri = /** @type {string} */ (reader.result);
            const base64 = dataUri.split(',')[1];
            renderThumb(dataUri);
            // @ts-ignore - exposed by Playwright from the Node side
            window.__saveReferenceImage(refPath, base64).then((result) => {
              // so the next "view" click shows the new image, sized to it
              viewerUrl = result.viewerUrl;
              imgWidth = result.width;
              imgHeight = result.height;
            });
          };
          reader.readAsDataURL(file);
        });
      }

      const text = document.createElement('div');
      text.style.cssText = 'font-size: 15px; text-align: center; white-space: pre-line;';
      text.textContent = q;
      content.appendChild(text);

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 16px; align-items: center;';

      function cleanup() {
        bar.remove();
        if (fileInput) fileInput.remove();
        if (refWindow && !refWindow.closed) refWindow.close();
      }

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

      bar.appendChild(content);
      bar.appendChild(row);
      document.body.appendChild(bar);
      showYesNo();
    });
  }, {
    q: question,
    imgSrc: referenceImageDataUri,
    refPath: referenceImagePath || null,
    viewerUrl,
    imgWidth: referenceImageWidth,
    imgHeight: referenceImageHeight,
  });
}

module.exports = { askHuman };
