let currentMode     = 'dark-to-light';
let currentFile     = null;
let allPageDataUrls = [];   // converted PNG data-URL per page
let originalDataUrl = null;
let isPDF           = false;

// ── Drag & Drop ──────────────────────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// ── File Handling ────────────────────────────────────────────────
function formatBytes(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function handleFile(file) {
  currentFile     = file;
  isPDF           = file.type === 'application/pdf';
  allPageDataUrls = [];

  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent  = formatBytes(file.size);
  document.getElementById('fileInfo').classList.add('visible');
  document.getElementById('convertBtn').disabled = false;
  document.getElementById('resultsCard').classList.remove('visible');
  document.getElementById('progressWrap').classList.remove('visible');
}

function removeFile() {
  currentFile = null;
  fileInput.value = '';
  allPageDataUrls = [];
  document.getElementById('fileInfo').classList.remove('visible');
  document.getElementById('convertBtn').disabled = true;
  document.getElementById('resultsCard').classList.remove('visible');
  document.getElementById('progressWrap').classList.remove('visible');
}

function selectMode(mode) {
  currentMode = mode;
  document.getElementById('btn-d2l').classList.toggle('active', mode === 'dark-to-light');
  document.getElementById('btn-l2d').classList.toggle('active', mode === 'light-to-dark');
}

// ── Progress ─────────────────────────────────────────────────────
function setProgress(pct, msg) {
  document.getElementById('progressWrap').classList.add('visible');
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressMsg').textContent   = msg;
}
function hideProgress() {
  setTimeout(() => document.getElementById('progressWrap').classList.remove('visible'), 1400);
}

// ── Pixel Helpers ────────────────────────────────────────────────
function getAvgBrightness(imageData) {
  let total = 0;
  const d   = imageData.data;
  for (let i = 0; i < d.length; i += 4)
    total += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return total / (d.length / 4);
}

function invertImageData(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

// ── Main Entry ───────────────────────────────────────────────────
async function startConversion() {
  if (!currentFile) return;

  document.getElementById('convertBtn').disabled = true;
  document.getElementById('resultsCard').classList.remove('visible');
  document.getElementById('detectedInfo').classList.remove('visible');
  document.getElementById('pageCountInfo').classList.remove('visible');
  document.getElementById('pagesStrip').classList.remove('visible');
  document.getElementById('pagesStrip').innerHTML    = '';
  document.getElementById('allPagesLabel').style.display = 'none';
  document.getElementById('pageSummaryWrap').style.display = 'none';
  document.getElementById('summaryBody').innerHTML   = '';
  allPageDataUrls = [];

  try {
    if (isPDF) {
      await convertPDF();
    } else {
      await convertImage();
    }
  } catch (err) {
    setProgress(0, 'Error: ' + err.message);
    document.getElementById('convertBtn').disabled = false;
  }
}

// ── Image Conversion ─────────────────────────────────────────────
async function convertImage() {
  setProgress(20, 'Loading image...');

  const img = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      originalDataUrl = e.target.result;
      const im = new Image();
      im.onload  = () => res(im);
      im.onerror = rej;
      im.src     = e.target.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(currentFile);
  });

  const off   = document.createElement('canvas');
  off.width   = img.width;
  off.height  = img.height;
  const ctx   = off.getContext('2d');
  ctx.drawImage(img, 0, 0);

  setProgress(55, 'Detecting theme...');
  const imgData  = ctx.getImageData(0, 0, img.width, img.height);
  const isDark   = getAvgBrightness(imgData) < 128;
  const noChange = (isDark && currentMode === 'light-to-dark') ||
                   (!isDark && currentMode === 'dark-to-light');

  const rc   = document.getElementById('resultCanvas');
  rc.width   = img.width;
  rc.height  = img.height;
  const rCtx = rc.getContext('2d');

  setProgress(80, noChange ? 'No conversion needed...' : 'Converting...');
  if (noChange) {
    rCtx.drawImage(img, 0, 0);
  } else {
    invertImageData(imgData);
    rCtx.putImageData(imgData, 0, 0);
  }

  document.getElementById('originalImg').src          = originalDataUrl;
  document.getElementById('origHeaderText').textContent = 'Original';
  document.getElementById('convHeaderText').textContent = 'Converted';
  document.getElementById('downloadBtnText').textContent = 'Download PNG';

  // Detected info for image
  const detEl = document.getElementById('detectedInfo');
  const detTx = document.getElementById('detectedText');
  detEl.classList.add('visible');
  detTx.innerHTML = noChange
    ? `Detected: <strong>${isDark ? 'Dark' : 'Light'}</strong> — already matches selected mode. No changes applied.`
    : `Detected: <strong>${isDark ? 'Dark' : 'Light'}</strong> — converted to <strong>${isDark ? 'Light' : 'Dark'}</strong>.`;

  const badge = document.getElementById('resultBadge');
  badge.style.display = 'inline-block';
  badge.className     = 'badge ' + (noChange ? 'badge-same' : 'badge-converted');
  badge.textContent   = noChange ? 'No change' : 'Converted';

  allPageDataUrls = [rc.toDataURL('image/png')];
  setProgress(100, noChange ? 'Done — already matches selected theme.' : 'Conversion complete!');
  document.getElementById('resultsCard').classList.add('visible');
  document.getElementById('convertBtn').disabled = false;
  hideProgress();
}

