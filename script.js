let currentMode     = 'dark-to-light';
let currentFile     = null;
let allPageDataUrls = [];   // one PNG data-URL per converted page
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

// ── Progress Bar ─────────────────────────────────────────────────
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
  document.getElementById('pagesStrip').innerHTML = '';
  document.getElementById('allPagesLabel').style.display = 'none';
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

  const off = document.createElement('canvas');
  off.width  = img.width;
  off.height = img.height;
  const ctx  = off.getContext('2d');
  ctx.drawImage(img, 0, 0);

  setProgress(55, 'Detecting theme...');
  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const isDark  = getAvgBrightness(imgData) < 128;
  const noChange = (isDark && currentMode === 'light-to-dark') ||
                   (!isDark && currentMode === 'dark-to-light');

  showDetected(isDark, noChange);

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

  document.getElementById('originalImg').src = originalDataUrl;
  document.getElementById('origHeaderText').textContent = 'Original';
  document.getElementById('convHeaderText').textContent = 'Converted';
  document.getElementById('downloadBtnText').textContent = 'Download PNG';

  allPageDataUrls = [rc.toDataURL('image/png')];

  setProgress(100, noChange ? 'Done — already matches selected theme.' : 'Conversion complete!');
  showResults(noChange);
}

// ── PDF Conversion (ALL PAGES → output PDF) ──────────────────────
async function convertPDF() {
  setProgress(10, 'Loading PDF library...');

  // Load PDF.js if not already loaded
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

  setProgress(25, `PDF loaded — ${totalPages} page${totalPages > 1 ? 's' : ''} found...`);

  // Detect theme from page 1
  const page1  = await pdf.getPage(1);
  const vp1    = page1.getViewport({ scale: 1.8 });
  const detCv  = document.createElement('canvas');
  detCv.width  = vp1.width;
  detCv.height = vp1.height;
  const detCtx = detCv.getContext('2d');
  await page1.render({ canvasContext: detCtx, viewport: vp1 }).promise;

  const detData  = detCtx.getImageData(0, 0, detCv.width, detCv.height);
  const isDark   = getAvgBrightness(detData) < 128;
  const noChange = (isDark && currentMode === 'light-to-dark') ||
                   (!isDark && currentMode === 'dark-to-light');

  showDetected(isDark, noChange);

  // Store original page 1 preview
  originalDataUrl = detCv.toDataURL('image/png');
  document.getElementById('originalImg').src = originalDataUrl;
  document.getElementById('origHeaderText').textContent = 'Original (Page 1)';
  document.getElementById('convHeaderText').textContent = 'Converted (Page 1)';

  const strip = document.getElementById('pagesStrip');
  strip.innerHTML = '';

  // Process every page
  for (let i = 1; i <= totalPages; i++) {
    const pct = 28 + Math.round(((i - 1) / totalPages) * 62);
    setProgress(pct, `Converting page ${i} of ${totalPages}...`);

    const page = await pdf.getPage(i);
    const vp   = page.getViewport({ scale: 1.8 });

    const cv   = document.createElement('canvas');
    cv.width   = vp.width;
    cv.height  = vp.height;
    const ctx  = cv.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    if (!noChange) {
      const imgData = ctx.getImageData(0, 0, vp.width, vp.height);
      invertImageData(imgData);
      ctx.putImageData(imgData, 0, 0);
    }

    const dataUrl = cv.toDataURL('image/png');
    allPageDataUrls.push(dataUrl);

    // Page 1 → main preview canvas
    if (i === 1) {
      const rc   = document.getElementById('resultCanvas');
      rc.width   = vp.width;
      rc.height  = vp.height;
      rc.getContext('2d').drawImage(cv, 0, 0);
    }

    // Thumbnail strip
    const thumb  = document.createElement('div');
    thumb.className = 'page-thumb';
    thumb.title  = `Page ${i}`;
    const tc     = document.createElement('canvas');
    tc.width     = cv.width;
    tc.height    = cv.height;
    tc.getContext('2d').drawImage(cv, 0, 0);
    const tlabel = document.createElement('div');
    tlabel.className   = 'page-thumb-label';
    tlabel.textContent = `Page ${i}`;
    thumb.appendChild(tc);
    thumb.appendChild(tlabel);
    strip.appendChild(thumb);
  }

  // Page count banner
  if (totalPages > 1) {
    document.getElementById('pageCountText').textContent =
      `${totalPages} pages processed — downloading as a single PDF file.`;
    document.getElementById('pageCountInfo').classList.add('visible');
    document.getElementById('allPagesLabel').style.display = 'block';
    strip.classList.add('visible');
  }

  document.getElementById('downloadBtnText').textContent =
    `Download PDF (${totalPages} page${totalPages > 1 ? 's' : ''})`;

  setProgress(100, noChange
    ? `Done — PDF already matches selected theme. (${totalPages} pages)`
    : `All ${totalPages} page${totalPages > 1 ? 's' : ''} converted!`);

  showResults(noChange);
}

