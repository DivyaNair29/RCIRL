/* ═══════════════════════════════════════════════════════════════
   RCIRL v9 — Generator
   Fixes:
   - PDF: full-height capture (no cutoff), multi-page support
   - PDF photos: 3-column masonry
   - Poster: 1/2/3 column masonry by count, title below grid,
     no overlaps
   ═══════════════════════════════════════════════════════════════ */

const DEMO_PHOTOS = [
  'assets/demo_photos/property1.jpg',
  'assets/demo_photos/property2.jpg',
  'assets/demo_photos/property3.jpg',
  'assets/demo_photos/property4.jpg',
  'assets/demo_photos/property5.jpg',
  'assets/demo_photos/property6.jpg',
];

/* Canvas sizes the poster designer can export at. landscape:true uses the
   side-by-side layout in redraw(); portrait/square use the stacked layout. */
const POSTER_SIZES = [
  { id: 'square',   label: 'Square',         sub: '1080×1080 · IG / WhatsApp', w: 1080, h: 1080, landscape: false },
  { id: 'story',     label: 'Story',          sub: '1080×1920 · IG / WA Status', w: 1080, h: 1920, landscape: false },
  { id: 'facebook',  label: 'Facebook',       sub: '1200×630',                  w: 1200, h: 630,  landscape: true  },
  { id: 'linkedin',  label: 'LinkedIn',       sub: '1200×627',                  w: 1200, h: 627,  landscape: true  },
];

/* Poster color themes. onAccent = text color to use when painted ON the
   accent color (price badge, bottom bar) — explicit instead of guessing
   from the accent hex, so new themes don't need special-case checks. */
const POSTER_TEMPLATES = {
  dark:     { label: 'Dark',     bg: '#111827', accent: '#5B2D8E', tx: '#FFFFFF', sub: 'rgba(255,255,255,0.68)', chip: '#1e2740',           chipTx: '#fff',    onAccent: '#fff'    },
  light:    { label: 'Light',    bg: '#F0EDF6', accent: '#5B2D8E', tx: '#1A1A2E', sub: '#666',                   chip: '#EDE7F6',           chipTx: '#3E1A6B', onAccent: '#fff'    },
  gradient: { label: 'Gold',     bg: '#2D0F5C', accent: '#FFD700', tx: '#FFFFFF', sub: 'rgba(255,255,255,0.7)',  chip: 'rgba(255,215,0,0.18)', chipTx: '#FFD700', onAccent: '#1A1A2E' },
  minimal:  { label: 'Minimal',  bg: '#FFFFFF', accent: '#5B2D8E', tx: '#1A1A2E', sub: '#666',                   chip: '#EDE7F6',           chipTx: '#5B2D8E', onAccent: '#fff'    },
  sunset:   { label: 'Sunset',   bg: '#3D1B2E', accent: '#FF6B6B', tx: '#FFFFFF', sub: 'rgba(255,255,255,0.7)',  chip: 'rgba(255,107,107,0.18)', chipTx: '#FF8E8E', onAccent: '#1A1A2E' },
  ocean:    { label: 'Ocean',    bg: '#0B2545', accent: '#2EC4B6', tx: '#FFFFFF', sub: 'rgba(255,255,255,0.7)',  chip: 'rgba(46,196,182,0.18)',  chipTx: '#5EEAD4', onAccent: '#06231D' },
  emerald:  { label: 'Emerald',  bg: '#0B3D2E', accent: '#2ECC71', tx: '#FFFFFF', sub: 'rgba(255,255,255,0.7)',  chip: 'rgba(46,204,113,0.18)',  chipTx: '#6EE7A8', onAccent: '#06301E' },
  luxe:     { label: 'Luxe',     bg: '#0A0A0A', accent: '#D4AF37', tx: '#FFFFFF', sub: 'rgba(255,255,255,0.65)', chip: 'rgba(212,175,55,0.18)',  chipTx: '#D4AF37', onAccent: '#1A1A1A' },
};

function _tmplThumbHtml(selectedId, idPrefix, onclickFn) {
  return Object.entries(POSTER_TEMPLATES).map(([id, t]) =>
    '<div class="tmpl-thumb' + (id === selectedId ? ' selected' : '') + '" id="' + idPrefix + id + '" onclick="' + onclickFn + '(\'' + id + '\')">' +
    '<div class="tmpl-swatch" style="background:linear-gradient(135deg,' + t.bg + ',' + t.accent + ')"></div>' + t.label + '</div>'
  ).join('');
}