// ── PDF Conversion — PER-PAGE DETECTION ─────────────────────────
async function convertPDF() {
  setProgress(10, 'Loading PDF library...');

  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s   = document.createElement('script');
      s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload  = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  setProgress(18, 'Reading PDF...');
  const arrayBuffer = await new Promise((res, rej) => {
    const r   = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsArrayBuffer(currentFile);
  });

  const pdf        = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  setProgress(25, `PDF loaded — ${totalPages} page${totalPages > 1 ? 's' : ''} found. Processing each page...`);

  const strip      = document.getElementById('pagesStrip');
  const tbody      = document.getElementById('summaryBody');
  strip.innerHTML  = '';
  tbody.innerHTML  = '';

  let convertedCount = 0;
  let skippedCount   = 0;

  for (let i = 1; i <= totalPages; i++) {
    const pct = 25 + Math.round(((i - 1) / totalPages) * 65);
    setProgress(pct, `Processing page ${i} of ${totalPages}...`);

    const page = await pdf.getPage(i);
    const vp   = page.getViewport({ scale: 1.8 });

    const cv   = document.createElement('canvas');
    cv.width   = vp.width;
    cv.height  = vp.height;
    const ctx  = cv.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // ── Per-page brightness detection ──
    const imgData   = ctx.getImageData(0, 0, vp.width, vp.height);
    const avg       = getAvgBrightness(imgData);
    const pageIsDark = avg < 128;

    // Decide: does this page need conversion to reach the target theme?
    const targetDark  = currentMode === 'light-to-dark';
    const needsChange = pageIsDark !== targetDark;
    // i.e. if target is dark and page is already dark → skip
    //      if target is dark and page is light → convert
    //      if target is light and page is dark → convert
    //      if target is light and page is light → skip

    if (needsChange) {
      invertImageData(imgData);
      ctx.putImageData(imgData, 0, 0);
      convertedCount++;
    } else {
      skippedCount++;
    }

    const dataUrl = cv.toDataURL('image/png');
    allPageDataUrls.push(dataUrl);

    // Page 1 → main preview
    if (i === 1) {
      originalDataUrl = (() => {
        // Reconstruct original page 1 separately for preview
        const orig   = document.createElement('canvas');
        orig.width   = vp.width;
        orig.height  = vp.height;
        // Re-render (we already have imgData mutated, so redraw from scratch)
        return null; // handled below
      })();
    }

    // Thumbnail
    const thumb  = document.createElement('div');
    thumb.className = 'page-thumb ' + (needsChange ? 'thumb-converted' : 'thumb-skipped');
    thumb.title  = `Page ${i} — ${pageIsDark ? 'Dark' : 'Light'} → ${needsChange ? (pageIsDark ? 'Light' : 'Dark') : 'No change'}`;
    const tc     = document.createElement('canvas');
    tc.width     = cv.width;
    tc.height    = cv.height;
    tc.getContext('2d').drawImage(cv, 0, 0);
    const tlabel = document.createElement('div');
    tlabel.className   = 'page-thumb-label';
    tlabel.textContent = `P${i} ${needsChange ? '✓' : '–'}`;
    thumb.appendChild(tc);
    thumb.appendChild(tlabel);
    strip.appendChild(thumb);

    // Summary table row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${i}</strong></td>
      <td><span class="pill ${pageIsDark ? 'pill-dark' : 'pill-light'}">${pageIsDark ? '🌑 Dark' : '☀️ Light'}</span></td>
      <td>${needsChange
        ? `Convert to <strong>${pageIsDark ? 'Light' : 'Dark'}</strong>`
        : '<em style="color:var(--text-secondary)">Already correct</em>'}</td>
      <td><span class="pill ${needsChange ? 'pill-converted' : 'pill-skipped'}">${needsChange ? '✓ Converted' : '– Skipped'}</span></td>
    `;
    tbody.appendChild(tr);
  }

  // ── Re-render original page 1 for side-by-side preview ──
  const page1orig = await pdf.getPage(1);
  const vp1       = page1orig.getViewport({ scale: 1.8 });
  const origCv    = document.createElement('canvas');
  origCv.width    = vp1.width;
  origCv.height   = vp1.height;
  await page1orig.render({ canvasContext: origCv.getContext('2d'), viewport: vp1 }).promise;
  originalDataUrl = origCv.toDataURL('image/png');

  document.getElementById('originalImg').src            = originalDataUrl;
  document.getElementById('origHeaderText').textContent = 'Original (Page 1)';
  document.getElementById('convHeaderText').textContent = 'Converted (Page 1)';

  // Put converted page 1 into result canvas
  const rc   = document.getElementById('resultCanvas');
  const img1 = await loadImage(allPageDataUrls[0]);
  rc.width   = img1.naturalWidth;
  rc.height  = img1.naturalHeight;
  rc.getContext('2d').drawImage(img1, 0, 0);

  // Page 1 badge
  const page1IsDark  = getAvgBrightness(origCv.getContext('2d').getImageData(0, 0, vp1.width, vp1.height)) < 128;
  const page1Changed = page1IsDark !== (currentMode === 'light-to-dark');
  const badge = document.getElementById('resultBadge');
  badge.style.display = 'inline-block';
  badge.className     = 'badge ' + (page1Changed ? 'badge-converted' : 'badge-same');
  badge.textContent   = page1Changed ? 'Converted' : 'No change';

  // Detected info summary
  const detEl = document.getElementById('detectedInfo');
  const detTx = document.getElementById('detectedText');
  detEl.classList.add('visible');
  detTx.innerHTML =
    `<strong>${convertedCount}</strong> page${convertedCount !== 1 ? 's' : ''} converted &nbsp;·&nbsp; ` +
    `<strong>${skippedCount}</strong> page${skippedCount !== 1 ? 's' : ''} already correct (skipped).`;

  // Page count banner
  document.getElementById('pageCountText').textContent =
    `${totalPages} pages processed — downloading as a single PDF.`;
  document.getElementById('pageCountInfo').classList.add('visible');

  // Show thumbnails & summary table
  document.getElementById('allPagesLabel').style.display = 'block';
  strip.classList.add('visible');
  document.getElementById('pageSummaryWrap').style.display = 'block';

  document.getElementById('downloadBtnText').textContent =
    `Download PDF (${totalPages} page${totalPages > 1 ? 's' : ''})`;

  setProgress(100, `Done — ${convertedCount} converted, ${skippedCount} skipped.`);
  document.getElementById('resultsCard').classList.add('visible');
  document.getElementById('convertBtn').disabled = false;
  hideProgress();
}

// ── Download ─────────────────────────────────────────────────────
async function downloadResult() {
  if (!allPageDataUrls.length) return;

  const btn      = document.getElementById('downloadBtn');
  btn.disabled   = true;
  const baseName = currentFile
    ? currentFile.name.replace(/\.[^.]+$/, '')
    : 'converted';

  if (!isPDF) {
    const a    = document.createElement('a');
    a.download = baseName + '-converted.png';
    a.href     = allPageDataUrls[0];
    a.click();
    btn.disabled = false;
    return;
  }

  // Rebuild PDF
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Building PDF...';

  const { jsPDF } = window.jspdf;
  const firstImg  = await loadImage(allPageDataUrls[0]);
  const ptW = firstImg.naturalWidth  * 0.75;
  const ptH = firstImg.naturalHeight * 0.75;

  const doc = new jsPDF({
    orientation: ptW > ptH ? 'landscape' : 'portrait',
    unit:   'pt',
    format: [ptW, ptH]
  });

  for (let i = 0; i < allPageDataUrls.length; i++) {
    btn.innerHTML = `<i class="ti ti-loader-2"></i> Building PDF (${i + 1}/${allPageDataUrls.length})...`;

    const img = await loadImage(allPageDataUrls[i]);
    const w   = img.naturalWidth  * 0.75;
    const h   = img.naturalHeight * 0.75;

    if (i > 0) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
    doc.addImage(allPageDataUrls[i], 'PNG', 0, 0, w, h, '', 'FAST');
  }

  doc.save(baseName + '-converted.pdf');

  btn.disabled  = false;
  btn.innerHTML = `<i class="ti ti-download"></i> <span id="downloadBtnText">Download PDF (${allPageDataUrls.length} pages)</span>`;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img   = new Image();
    img.onload  = () => res(img);
    img.onerror = rej;
    img.src     = src;
  });
}