// ── UI Helpers ───────────────────────────────────────────────────
function showDetected(isDark, noChange) {
  const el = document.getElementById('detectedInfo');
  const tx = document.getElementById('detectedText');
  el.classList.add('visible');
  if (noChange) {
    tx.innerHTML = `Detected: <strong>${isDark ? 'Dark' : 'Light'}</strong> — already matches your selected mode. No changes applied.`;
  } else {
    tx.innerHTML = `Detected: <strong>${isDark ? 'Dark' : 'Light'}</strong> — converting to <strong>${isDark ? 'Light' : 'Dark'}</strong> theme.`;
  }
}

function showResults(noChange) {
  const badge = document.getElementById('resultBadge');
  badge.style.display = 'inline-block';
  badge.className     = 'badge ' + (noChange ? 'badge-same' : 'badge-converted');
  badge.textContent   = noChange ? 'No change' : 'Converted';
  document.getElementById('resultsCard').classList.add('visible');
  document.getElementById('convertBtn').disabled = false;
  hideProgress();
}

// ── Download ─────────────────────────────────────────────────────
async function downloadResult() {
  if (!allPageDataUrls.length) return;

  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;

  const baseName = currentFile
    ? currentFile.name.replace(/\.[^.]+$/, '')
    : 'converted';

  if (!isPDF) {
    // Image → download as PNG
    const a    = document.createElement('a');
    a.download = baseName + '-converted.png';
    a.href     = allPageDataUrls[0];
    a.click();
    btn.disabled = false;
    return;
  }

  // PDF → rebuild as PDF using jsPDF
  btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Building PDF...';

  const { jsPDF } = window.jspdf;

  // Load first page to get dimensions
  const firstImg = await loadImage(allPageDataUrls[0]);
  const pxW = firstImg.width;
  const pxH = firstImg.height;

  // Use pt units; 1 px ≈ 0.75 pt at 96dpi
  const ptW = pxW * 0.75;
  const ptH = pxH * 0.75;

  const orientation = ptW > ptH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: [ptW, ptH] });

  for (let i = 0; i < allPageDataUrls.length; i++) {
    btn.innerHTML = `<i class="ti ti-loader-2" aria-hidden="true"></i> Building PDF (${i + 1}/${allPageDataUrls.length})...`;

    if (i > 0) {
      const img  = await loadImage(allPageDataUrls[i]);
      const w    = img.width  * 0.75;
      const h    = img.height * 0.75;
      doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
    }

    doc.addImage(allPageDataUrls[i], 'PNG', 0, 0, ptW, ptH, '', 'FAST');
  }

  doc.save(baseName + '-converted.pdf');

  btn.disabled = false;
  btn.innerHTML = `<i class="ti ti-download" aria-hidden="true"></i> <span id="downloadBtnText">Download PDF (${allPageDataUrls.length} page${allPageDataUrls.length > 1 ? 's' : ''})</span>`;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img  = new Image();
    img.onload  = () => res(img);
    img.onerror = rej;
    img.src     = src;
  });
}