function _sizeThumbHtml(selectedId, idPrefix, onclickFn) {
  return POSTER_SIZES.map(s => {
    const ar = s.w / s.h;
    const boxW = ar >= 1 ? 44 : Math.round(44 * ar);
    const boxH = ar >= 1 ? Math.round(44 / ar) : 44;
    return '<div class="tmpl-thumb' + (s.id === selectedId ? ' selected' : '') + '" id="' + idPrefix + s.id + '" onclick="' + onclickFn + '(\'' + s.id + '\')" style="display:flex;flex-direction:column;align-items:center;gap:4px">' +
      '<div style="width:' + boxW + 'px;height:' + boxH + 'px;border:2px solid currentColor;border-radius:3px;opacity:0.6"></div>' +
      '<div style="font-size:11px;font-weight:600">' + s.label + '</div>' +
      '<div style="font-size:9px;color:var(--grey)">' + s.sub + '</div></div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   PICKER
══════════════════════════════════════════════════════════════ */
const PICKER = {

  async openForPresentation(cart) {
    if (!cart.length) { toast('Add properties to cart first', 'error'); return; }
    const allCols = new Set();
    const propData = [];
    for (const item of cart) {
      const data   = await RCIRL_DATA.getProperties(item.cat);
      const row    = data.rows.find(r => r._id === item.rowId);
      if (!row) continue;
      const photos = await RCIRL_DATA.getPhotos(item.cat, item.rowId);
      data.columns.filter(c => !c.startsWith('_')).forEach(c => allCols.add(c));
      propData.push({ item, data, row, photos });
    }
    const cols = [...allCols];
    if (!cols.length) { toast('No columns found', 'error'); return; }
    this._showModal('pdf', cols, propData, null);
  },

  async openForPoster(cat, rowId) {
    const data   = await RCIRL_DATA.getProperties(cat);
    const row    = data.rows.find(r => r._id === rowId);
    if (!row) { toast('Property not found', 'error'); return; }
    const photos = await RCIRL_DATA.getPhotos(cat, rowId);
    const cols   = data.columns.filter(c => !c.startsWith('_'));
    this._showModal('poster', cols, null, { cat, rowId, row, data, photos });
  },

  _showModal(mode, cols, propData, posterCtx) {
    const guess = (pats) => cols.find(c => pats.some(p => p.test(c))) || '';
    const gName    = guess([/property.*name|^name$/i]);
    const gLoc     = guess([/area|location/i]);
    const gPrice   = guess([/readable/i]) || guess([/price|rent/i]);
    const gAmenity = guess([/amenities/i]);
    const gRemark  = guess([/remark/i]);
    const gBHK     = guess([/bhk/i]);
    const gSqft    = guess([/total.*sq|sq\.?ft/i]);
    const gType    = guess([/^type$|sub.?type|land.*type/i]);
    const gParking = guess([/parking/i]);

    const opt = (sel, ph) =>
      '<option value="">' + (ph || '— skip —') + '</option>' +
      cols.map(c => '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + c + '</option>').join('');

    const isPdf    = mode === 'pdf';
    const settings = RCIRL_DATA.getSettings();
    const contact  = (settings.phone || '+91 98410 00000').replace(/"/g, '&quot;');

    const checks = cols.map((c, i) =>
      '<div class="col-check-item checked" id="cci-' + i + '" onclick="PICKER.toggleCheck(' + i + ')">' +
      '<input type="checkbox" id="chk-' + i + '" checked onclick="event.stopPropagation()">' +
      '<label for="chk-' + i + '">' + c + '</label></div>'
    ).join('');

    const photoHtml = this._photoHtml(posterCtx ? posterCtx.photos : []);

    const tmplHtml = _tmplThumbHtml(this._selTmpl || 'dark', 'tmpl-', 'PICKER.selectTemplate');

    let propSummary = '';
    if (isPdf && propData) {
      propSummary = '<div style="background:var(--purple-xpale);border-radius:6px;padding:10px 16px;margin-bottom:16px;font-size:13px"><strong>' +
        propData.length + ' propert' + (propData.length > 1 ? 'ies' : 'y') + ':</strong> ' +
        propData.map(p => '<span style="background:var(--purple-pale);color:var(--purple);padding:2px 9px;border-radius:20px;margin:2px;font-size:11px;font-weight:600;display:inline-block">' + (p.row[gName] || 'Property') + '</span>').join('') + '</div>';
    }

    const leftPanel =
      '<h3 style="font-size:14px;font-weight:700;color:var(--purple-dark);margin-bottom:12px">📌 Column Roles</h3>' +
      '<div style="display:flex;flex-direction:column;gap:9px">' +
      '<div class="col-picker-section highlight"><h4>Property Name <span style="color:var(--danger)">*</span></h4><select class="role-select" id="role-name">' + opt(gName, '— select one —') + '</select></div>' +
      '<div class="col-picker-section"><h4>Location / Area</h4><select class="role-select" id="role-loc">' + opt(gLoc) + '</select></div>' +
      '<div class="col-picker-section highlight"><h4>Price</h4><select class="role-select" id="role-price">' + opt(gPrice) + '</select></div>' +
      (isPdf
        ? '<div class="col-picker-section"><h4>Amenities</h4><select class="role-select" id="role-amenity">' + opt(gAmenity) + '</select></div>' +
          '<div class="col-picker-section"><h4>Remarks</h4><select class="role-select" id="role-remark">' + opt(gRemark) + '</select></div>'
        : '<div class="col-picker-section"><h4>Highlight 1</h4><select class="role-select" id="role-h1">' + opt(gBHK) + '</select></div>' +
          '<div class="col-picker-section"><h4>Highlight 2</h4><select class="role-select" id="role-h2">' + opt(gSqft) + '</select></div>' +
          '<div class="col-picker-section"><h4>Highlight 3</h4><select class="role-select" id="role-h3">' + opt(gType) + '</select></div>' +
          '<div class="col-picker-section"><h4>Highlight 4</h4><select class="role-select" id="role-h4">' + opt(gParking) + '</select></div>'
      ) + '</div>';

    const rightPanel = isPdf
      ? '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<h3 style="font-size:14px;font-weight:700;color:var(--purple-dark)">📋 Details Grid</h3>' +
        '<div style="display:flex;gap:6px"><button class="btn btn-xs btn-secondary" onclick="PICKER.checkAll(true)">All</button>' +
        '<button class="btn btn-xs btn-ghost" onclick="PICKER.checkAll(false)">None</button></div></div>' +
        '<p style="font-size:12px;color:var(--grey-dark);margin-bottom:10px">All ticked columns appear in the details grid.</p>' +
        '<div class="col-checklist" id="detail-col-list">' + checks + '</div>'
      : '<h3 style="font-size:14px;font-weight:700;color:var(--purple-dark);margin-bottom:8px">🎨 Template</h3>' +
        '<div class="tmpl-thumb-row">' + tmplHtml + '</div>' +
        '<h3 style="font-size:14px;font-weight:700;color:var(--purple-dark);margin-top:16px;margin-bottom:6px">📷 Photos</h3>' +
        '<p style="font-size:12px;color:var(--grey-dark);margin-bottom:8px">Click to toggle. All selected photos appear in the masonry grid.</p>' +
        '<div id="poster-photo-picker" style="display:flex;flex-wrap:wrap;gap:7px">' + photoHtml + '</div>' +
        '<h3 style="font-size:14px;font-weight:700;color:var(--purple-dark);margin-top:16px;margin-bottom:6px">📞 Contact</h3>' +
        '<input class="form-control" id="picker-contact" value="' + contact + '" style="font-size:13px">';

    const html =
      '<div class="modal-overlay" id="picker-modal"><div class="modal modal-xl">' +
      '<div class="modal-header"><div class="modal-title">' + (isPdf ? '📄 Configure Presentation PDF' : '🎨 Configure Post Design') + '</div>' +
      '<button class="modal-close" onclick="UI.closeModal(\'picker-modal\')">×</button></div>' +
      '<div class="modal-body">' + propSummary +
      '<div class="col-picker-grid"><div>' + leftPanel + '</div><div>' + rightPanel + '</div></div>' +
      '</div><div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="UI.closeModal(\'picker-modal\')">Cancel</button>' +
      '<button class="btn btn-primary" onclick="PICKER.generate(\'' + mode + '\')">' +
      (isPdf ? '📄 Generate PDF Preview' : '🎨 Open Poster Designer →') + '</button>' +
      '</div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    this._mode = mode; this._propData = propData; this._posterCtx = posterCtx; this._cols = cols;
    this._selTmpl = 'dark';
    // Only pre-select the property's own photos; demo photos start unselected
    const ownPhotos = posterCtx ? posterCtx.photos.map(p => p.url) : [];
    this._selPhotos = ownPhotos.length ? [...ownPhotos] : [...DEMO_PHOTOS].slice(0, 1);
  },

  _photoHtml(photos) {
    const ownUrls = new Set(photos.map(p => p.url));
    const all = [
      ...photos.map(p => ({ url: p.url, label: '📷', own: true })),
      ...DEMO_PHOTOS.map((u, i) => ({ url: u, label: 'Demo ' + (i + 1), own: false })),
    ].slice(0, 10);
    if (!all.length) return '<p style="font-size:12px;color:var(--grey)">No photos.</p>';
    return all.map((p) => {
      // Selected by default only if it's a real property photo
      const sel = p.own;
      return '<div onclick="PICKER.togglePhoto(\'' + p.url + '\',this)" data-url="' + p.url + '"' +
        ' style="cursor:pointer;border-radius:6px;overflow:hidden;width:82px;height:62px;position:relative;border:3px solid ' + (sel ? 'var(--purple)' : 'var(--grey-light)') + '">' +
        '<img src="' + p.url + '" style="width:100%;height:100%;object-fit:cover" loading="lazy">' +
        '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);color:#fff;font-size:9px;padding:2px 4px;text-align:center">' + p.label + '</div>' +
        '</div>';
    }).join('');
  },

  togglePhoto(url, el) {
    const idx = this._selPhotos.indexOf(url);
    if (idx === -1) { this._selPhotos.push(url); el.style.borderColor = 'var(--purple)'; }
    else { this._selPhotos.splice(idx, 1); el.style.borderColor = 'var(--grey-light)'; }
  },

  selectTemplate(id) {
    this._selTmpl = id;
    document.querySelectorAll('.tmpl-thumb').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('tmpl-' + id); if (el) el.classList.add('selected');
  },

  toggleCheck(i) {
    const cb = document.getElementById('chk-' + i), item = document.getElementById('cci-' + i);
    if (cb) { cb.checked = !cb.checked; if (item) item.classList.toggle('checked', cb.checked); }
  },

  checkAll(val) {
    document.querySelectorAll('#detail-col-list input[type=checkbox]').forEach((cb, i) => {
      cb.checked = val;
      const item = document.getElementById('cci-' + i); if (item) item.classList.toggle('checked', val);
    });
  },

  _getRoles() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    return { name: g('role-name'), loc: g('role-loc'), price: g('role-price'),
             amenity: g('role-amenity'), remark: g('role-remark'),
             h1: g('role-h1'), h2: g('role-h2'), h3: g('role-h3'), h4: g('role-h4') };
  },

  _getDetailCols() {
    const cols = [];
    document.querySelectorAll('#detail-col-list input[type=checkbox]').forEach((cb, i) => {
      if (cb.checked && this._cols[i]) cols.push(this._cols[i]);
    });
    return cols;
  },

  async generate(mode) {
    const roles      = this._getRoles();
    if (!roles.name) { toast('Please select the Property Name column', 'error'); return; }
    const detailCols = mode === 'pdf' ? this._getDetailCols() : [];
    const contact    = (document.getElementById('picker-contact') || {}).value || '';
    const template   = this._selTmpl;
    const selPhotos  = [...(this._selPhotos || [])];
    UI.closeModal('picker-modal');
    if (mode === 'pdf') {
      await GEN.generatePDF(this._propData, roles, detailCols);
    } else {
      await GEN.openPosterCanvas(this._posterCtx, roles, template, selPhotos, contact);
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   PDF GENERATOR
   Each property = 2 HTML pages rendered by html2canvas.
   Key fix: use page.scrollHeight for full capture, then slice
   into A4 pages in jsPDF.
══════════════════════════════════════════════════════════════ */
const GEN = {

  /* ── PDF: native jsPDF drawing — no html2canvas, no CORS, no viewport issues ── */

  async generatePDF(propData, roles, detailCols) {
    const settings  = RCIRL_DATA.getSettings();
    this._pdfData   = { propData, roles, detailCols, settings };

    const preview = propData.map(p => {
      const name  = p.row[roles.name] || 'Property';
      const price = roles.price ? (p.row[roles.price] || '') : '';
      const loc   = roles.loc   ? (p.row[roles.loc]   || '') : '';
      return '<div style="background:#fff;border-radius:8px;padding:12px 16px;margin-bottom:8px;border-left:4px solid #5B2D8E;display:flex;justify-content:space-between;align-items:center">' +
        '<div><div style="font-size:15px;font-weight:700;color:#3E1A6B">' + name + '</div>' +
        (loc ? '<div style="font-size:12px;color:#9E9E9E;margin-top:2px">&#128205; ' + loc + '</div>' : '') +
        '</div>' +
        (price ? '<div style="background:#5B2D8E;color:#fff;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:700">' + price + '</div>' : '') +
        '</div>';
    }).join('');

    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal-overlay" id="pdf-modal"><div class="modal modal-lg">' +
      '<div class="modal-header"><div class="modal-title">&#128196; Generate Presentation (' + propData.length + ' propert' + (propData.length > 1 ? 'ies' : 'y') + ')</div>' +
      '<button class="modal-close" onclick="UI.closeModal(&quot;pdf-modal&quot;)">&#215;</button></div>' +
      '<div class="modal-body" style="padding:20px;background:#f5f0fb">' +
      '<p style="font-size:13px;color:#666;margin-bottom:14px">Layout: landscape, white background, poster-style. Each property starts on a new page.</p>' +
      preview + '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="UI.closeModal(&quot;pdf-modal&quot;)">Cancel</button>' +
      '<button class="btn btn-primary" id="pdf-dl-btn" onclick="GEN.downloadPDF()">&#11015;&#65039; Download PDF</button>' +
      '</div></div></div>');
  },

  async _waitForImages(selector) {
    const imgs = document.querySelectorAll((selector || 'body') + ' img');
    await Promise.all([...imgs].map(img =>
      img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
    ));
  },

  async downloadPDF() {
    const btn = document.getElementById('pdf-dl-btn');
    btn.innerHTML = '<span class="spinner"></span> Building PDF…';
    btn.disabled  = true;

    try {
      const { propData, roles, detailCols, settings } = this._pdfData;

      // ── A4 Landscape at 96dpi ────────────────────────────────
      // A4 landscape = 297mm × 210mm = 1122px × 793px at 96dpi
      const PAGE_W = 1122;
      const PAGE_H = 793;
      const PAD    = 48;
      const COL1   = 340;  // left column width (photo)
      const GAP    = 24;
      const COL2   = PAGE_W - COL1 - GAP - PAD * 2; // right column

      const contact = [settings.phone, settings.email, settings.website].filter(Boolean).join('  ·  ');
      const coName  = settings.companyName || 'RCIRL Property Consultant';

      // ── Off-screen render container ──────────────────────────
      // Fixed position, left: -9999px so it's never visible but fully rendered
      const container = document.createElement('div');
      container.id    = 'pdf-offscreen';
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + PAGE_W + 'px;background:#fff;z-index:-1;';
      document.body.appendChild(container);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      let firstPage = true;

      for (let idx = 0; idx < propData.length; idx++) {
        const { item, row, photos } = propData[idx];
        const meta      = RCIRL_DATA.getAllCategories()[item.cat];
        const propName  = row[roles.name] || 'Property';
        const location  = roles.loc    ? (row[roles.loc]    || '') : '';
        const price     = roles.price  ? (row[roles.price]  || '') : '';
        const amenities = roles.amenity && row[roles.amenity]
          ? row[roles.amenity].split(',').map(a => a.trim()).filter(Boolean) : [];
        const remark    = roles.remark ? (row[roles.remark] || '') : '';
        const roleVals  = new Set([roles.name, roles.loc, roles.price, roles.amenity, roles.remark].filter(Boolean));
        const showCols  = detailCols.filter(c => !c.startsWith('_') && !roleVals.has(c) && row[c] !== undefined && String(row[c]).trim() !== '');
        const photoList = photos.length ? photos : [{ url: DEMO_PHOTOS[idx % DEMO_PHOTOS.length] }];

        // ── Build amenity chips HTML ───────────────────────────
        const chipHtml = amenities.map(a =>
          '<span style="display:inline-block;background:#EDE7F6;color:#5B2D8E;padding:5px 12px;border-radius:20px;font-size:13px;font-weight:600;margin:3px 4px 3px 0;border:1px solid #C8B4E8">' + a + '</span>'
        ).join('');

        // ── Detail cells — 3-column grid ──────────────────────
        const cellHtml = showCols.map(c =>
          '<div style="background:#F5F0FB;border-radius:8px;padding:10px 14px;min-height:52px">' +
          '<div style="font-size:10px;font-weight:700;color:#9E9E9E;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">' + c + '</div>' +
          '<div style="font-size:14px;font-weight:600;color:#1A1A2E;line-height:1.3">' + (row[c] || '—') + '</div>' +
          '</div>'
        ).join('');

        // ── Gallery photos (2-col grid, natural proportions) ──
        const galleryPhotos = photoList.slice(1);
        const galleryHtml   = galleryPhotos.length
          ? '<div style="columns:2;column-gap:10px;margin-top:14px">' +
            galleryPhotos.map(p =>
              '<div style="break-inside:avoid;margin-bottom:10px;border-radius:8px;overflow:hidden;line-height:0">' +
              '<img src="' + p.url + '" style="width:100%;height:auto;display:block" crossorigin="anonymous">' +
              '</div>'
            ).join('') + '</div>'
          : '';

        // ── Compose the full page HTML ─────────────────────────
        const pageHtml =
          '<div style="width:' + PAGE_W + 'px;background:#fff;font-family:Inter,Arial,sans-serif;box-sizing:border-box;padding:' + PAD + 'px ' + PAD + 'px ' + (PAD + 36) + 'px ' + PAD + 'px;position:relative">' +

          // ── HEADER ──────────────────────────────────────────
          '<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:3px solid #5B2D8E;margin-bottom:20px">' +
          '<img src="assets/logo.png" style="height:52px;width:auto;display:block" crossorigin="anonymous" onerror="this.style.display=\'none\'">' +
          '<div style="font-size:15px;font-weight:700;color:#5B2D8E">' + (settings.phone || '') + '</div>' +
          '</div>' +

          // ── BODY: two columns ────────────────────────────────
          '<div style="display:flex;gap:' + GAP + 'px;align-items:flex-start">' +

          // LEFT: hero image (natural proportions, fills column width)
          '<div style="width:' + COL1 + 'px;flex-shrink:0">' +
          '<img src="' + photoList[0].url + '" style="width:100%;height:auto;display:block;border-radius:10px" crossorigin="anonymous">' +
          (galleryHtml ? galleryHtml : '') +
          '</div>' +

          // RIGHT: all text content
          '<div style="flex:1;min-width:0">' +

          // Property name + meta
          '<div style="font-size:11px;font-weight:700;color:#9E9E9E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">' +
          (meta ? meta.label : '') + '</div>' +
          '<div style="font-size:28px;font-weight:800;color:#3E1A6B;line-height:1.15;margin-bottom:6px">' + propName + '</div>' +
          (location ? '<div style="font-size:14px;color:#9E9E9E;margin-bottom:8px">&#128205; ' + location + '</div>' : '') +
          (price    ? '<div style="display:inline-block;background:#5B2D8E;color:#fff;padding:6px 16px;border-radius:8px;font-size:17px;font-weight:800;margin-bottom:14px">' + price + '</div>' : '') +

          // Amenities
          (amenities.length
            ? '<div style="font-size:10px;font-weight:700;color:#5B2D8E;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;margin-top:4px">&#10024; Amenities &amp; Features</div>' +
              '<div style="margin-bottom:14px">' + chipHtml + '</div>'
            : '') +

          // Details grid — 3 columns
          (showCols.length
            ? '<div style="font-size:10px;font-weight:700;color:#5B2D8E;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">&#128203; Property Details</div>' +
              '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' + cellHtml + '</div>'
            : '') +

          // Remarks
          (remark
            ? '<div style="font-size:10px;font-weight:700;color:#5B2D8E;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">&#128172; Remarks</div>' +
              '<div style="background:#F5F0FB;border-radius:8px;padding:12px 15px;font-size:13px;color:#333;border-left:4px solid #5B2D8E;margin-bottom:14px">' + remark + '</div>'
            : '') +

          '</div></div>' + // end right col + body

          // ── FOOTER ──────────────────────────────────────────
          '<div style="background:#5B2D8E;margin:24px -' + PAD + 'px -' + (PAD+36) + 'px -' + PAD + 'px;padding:12px ' + PAD + 'px;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-size:12px;color:rgba(255,255,255,0.85)">' + (settings.email || '') + (settings.website ? '  ·  ' + settings.website : '') + '</div>' +
          '<div style="font-size:13px;font-weight:700;color:#fff;text-align:center">' + coName + '</div>' +
          '<div style="font-size:12px;color:rgba(255,255,255,0.85);text-align:right">' + (settings.address || settings.phone || '') + '</div>' +
          '</div>' +

          '</div>'; // end page

        // ── Render this page off-screen ───────────────────────
        container.innerHTML = pageHtml;

        // Wait for all images to load
        await new Promise(res => setTimeout(res, 100));
        await this._waitForImages('#pdf-offscreen');
        await new Promise(res => setTimeout(res, 200));

        // Capture at exact page dimensions
        // Let content be as tall as it needs — no height constraint
        const pageEl  = container.firstElementChild;
        const fullH   = pageEl.scrollHeight;
        const canvas = await html2canvas(pageEl, {
          scale:        2,
          useCORS:      true,
          allowTaint:   true,
          backgroundColor: '#ffffff',
          width:        PAGE_W,
          height:       fullH,
          windowWidth:  PAGE_W,
          windowHeight: fullH,
          logging:      false,
          scrollX:      0,
          scrollY:      0,
        });

        const imgData  = canvas.toDataURL('image/jpeg', 0.93);
        // Width fixed at 297mm (A4 landscape width)
        // Height = proportional to canvas — content always fully visible
        const A4W     = 297;
        const contentH = (canvas.height / canvas.width) * A4W;

        if (firstPage) {
          // Recreate PDF with exact first page dimensions
          Object.assign(pdf, new jsPDF({ orientation: 'landscape', unit: 'mm', format: [A4W, contentH] }));
          // Simpler: just use addImage on the already-created pdf
          pdf.deletePage(1);
          pdf.addPage([A4W, contentH], 'landscape');
        } else {
          pdf.addPage([A4W, contentH], 'landscape');
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, A4W, contentH);
        firstPage = false;
      }

      // Clean up off-screen div
      container.remove();

      const cart     = UI.presentCart;
      const filename = 'RCIRL_Presentation_' + cart.map(c => slugify(c.name)).join('-').slice(0,40) + '_' + dtString() + '.pdf';
      pdf.save(filename);
      await RCIRL_DATA.saveOutput(pdf.output('blob'), filename, 'pdf', cart.map(c => c.name));
      toast('PDF downloaded & saved!', 'success');
      UI.presentCart = [];
      UI.closeModal('pdf-modal');
      UI.renderPresentation();
    } catch(e) { toast('PDF error: ' + e.message, 'error'); console.error(e); }

    if (document.getElementById('pdf-offscreen')) document.getElementById('pdf-offscreen').remove();
    btn.innerHTML = '&#11015;&#65039; Download PDF';
    btn.disabled  = false;
  },

  async openPosterCanvas(ctx, roles, template, selPhotos, contact) {
    const { cat, rowId, row } = ctx;
    const propName = row[roles.name] || 'Property';
    const location = roles.loc   ? (row[roles.loc]   || '') : '';
    const price    = roles.price ? (row[roles.price] || '') : '';
    const h1 = roles.h1 ? (row[roles.h1] || '') : '';
    const h2 = roles.h2 ? (row[roles.h2] || '') : '';
    const h3 = roles.h3 ? (row[roles.h3] || '') : '';
    const h4 = roles.h4 ? (row[roles.h4] || '') : '';

    this._pCtx      = { cat, rowId, propName };
    this._pTemplate = template;
    this._pSize     = this._pSize || 'square';
    this._pPhotos   = selPhotos;
    this._pImgs     = [];
    // Preload logo for canvas drawing
    if (!this._logoImg) {
      this._logoImg = new Image();
      this._logoImg.crossOrigin = 'anonymous';
      this._logoImg.src = 'assets/logo.png';
    }

    const allPhotos = [
      ...ctx.photos.map(p   => ({ url: p.url,  label: '📷' })),
      ...DEMO_PHOTOS.map((u, i) => ({ url: u, label: 'Demo ' + (i + 1) })),
    ].slice(0, 10);

    const photoThumbs = allPhotos.map(p => {
      const sel = selPhotos.includes(p.url);
      return '<img src="' + p.url + '" onclick="GEN.togglePosterPhoto(\'' + p.url + '\',this)" ' +
        'data-url="' + p.url + '" loading="lazy" ' +
        'style="width:58px;height:44px;object-fit:cover;border-radius:5px;cursor:pointer;border:3px solid ' + (sel ? 'var(--purple)' : 'var(--grey-light)') + '">';
    }).join('');

    const tmplHtml = _tmplThumbHtml(template, 'pt-', 'GEN.setTemplate');
    const sizeHtml = _sizeThumbHtml(this._pSize, 'sz-', 'GEN.setSize');

    const html =
      '<div class="modal-overlay" id="poster-modal"><div class="modal modal-xl">' +
      '<div class="modal-header"><div class="modal-title">🎨 Post Designer — ' + propName + '</div>' +
      '<button class="modal-close" onclick="UI.closeModal(\'poster-modal\')">×</button></div>' +
      '<div class="modal-body"><div style="display:grid;grid-template-columns:270px 1fr;gap:20px;align-items:start">' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="form-group"><label class="form-label">Size</label>' +
      '<div class="tmpl-thumb-row" style="grid-template-columns:repeat(4,1fr)">' + sizeHtml + '</div></div>' +
      '<div class="form-group"><label class="form-label">Template</label>' +
      '<div class="tmpl-thumb-row" style="grid-template-columns:repeat(2,1fr)">' + tmplHtml + '</div></div>' +
      '<div class="form-group"><label class="form-label">Property Name</label>' +
      '<input class="form-control" id="p-name" value="' + propName.replace(/"/g, '&quot;') + '" oninput="GEN.redraw()"></div>' +
      '<div class="form-group"><label class="form-label">Location</label>' +
      '<input class="form-control" id="p-loc" value="' + location.replace(/"/g, '&quot;') + '" oninput="GEN.redraw()"></div>' +
      '<div class="form-group"><label class="form-label">Price</label>' +
      '<input class="form-control" id="p-price" value="' + price.replace(/"/g, '&quot;') + '" oninput="GEN.redraw()"></div>' +
      '<div class="form-group"><label class="form-label">Highlights</label>' +
      '<input class="form-control mb-8" id="p-h1" data-label="' + (roles.h1 || '') + '" value="' + h1.replace(/"/g, '&quot;') + '" placeholder="e.g. 3 BHK" oninput="GEN.redraw()">' +
      '<input class="form-control mb-8" id="p-h2" data-label="' + (roles.h2 || '') + '" value="' + h2.replace(/"/g, '&quot;') + '" placeholder="e.g. 1450 Sq.Ft." oninput="GEN.redraw()">' +
      '<input class="form-control mb-8" id="p-h3" data-label="' + (roles.h3 || '') + '" value="' + h3.replace(/"/g, '&quot;') + '" placeholder="e.g. Apartment" oninput="GEN.redraw()">' +
      '<input class="form-control" id="p-h4" data-label="' + (roles.h4 || '') + '" value="' + h4.replace(/"/g, '&quot;') + '" placeholder="e.g. 2 Covered" oninput="GEN.redraw()"></div>' +
      '<div class="form-group"><label class="form-label">Contact</label>' +
      '<input class="form-control" id="p-contact" value="' + contact.replace(/"/g, '&quot;') + '" oninput="GEN.redraw()"></div>' +
      '<div class="form-group"><label class="form-label">Photos (click to toggle)</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px" id="poster-img-picker">' + photoThumbs + '</div>' +
      '<input type="file" accept="image/*" multiple onchange="GEN.uploadPhotos(event)" style="font-size:11px"></div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center">' +
      '<p style="font-size:12px;color:var(--grey);margin-bottom:10px" id="poster-size-label">' + this._sizeLabel() + '</p>' +
      '<div style="background:#2a2a2a;padding:12px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">' +
      '<canvas id="poster-canvas" width="' + this._sizeW() + '" height="' + this._sizeH() + '" style="' + this._canvasDisplayStyle() + '"></canvas></div>' +
      '<p style="font-size:11px;color:var(--grey);margin-top:8px" id="poster-size-sub">' + this._sizeSub() + '</p></div>' +
      '</div></div>' +
      '<div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal(\'poster-modal\')">Cancel</button>' +
      '<button class="btn btn-primary" onclick="GEN.downloadPoster()">⬇️ Download 1080×1080 JPG</button>' +
      '</div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    await this._loadImages(selPhotos);
    this.redraw();
  },

  togglePosterPhoto(url, el) {
    const idx = this._pPhotos.indexOf(url);
    if (idx === -1) { this._pPhotos.push(url); el.style.borderColor = 'var(--purple)'; }
    else { this._pPhotos.splice(idx, 1); el.style.borderColor = 'var(--grey-light)'; }
    this._loadImages(this._pPhotos).then(() => this.redraw());
  },

  async uploadPhotos(event) {
    for (const file of Array.from(event.target.files)) {
      const url = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file); });
      this._pPhotos.push(url);
    }
    await this._loadImages(this._pPhotos); this.redraw();
  },

  async _loadImages(urls) {
    const loaded = await Promise.all(urls.map(url => new Promise(res => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => res(img); img.onerror = () => res(null); img.src = url;
    })));
    this._pImgs = loaded.filter(Boolean);
  },

  setTemplate(id) {
    this._pTemplate = id;
    document.querySelectorAll('.tmpl-thumb[id^="pt-"]').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('pt-' + id); if (el) el.classList.add('selected');
    this.redraw();
  },

  _curSize() { return POSTER_SIZES.find(s => s.id === this._pSize) || POSTER_SIZES[0]; },
  _sizeW() { return this._curSize().w; },
  _sizeH() { return this._curSize().h; },
  _sizeLabel() { const s = this._curSize(); return 'Live preview — ' + s.w + '×' + s.h + ' px'; },
  _sizeSub()   { const s = this._curSize(); const parts = s.sub.split('·'); return s.w + '×' + s.h + ' px' + (parts[1] ? ' — ' + parts[1].trim() : ' — ' + s.sub); },

  /* Fits the canvas into a preview box (max 420 wide, 460 tall) without
     distorting the aspect ratio — portrait sizes scale by height, square/
     landscape scale by width. */
  _canvasDisplayStyle() {
    const s = this._curSize();
    const maxW = 420, maxH = 460;
    const scale = Math.min(maxW / s.w, maxH / s.h);
    const dw = Math.round(s.w * scale), dh = Math.round(s.h * scale);
    return 'width:' + dw + 'px;height:' + dh + 'px;display:block;border-radius:8px';
  },

  setSize(id) {
    this._pSize = id;
    document.querySelectorAll('.tmpl-thumb[id^="sz-"]').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('sz-' + id); if (el) el.classList.add('selected');

    const canvas = document.getElementById('poster-canvas');
    if (canvas) {
      canvas.width = this._sizeW(); canvas.height = this._sizeH();
      canvas.setAttribute('style', this._canvasDisplayStyle());
    }
    const lbl = document.getElementById('poster-size-label'); if (lbl) lbl.textContent = this._sizeLabel();
    const sub = document.getElementById('poster-size-sub');   if (sub) sub.textContent = this._sizeSub();
    this.redraw();
  },

  /* ── Canvas masonry layout helper ──────────────────────────
     numCols: 1 if 1 photo, 2 if 2 photos, 3 if 3+
     Returns array of {img, x, y, w, h} all in canvas px
     where h = natural height at column width (no cropping)
  ─────────────────────────────────────────────────────────── */
  _masonryLayout(imgs, totalW, numCols, gap) {
    if (!imgs.length) return { items: [], totalH: 0 };
    const colW  = (totalW - gap * (numCols - 1)) / numCols;
    const colHs = new Array(numCols).fill(0);
    const items = [];
    imgs.forEach(img => {
      const naturalH = (img.height / img.width) * colW; // true natural height at colW
      // Pick shortest column
      const col = colHs.indexOf(Math.min(...colHs));
      items.push({ img, x: col * (colW + gap), y: colHs[col], w: colW, h: naturalH });
      colHs[col] += naturalH + gap;
    });
    return { items, totalH: Math.max(...colHs) - gap };
  },

  redraw() {
    const canvas = document.getElementById('poster-canvas');
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const size = this._curSize();
    const W = size.w, H = size.h;
    const SCALE = W / 1080; // keeps text/padding proportional across sizes

    const v   = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const name    = v('p-name');
    const loc     = v('p-loc');
    const price   = v('p-price');
    const contact = v('p-contact');
    const hl      = [v('p-h1'), v('p-h2'), v('p-h3'), v('p-h4')].filter(Boolean);
    const hlLabels = ['p-h1','p-h2','p-h3','p-h4'].map(id => {
      const el = document.getElementById(id); return el ? (el.dataset.label || '') : '';
    }).filter((_, i) => !!(['p-h1','p-h2','p-h3','p-h4'].map(id => v(id))[i]));
    const imgs = this._pImgs || [];

    const t = POSTER_TEMPLATES[this._pTemplate] || POSTER_TEMPLATES.dark;
    const d = { name, loc, price, contact, hl, hlLabels, imgs };

    if (size.landscape) this._drawLandscape(ctx, W, H, SCALE, t, d);
    else this._drawStacked(ctx, W, H, SCALE, t, d);
  },

  /* Stacked layout: photo grid on top, info below, bottom contact bar.
     Used for Square (1080×1080) and Story (1080×1920). */
  _drawStacked(ctx, W, H, SCALE, t, d) {
    const { name, loc, price, contact, hl, hlLabels, imgs } = d;
    const px = n => n * SCALE;

    const BTMBAR_H = px(84), PAD = px(40), GAP = px(8), INFO_PAD = px(20);

    let infoH = INFO_PAD;
    infoH += px(58) * Math.min(2, Math.ceil(name.length / 22) || 1);
    if (loc)   infoH += px(36);
    if (price) infoH += px(58);
    if (hl.length) infoH += Math.ceil(hl.length / 2) * px(70);
    infoH += px(16);

    const BRAND_H = px(78);
    const GRID_Y  = BRAND_H;
    const GRID_MAX_H = Math.max(px(60), H - BRAND_H - infoH - BTMBAR_H);
    const INFO_Y  = H - infoH - BTMBAR_H;

    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = t.accent; ctx.fillRect(0, 0, W, px(6));

    ctx.fillStyle = t.bg; ctx.fillRect(0, px(6), W, BRAND_H - px(6));
    if (this._logoImg && this._logoImg.complete && this._logoImg.naturalWidth > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(PAD - px(4), px(8), px(180), px(58));
      const lh = px(52), lw = (this._logoImg.naturalWidth / this._logoImg.naturalHeight) * lh;
      ctx.drawImage(this._logoImg, PAD - px(2), px(10), lw, lh);
    } else {
      ctx.fillStyle = t.tx; ctx.font = 'bold ' + px(36) + 'px Inter,Arial';
      ctx.fillText('RCIRL', PAD, px(46));
      ctx.font = '400 ' + px(14) + 'px Inter,Arial'; ctx.fillStyle = t.sub;
      ctx.fillText('PROPERTY CONSULTANT', PAD, px(62));
    }
    ctx.strokeStyle = t.accent; ctx.lineWidth = px(2);
    ctx.beginPath(); ctx.moveTo(PAD, px(72)); ctx.lineTo(PAD + px(240), px(72)); ctx.stroke();

    const numCols = imgs.length <= 1 ? 1 : imgs.length === 2 ? 2 : 3;
    const gridW   = W - PAD * 2;

    if (imgs.length === 0) {
      ctx.fillStyle = t.chip;
      ctx.fillRect(PAD, GRID_Y, gridW, GRID_MAX_H);
      ctx.fillStyle = t.sub; ctx.font = '400 ' + px(24) + 'px Inter,Arial'; ctx.textAlign = 'center';
      ctx.fillText('No photos selected', W / 2, GRID_Y + GRID_MAX_H / 2);
      ctx.textAlign = 'left';
    } else {
      const layout = this._masonryLayout(imgs, gridW, numCols, GAP);
      const scale  = layout.totalH > GRID_MAX_H ? GRID_MAX_H / layout.totalH : 1;
      layout.items.forEach(item => {
        const x = PAD + item.x * scale, y = GRID_Y + item.y * scale;
        const w = item.w * scale, h = item.h * scale;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, w, h, px(5)) : ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(item.img, x, y, w, h);
        ctx.restore();
      });
    }

    ctx.fillStyle = t.accent; ctx.fillRect(PAD, INFO_Y - px(3), gridW, px(2));

    let cy = INFO_Y + INFO_PAD;
    ctx.fillStyle = t.tx; ctx.font = 'bold ' + px(48) + 'px Inter,Arial';
    const words = name.split(' '); let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > W - PAD * 2 && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach(l => { ctx.fillText(l, PAD, cy + px(44)); cy += px(54); });

    if (loc) {
      ctx.font = '400 ' + px(23) + 'px Inter,Arial'; ctx.fillStyle = t.sub;
      ctx.fillText('📍 ' + loc, PAD, cy + px(28)); cy += px(36);
    }

    if (price) {
      ctx.font = 'bold ' + px(27) + 'px Inter,Arial';
      const pw = ctx.measureText(price).width + px(34);
      ctx.fillStyle = t.accent; rrect(ctx, PAD, cy + px(4), pw, px(48), px(8)); ctx.fill();
      ctx.fillStyle = t.onAccent;
      ctx.fillText(price, PAD + px(17), cy + px(36)); cy += px(58);
    }

    if (hl.length) {
      const cW = (W - PAD * 2 - px(14)) / 2, cH = px(62);
      hl.forEach((h, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const cx  = PAD + col * (cW + px(14));
        const cy2 = cy  + row * (cH + px(8));
        ctx.fillStyle = t.chip; rrect(ctx, cx, cy2, cW, cH, px(7)); ctx.fill();
        const lbl = hlLabels[i] || '';
        if (lbl) {
          ctx.fillStyle = t.sub; ctx.font = '500 ' + px(16) + 'px Inter,Arial';
          ctx.fillText(lbl.toUpperCase(), cx + px(13), cy2 + px(22));
        }
        ctx.fillStyle = t.chipTx; ctx.font = '700 ' + px(22) + 'px Inter,Arial';
        ctx.fillText(h, cx + px(13), cy2 + (lbl ? px(46) : px(38)));
      });
    }

    ctx.fillStyle = t.accent; ctx.fillRect(0, H - BTMBAR_H, W, BTMBAR_H);
    ctx.fillStyle = t.onAccent; ctx.font = 'bold ' + px(22) + 'px Inter,Arial';
    ctx.fillText('RCIRL Property Consultant', PAD, H - BTMBAR_H + px(30));
    ctx.font = '400 ' + px(19) + 'px Inter,Arial';
    ctx.fillStyle = t.onAccent === '#fff' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.fillText(contact, PAD, H - BTMBAR_H + px(56));
    ctx.textAlign = 'right'; ctx.font = '400 ' + px(17) + 'px Inter,Arial';
    ctx.fillStyle = t.onAccent === '#fff' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.fillText('www.rcirl.in', W - PAD, H - BTMBAR_H + px(56)); ctx.textAlign = 'left';
  },

  /* Landscape layout: hero photo left, info right, used for Facebook
     (1200×630) and LinkedIn (1200×627) where there's no room to stack. */
  _drawLandscape(ctx, W, H, SCALE, t, d) {
    const { name, loc, price, contact, hl, hlLabels, imgs } = d;
    const px = n => n * SCALE;

    const PAD = px(32), BRAND_H = px(58), BTMBAR_H = px(54), GAP = px(24);

    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = t.accent; ctx.fillRect(0, 0, W, px(4));

    ctx.fillStyle = t.tx; ctx.font = 'bold ' + px(22) + 'px Inter,Arial';
    ctx.fillText('RCIRL', PAD, px(34));
    ctx.font = '400 ' + px(10) + 'px Inter,Arial'; ctx.fillStyle = t.sub;
    ctx.fillText('PROPERTY CONSULTANT', PAD, px(48));

    const midY = BRAND_H, midH = H - BRAND_H - BTMBAR_H;
    const photoW = (W - PAD * 2 - GAP) * 0.44;
    const infoX  = PAD + photoW + GAP;
    const infoW  = W - PAD - infoX;

    if (imgs.length) {
      const img = imgs[0];
      const scale = Math.max(photoW / img.width, midH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(PAD, midY, photoW, midH, px(8)) : ctx.rect(PAD, midY, photoW, midH);
      ctx.clip();
      ctx.drawImage(img, PAD - (dw - photoW) / 2, midY - (dh - midH) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = t.chip; ctx.fillRect(PAD, midY, photoW, midH);
      ctx.fillStyle = t.sub; ctx.font = '400 ' + px(16) + 'px Inter,Arial'; ctx.textAlign = 'center';
      ctx.fillText('No photo', PAD + photoW / 2, midY + midH / 2);
      ctx.textAlign = 'left';
    }

    let cy = midY + px(8);
    ctx.fillStyle = t.tx; ctx.font = 'bold ' + px(28) + 'px Inter,Arial';
    const words = name.split(' '); let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > infoW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach(l => { ctx.fillText(l, infoX, cy + px(26)); cy += px(34); });

    if (loc) {
      ctx.font = '400 ' + px(15) + 'px Inter,Arial'; ctx.fillStyle = t.sub;
      ctx.fillText('📍 ' + loc, infoX, cy + px(16)); cy += px(24);
    }

    if (price) {
      ctx.font = 'bold ' + px(19) + 'px Inter,Arial';
      const pw = ctx.measureText(price).width + px(26);
      ctx.fillStyle = t.accent; rrect(ctx, infoX, cy + px(6), pw, px(34), px(7)); ctx.fill();
      ctx.fillStyle = t.onAccent;
      ctx.fillText(price, infoX + px(13), cy + px(29)); cy += px(48);
    }

    if (hl.length) {
      const rowH = px(34);
      hl.slice(0, 4).forEach((h, i) => {
        const cy2 = cy + i * (rowH + px(6));
        if (cy2 + rowH > midY + midH) return; // out of room, skip rest
        ctx.fillStyle = t.chip; rrect(ctx, infoX, cy2, infoW, rowH, px(6)); ctx.fill();
        const lbl = hlLabels[i] || '';
        ctx.fillStyle = t.chipTx; ctx.font = '700 ' + px(14) + 'px Inter,Arial';
        ctx.fillText((lbl ? lbl.toUpperCase() + ':  ' : '') + h, infoX + px(10), cy2 + rowH * 0.65);
      });
    }

    ctx.fillStyle = t.accent; ctx.fillRect(0, H - BTMBAR_H, W, BTMBAR_H);
    ctx.fillStyle = t.onAccent; ctx.font = 'bold ' + px(15) + 'px Inter,Arial';
    ctx.fillText('RCIRL Property Consultant', PAD, H - BTMBAR_H + px(22));
    ctx.font = '400 ' + px(13) + 'px Inter,Arial';
    ctx.fillStyle = t.onAccent === '#fff' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.fillText(contact, PAD, H - BTMBAR_H + px(40));
    ctx.textAlign = 'right'; ctx.font = '400 ' + px(12) + 'px Inter,Arial';
    ctx.fillStyle = t.onAccent === '#fff' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.fillText('www.rcirl.in', W - PAD, H - BTMBAR_H + px(40)); ctx.textAlign = 'left';
  },

  async downloadPoster() {
    const canvas = document.getElementById('poster-canvas');
    if (!canvas) return;
    const propName = this._pCtx ? this._pCtx.propName : 'Property';
    const cat      = this._pCtx ? this._pCtx.cat : 'property';
    const sizeId   = (this._curSize() || {}).id || 'square';
    const filename = 'RCIRL_Post_' + slugify(cat) + '_' + slugify(propName) + '_' + sizeId + '_' + dtString() + '.jpg';
    const dataUrl  = canvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click();
    const res = await fetch(dataUrl); const blob = await res.blob();
    await RCIRL_DATA.saveOutput(blob, filename, 'jpg', [propName]);
    toast('Poster downloaded & saved to Outputs!', 'success');
    UI.closeModal('poster-modal');
    if (UI.currentPage === 'outputs') UI.renderOutputs();
  },
};
