/* ═══════════════════════════════════════════════════════════════
   RCIRL v2 — UI Layer (async, server-backed)
   ═══════════════════════════════════════════════════════════════ */

const UI = {

  currentPage:   'property-list',
  currentCat:    { 'property-list': 'residential', 'presentation': 'residential', 'post-design': 'residential' },
  presentCart:   [],
  activeFilters: {},
  searchQuery:   '',
  _posterBgImg:  null,

  /* ══════════════════════════════════════════════════════════
     NAV
  ══════════════════════════════════════════════════════════ */
  navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.page-section').forEach(el =>
      el.classList.toggle('active', el.id === 'page-' + page));
    const m = PAGE_META[page] || { title: page, sub: '' };
    document.getElementById('top-bar-title').textContent    = m.title;
    document.getElementById('top-bar-subtitle').textContent = m.sub;
    this.renderPage(page);
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.sidebar-overlay').classList.remove('visible');
  },

  renderPage(page) {
    switch(page) {
      case 'property-list': this.renderPropertyList(); break;
      case 'presentation':  this.renderPresentation(); break;
      case 'post-design':   this.renderPostDesign();   break;
      case 'outputs':       this.renderOutputs();      break;
      case 'settings':      this.renderSettings();     break;
    }
  },

  /* ══════════════════════════════════════════════════════════
     CATEGORY TABS
  ══════════════════════════════════════════════════════════ */
  async renderCatTabs(page, containerId) {
    const cats    = RCIRL_DATA.getAllCategories();
    const current = this.currentCat[page] || Object.keys(cats)[0];
    const el      = document.getElementById(containerId);
    if (!el) return;

    // Get counts from cache where possible
    let html = '';
    for (const [key, meta] of Object.entries(cats)) {
      const data  = RCIRL_DATA._cache[key] || { rows: [] };
      const count = data.rows ? data.rows.length : '…';
      const act   = key === current ? 'active' : '';
      html += `<button class="cat-tab ${act}" onclick="UI.switchCat('${page}','${key}')" data-cat="${key}">
        <span class="cat-icon">${meta.icon}</span>${meta.label}
        <span class="cat-count">${count}</span>
      </button>`;
    }
    el.innerHTML = html;
  },

  switchCat(page, cat) {
    this.currentCat[page] = cat;
    this.activeFilters    = {};
    this.searchQuery      = '';
    const input = document.getElementById(page === 'property-list' ? 'pl-search' : page === 'presentation' ? 'pres-search' : 'pd-search');
    if (input) input.value = '';
    this.renderPage(page);
  },

  /* ══════════════════════════════════════════════════════════
     PROPERTY LIST
  ══════════════════════════════════════════════════════════ */
  async renderPropertyList() {
    await this.renderCatTabs('property-list', 'pl-cat-tabs');
    this.renderFilterBar('pl-filters', 'property-list');
    await this.renderPropertyStats();
    await this.renderPropertyTable();
  },

  async renderPropertyStats() {
    const cats = RCIRL_DATA.getAllCategories();
    const el   = document.getElementById('pl-stats');
    if (!el) return;
    let html = '';
    for (const [key, meta] of Object.entries(cats)) {
      const data = await RCIRL_DATA.getProperties(key);
      const cls  = { residential:'s-res', commercial:'s-com', industrial:'s-ind', land:'s-land' }[key] || '';
      html += `<div class="stat-card ${cls}">
        <span class="stat-icon">${meta.icon}</span>
        <span class="stat-num">${data.rows.length}</span>
        <span class="stat-label">${meta.label} Properties</span>
      </div>`;
    }
    el.innerHTML = html;
  },

  renderFilterBar(containerId, page) {
    const cat      = this.currentCat[page];
    const settings = RCIRL_DATA.getSettings();
    const filters  = settings.filters && settings.filters[cat] ? settings.filters[cat] : {};
    const el       = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = Object.entries(filters).map(([col, opts]) => {
      const val = this.activeFilters[col] || '';
      return `<select class="filter-select" onchange="UI.setFilter('${col}',this.value,'${page}')">
        <option value="__all__">All ${col}</option>
        ${opts.map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
      </select>`;
    }).join('');
  },

  setFilter(col, val, page) {
    if (val === '__all__') delete this.activeFilters[col];
    else this.activeFilters[col] = val;
    this.renderPage(page);
  },

  async renderPropertyTable() {
    const cat = this.currentCat['property-list'];
    const el  = document.getElementById('pl-table-wrap');
    if (!el) return;

    el.innerHTML = `<div class="table-loading"><span class="spinner-purple"></span> Loading properties…</div>`;
    const { columns, rows } = await RCIRL_DATA.searchRows(cat, this.searchQuery, this.activeFilters);

    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">🔍</span><h3>No properties found</h3><p>Try adjusting your search or filters, or add a new property</p></div>`;
      return;
    }

    const nameCol = columns.find(c => /name/i.test(c)) || columns[1] || columns[0];

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th class="col-sticky-left" style="width:54px">Photo</th>
        ${columns.map(c => `<th style="white-space:nowrap">${c}</th>`).join('')}
        <th class="col-sticky-right" style="min-width:175px">Actions</th>
      </tr></thead>
      <tbody id="pl-tbody"></tbody>
    </table></div>`;

    const tbody = document.getElementById('pl-tbody');

    // Render rows — photos loaded async per row
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-sticky-left" id="thumb-${row._id}">
          <div class="prop-thumb-placeholder" onclick="UI.openPhotoModal('${cat}','${row._id}')" title="Manage photos" style="cursor:pointer">📷</div>
        </td>
        ${columns.map(c => `<td style="white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis" title="${String(row[c]||'').replace(/"/g,'&quot;')}">${row[c] !== undefined && row[c] !== '' ? row[c] : '—'}</td>`).join('')}
        <td class="col-sticky-right action-col">
          <div class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="UI.openEditModal('${cat}','${row._id}')">✏️ Edit</button>
            <button class="btn btn-sm btn-primary"   onclick="UI.openPhotoModal('${cat}','${row._id}')">📷 Photos</button>
            <button class="btn btn-sm btn-danger"    onclick="UI.confirmDelete('${cat}','${row._id}','${(row[nameCol]||'').replace(/'/g,"\\'")}')">🗑</button>
          </div>
        </td>`;
      tbody.appendChild(tr);

      // Load thumbnail asynchronously
      RCIRL_DATA.getPhotos(cat, row._id).then(photos => {
        const cell = document.getElementById(`thumb-${row._id}`);
        if (!cell) return;
        if (photos.length) {
          cell.innerHTML = `<img class="prop-thumb" src="${photos[0].url}" alt="photo" onclick="UI.viewPhotoModal('${cat}','${row._id}')" style="cursor:pointer" loading="lazy">`;
        }
      });
    }

    // Update cat tab counts
    this.renderCatTabs('property-list', 'pl-cat-tabs');
  },

  /* ── Search ──────────────────────────────────────────────── */
  handleSearch(query, page) {
    this.searchQuery = query;
    this.renderPage(page);
  },

  /* ══════════════════════════════════════════════════════════
     ADD / EDIT MODAL
  ══════════════════════════════════════════════════════════ */
  openAddModal(cat) {
    const data = RCIRL_DATA._cache[cat] || { columns: RCIRL_DATA.DEFAULT_COLUMNS[cat] || [], rows: [] };
    this._openPropertyModal('Add Property', cat, null, data.columns);
  },

  async openEditModal(cat, rowId) {
    const data = await RCIRL_DATA.getProperties(cat);
    const row  = data.rows.find(r => r._id === rowId);
    if (!row) { toast('Property not found', 'error'); return; }
    this._openPropertyModal('Edit Property', cat, row, data.columns);
  },

  _openPropertyModal(title, cat, row, columns) {
    const isEdit = !!row;
    const meta   = RCIRL_DATA.getAllCategories()[cat];

    // Skip internal fields
    const displayCols = columns.filter(c => !c.startsWith('_'));

    const formFields = displayCols.map(col => {
      const val       = row ? (row[col] || '') : '';
      const isArea    = /amenities|remarks|address/i.test(col);
      const safeVal   = String(val).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      return `<div class="form-group">
        <label class="form-label">${col}</label>
        ${isArea
          ? `<textarea class="form-control" name="${col}" rows="2">${safeVal}</textarea>`
          : `<input class="form-control" name="${col}" value="${safeVal}">`}
      </div>`;
    }).join('');

    const html = `
      <div class="modal-overlay" id="prop-modal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title">${meta ? meta.icon : '🏠'} ${title} — ${meta ? meta.label : cat}</div>
            <button class="modal-close" onclick="UI.closeModal('prop-modal')">×</button>
          </div>
          <div class="modal-body">
            <div class="form-grid" id="prop-form-fields">${formFields}</div>
            <p class="text-muted mt-16" style="font-size:12px">📷 Add photos after saving via the <strong>Photos</strong> button in the table.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="UI.closeModal('prop-modal')">Cancel</button>
            <button class="btn btn-primary" id="prop-save-btn" onclick="UI.saveProperty('${cat}','${row ? row._id : ''}')">
              ${isEdit ? '✅ Save Changes' : '➕ Add Property'}
            </button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveProperty(cat, rowId) {
    const btn  = document.getElementById('prop-save-btn');
    const form = document.querySelectorAll('#prop-form-fields [name]');
    btn.disabled   = true;
    btn.innerHTML  = '<span class="spinner"></span> Saving…';

    const rowObj = {};
    form.forEach(el => { rowObj[el.name] = el.value; });

    if (rowId) {
      // Preserve internal fields
      const data = await RCIRL_DATA.getProperties(cat);
      const orig = data.rows.find(r => r._id === rowId) || {};
      rowObj._id      = orig._id;
      rowObj._created = orig._created;
      await RCIRL_DATA.updateRow(cat, rowId, rowObj);
      toast('Property updated!', 'success');
      this.closeModal('prop-modal');
      // Update the existing row cells in-place so the row stays at its position
      this._updateRowInPlace(cat, rowId, rowObj);
    } else {
      await RCIRL_DATA.addRow(cat, rowObj);
      toast('Property added!', 'success');
      this.closeModal('prop-modal');
      this.renderPropertyList();
    }
  },

  /* Update cells of an existing table row in-place after an edit,
     so the row stays in its current position rather than jumping to the end. */
  _updateRowInPlace(cat, rowId, rowObj) {
    const data = RCIRL_DATA._cache[cat];
    if (!data) { this.renderPropertyList(); return; }
    const columns = data.columns || [];
    // Update the in-memory cache row so future searches reflect the new values
    const cached = data.rows.find(r => r._id === rowId);
    if (cached) Object.assign(cached, rowObj);
    // Find the <tr> for this row and update each data cell
    const tbody = document.getElementById('pl-tbody');
    if (!tbody) { this.renderPropertyList(); return; }
    const trs = tbody.querySelectorAll('tr');
    for (const tr of trs) {
      // The first action button href contains the rowId
      const editBtn = tr.querySelector('[onclick*="' + rowId + '"]');
      if (!editBtn) continue;
      // Data cells start at index 1 (index 0 = photo thumb, last = actions)
      const tds = tr.querySelectorAll('td');
      columns.forEach((col, i) => {
        const td = tds[i + 1]; // +1 for the photo cell
        if (!td) return;
        const val = rowObj[col] !== undefined && rowObj[col] !== '' ? rowObj[col] : '—';
        td.textContent = val;
        td.title = String(rowObj[col] || '');
      });
      break;
    }
  },

  /* ══════════════════════════════════════════════════════════
     PHOTO MODAL — upload, view, delete
     Unlimited photos, stored as real files on server
  ══════════════════════════════════════════════════════════ */
  async openPhotoModal(cat, rowId) {
    const data    = await RCIRL_DATA.getProperties(cat);
    const row     = data.rows.find(r => r._id === rowId) || {};
    const nameCol = data.columns.find(c => /name/i.test(c)) || data.columns[0];
    const propName = row[nameCol] || 'Property';

    const html = `
      <div class="modal-overlay" id="photo-modal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title">📷 Photos — ${propName}</div>
            <button class="modal-close" onclick="UI.closeModal('photo-modal'); UI.renderPropertyList()">×</button>
          </div>
          <div class="modal-body">
            <div class="photo-upload-zone" id="pm-drop" onclick="document.getElementById('pm-input').click()">
              <span class="upload-icon">📷</span>
              <p>Click or drag & drop photos here</p>
              <span>JPG, PNG, WEBP — No file size limit. Files saved on server permanently.</span>
            </div>
            <input type="file" id="pm-input" accept="image/*" multiple style="display:none"
              onchange="UI.handlePhotoUpload(event,'${cat}','${rowId}')">
            <div id="pm-upload-progress" class="mt-8"></div>
            <div class="photo-grid mt-16" id="pm-grid">
              <div class="text-muted text-center" style="grid-column:1/-1;padding:20px">Loading photos…</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" onclick="UI.closeModal('photo-modal'); UI.renderPropertyList()">Done</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    this._setupPhotoDropZone('pm-drop', 'pm-input', cat, rowId);
    await this._refreshPhotoGrid(cat, rowId);
  },

  async viewPhotoModal(cat, rowId) {
    const photos = await RCIRL_DATA.getPhotos(cat, rowId);
    if (!photos.length) { toast('No photos yet — click 📷 to add', 'info'); return; }
    const html = `
      <div class="modal-overlay" id="view-photos-modal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title">📸 Property Photos (${photos.length})</div>
            <button class="modal-close" onclick="UI.closeModal('view-photos-modal')">×</button>
          </div>
          <div class="modal-body">
            <div class="photo-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
              ${photos.map(p => `<div class="photo-thumb-wrap" style="aspect-ratio:4/3">
                <img src="${p.url}" alt="${p.filename}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;border-radius:6px"
                  onclick="window.open('${p.url}','_blank')">
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async _refreshPhotoGrid(cat, rowId) {
    const grid   = document.getElementById('pm-grid');
    if (!grid) return;
    const photos = await RCIRL_DATA.getPhotos(cat, rowId);

    if (!photos.length) {
      grid.innerHTML = `<div class="text-muted text-center" style="grid-column:1/-1;padding:20px">No photos yet. Upload some above.</div>`;
      return;
    }

    grid.innerHTML = photos.map(p => {
      const size = p.size > 1048576 ? (p.size/1048576).toFixed(1)+' MB' : Math.round(p.size/1024)+' KB';
      return `<div class="photo-thumb-wrap" id="photo-${p.filename.replace(/\./g,'_')}">
        <img src="${p.url}" alt="${p.filename}" loading="lazy">
        <button class="photo-thumb-del" onclick="UI.deletePhoto('${cat}','${rowId}','${p.filename}')" title="Delete">×</button>
        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);color:#fff;font-size:10px;padding:2px 5px;white-space:nowrap;overflow:hidden">${size}</div>
      </div>`;
    }).join('');
  },

  async handlePhotoUpload(event, cat, rowId) {
    const files    = Array.from(event.target.files);
    const progress = document.getElementById('pm-upload-progress');
    let uploaded = 0, failed = 0;

    for (const file of files) {
      if (progress) progress.innerHTML = `<span class="spinner-purple"></span> Uploading ${uploaded+1}/${files.length}: ${file.name}…`;
      const res = await RCIRL_DATA.uploadPhoto(cat, rowId, file);
      if (res && res.ok) uploaded++;
      else { failed++; toast(`Failed: ${file.name}`, 'error'); }
    }

    if (progress) progress.innerHTML = '';
    if (uploaded) toast(`${uploaded} photo(s) uploaded!`, 'success');
    event.target.value = '';
    await this._refreshPhotoGrid(cat, rowId);

    // Refresh the thumbnail in the table background
    RCIRL_DATA.getPhotos(cat, rowId).then(photos => {
      const cell = document.getElementById(`thumb-${rowId}`);
      if (cell && photos.length) {
        cell.innerHTML = `<img class="prop-thumb" src="${photos[0].url}" style="cursor:pointer" onclick="UI.viewPhotoModal('${cat}','${rowId}')" loading="lazy">`;
      }
    });
  },

  async deletePhoto(cat, rowId, filename) {
    if (!confirm('Delete this photo? This cannot be undone.')) return;
    const res = await RCIRL_DATA.deletePhoto(cat, rowId, filename);
    if (res && res.ok) { toast('Photo deleted', 'success'); await this._refreshPhotoGrid(cat, rowId); }
    else toast('Delete failed', 'error');
  },

  _setupPhotoDropZone(zoneId, inputId, cat, rowId) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      const input = document.getElementById(inputId);
      const dt    = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      input.files = dt.files;
      await this.handlePhotoUpload({ target: input }, cat, rowId);
    });
  },

  /* ── Delete property ─────────────────────────────────────── */
  confirmDelete(cat, rowId, name) {
    const html = `
      <div class="modal-overlay" id="del-modal">
        <div class="modal" style="max-width:420px">
          <div class="modal-header"><div class="modal-title">🗑 Confirm Delete</div></div>
          <div class="modal-body">
            <p>Delete <strong>${name}</strong>?</p>
            <p class="text-muted mt-8" style="font-size:12px">All photos for this property will also be permanently deleted from the server.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="UI.closeModal('del-modal')">Cancel</button>
            <button class="btn btn-danger" onclick="UI.doDelete('${cat}','${rowId}')">Delete Permanently</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async doDelete(cat, rowId) {
    this.closeModal('del-modal');
    await RCIRL_DATA.deleteRow(cat, rowId);
    toast('Property deleted', 'success');
    this.renderPropertyList();
  },

  /* ── Import Excel ────────────────────────────────────────── */
  openImportModal(cat) {
    const meta = RCIRL_DATA.getAllCategories()[cat];
    const html = `
      <div class="modal-overlay" id="import-modal">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">📂 Import Excel — ${meta ? meta.label : cat}</div>
            <button class="modal-close" onclick="UI.closeModal('import-modal')">×</button>
          </div>
          <div class="modal-body">
            <p class="mb-16" style="font-size:13px;color:var(--grey-dark)">
              Upload a <strong>.xlsx</strong> file. First row must be column headers.
              <strong>This will replace all current data in this category.</strong>
            </p>
            <div class="photo-upload-zone" onclick="document.getElementById('xl-input').click()">
              <span class="upload-icon">📊</span>
              <p>Click to select Excel file</p>
              <span>Supports .xlsx and .xls</span>
            </div>
            <input type="file" id="xl-input" accept=".xlsx,.xls" style="display:none" onchange="UI.doImport(event,'${cat}')">
            <div id="import-status" class="mt-16"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="UI.closeModal('import-modal')">Close</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async doImport(event, cat) {
    const file   = event.target.files[0];
    if (!file) return;
    const status = document.getElementById('import-status');
    status.innerHTML = '<span class="spinner-purple"></span> Uploading & parsing Excel on server…';
    try {
      const result = await RCIRL_DATA.importExcel(file, cat);
      status.innerHTML = `<div class="badge badge-green" style="font-size:13px;padding:8px 14px">
        ✅ Imported ${result.count} properties with ${result.columns.length} columns.<br>
        <span style="font-size:11px;opacity:0.8">Excel file replaced on server — it is now the live database.</span>
      </div>`;
      this.renderPropertyList();
      toast(`Imported ${result.count} properties!`, 'success');
    } catch(e) {
      status.innerHTML = `<div class="badge badge-red" style="font-size:13px;padding:8px 14px">❌ ${e}</div>`;
      toast('Import failed', 'error');
    }
  },

  /* ══════════════════════════════════════════════════════════
     PRESENTATION
  ══════════════════════════════════════════════════════════ */
  async renderPresentation() {
    await this.renderCatTabs('presentation', 'pres-cat-tabs');
    this.renderFilterBar('pres-filters', 'presentation');
    this.renderPresentCart();
    await this.renderPresentationTable();
  },

  async renderPresentationTable() {
    const cat = this.currentCat['presentation'];
    const el  = document.getElementById('pres-table-wrap');
    if (!el) return;
    el.innerHTML = `<div class="table-loading"><span class="spinner-purple"></span> Loading…</div>`;

    const { columns, rows } = await RCIRL_DATA.searchRows(cat, this.searchQuery, this.activeFilters);
    const nameCol = columns.find(c => /name/i.test(c)) || columns[1] || columns[0];

    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">📄</span><h3>No properties found</h3></div>`;
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th class="col-sticky-left">Photo</th>
        ${columns.map(c => `<th style="white-space:nowrap">${c}</th>`).join('')}
        <th class="col-sticky-right" style="min-width:185px">Add to Presentation</th>
      </tr></thead>
      <tbody>
        ${rows.map(row => {
          const inCart = this.presentCart.some(c => c.rowId === row._id);
          return `<tr>
            <td class="col-sticky-left" id="pthumb-${row._id}">
              <div class="prop-thumb-placeholder">🏠</div>
            </td>
            ${columns.map(c => `<td style="white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${String(row[c]||'').replace(/"/g,'&quot;')}">${row[c]||'—'}</td>`).join('')}
            <td class="col-sticky-right action-col">
              ${inCart
                ? `<button class="btn btn-sm btn-success" disabled>✅ Added</button>`
                : `<button class="btn btn-sm btn-primary" onclick="UI.addToPresent('${cat}','${row._id}','${(row[nameCol]||'Property').replace(/'/g,"\\'")}')">➕ Add to Presentation</button>`
              }
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;

    // Load thumbnails async
    rows.forEach(row => {
      RCIRL_DATA.getPhotos(cat, row._id).then(photos => {
        const cell = document.getElementById(`pthumb-${row._id}`);
        if (cell && photos.length) cell.innerHTML = `<img class="prop-thumb" src="${photos[0].url}" loading="lazy">`;
      });
    });
  },

  addToPresent(cat, rowId, name) {
    if (this.presentCart.some(c => c.rowId === rowId)) { toast('Already added', 'info'); return; }
    this.presentCart.push({ cat, rowId, name });
    toast(`"${name}" added`, 'success');
    this.renderPresentation();
  },

  removeFromCart(rowId) {
    this.presentCart = this.presentCart.filter(c => c.rowId !== rowId);
    this.renderPresentation();
  },

  renderPresentCart() {
    const el    = document.getElementById('pres-cart');
    if (!el) return;
    const count = this.presentCart.length;
    el.innerHTML = `
      <div class="presentation-cart">
        <div style="font-size:13px;font-weight:700;white-space:nowrap">📋 Cart (${count})</div>
        <div class="cart-items-list">
          ${count === 0
            ? `<span class="cart-empty">No properties selected yet</span>`
            : this.presentCart.map(c => `<div class="cart-chip">${c.name}<button onclick="UI.removeFromCart('${c.rowId}')">×</button></div>`).join('')
          }
        </div>
        ${count > 0 ? `
          <button class="btn btn-primary" onclick="PICKER.openForPresentation(UI.presentCart)" style="white-space:nowrap">📄 Generate PDF</button>
          <button class="btn btn-secondary" onclick="UI.generateAIPresentation()" style="white-space:nowrap">🤖 AI Brochures</button>
          <button class="btn btn-ghost" onclick="UI.presentCart=[]; UI.renderPresentation()" style="color:#fff;border-color:rgba(255,255,255,0.3)">Clear</button>
        ` : ''}
      </div>`;
  },

  /* ── PDF Generation ──────────────────────────────────────── */
  async generatePresentation() {
    if (!this.presentCart.length) { toast('Add properties first', 'error'); return; }
    const settings = RCIRL_DATA.getSettings();
    let pagesHtml  = '';

    for (const item of this.presentCart) {
      const data   = await RCIRL_DATA.getProperties(item.cat);
      const row    = data.rows.find(r => r._id === item.rowId);
      if (!row) continue;
      const photos  = await RCIRL_DATA.getPhotos(item.cat, item.rowId);
      const meta    = RCIRL_DATA.getAllCategories()[item.cat];

      const nameCol    = data.columns.find(c => /name/i.test(c))       || data.columns[0];
      const locCol     = data.columns.find(c => /area|location/i.test(c));
      const priceRCol  = data.columns.find(c => /readable/i.test(c));
      const priceCol   = data.columns.find(c => /price|rent/i.test(c) && !/sq|rate/i.test(c));
      const amenityCol = data.columns.find(c => /amenities/i.test(c));
      const remarkCol  = data.columns.find(c => /remark/i.test(c));
      const skipCols   = new Set([nameCol, locCol, remarkCol, amenityCol].filter(Boolean).concat(['_id','_created','_updated','Photos']));
      const detailCols = data.columns.filter(c => !skipCols.has(c) && !c.startsWith('_'));
      const amenities  = row[amenityCol] ? row[amenityCol].split(',').map(a=>a.trim()).filter(Boolean) : [];
      const price      = row[priceRCol]  || (row[priceCol] ? formatINR(row[priceCol]) : '');
      const idx        = this.presentCart.indexOf(item);

      pagesHtml += `
        <div class="pdf-page">
          <div class="pdf-header">
            <img src="assets/logo.png" class="pdf-logo" alt="RCIRL">
            <div class="pdf-header-right">
              <div class="pdf-prop-type">${meta ? meta.label : item.cat} ${meta ? meta.icon : ''}</div>
              <div class="pdf-prop-name">${row[nameCol] || 'Property'}</div>
              ${locCol ? `<div class="pdf-prop-loc">📍 ${row[locCol]}</div>` : ''}
              ${price  ? `<div class="pdf-price-tag">${price}</div>`         : ''}
            </div>
          </div>
          ${amenities.length ? `
            <div class="pdf-section-title">✨ Amenities & Features</div>
            <div class="pdf-amenities">${amenities.map(a=>`<span class="pdf-amenity-chip">${a}</span>`).join('')}</div>` : ''}
          <div class="pdf-section-title">📋 Property Details</div>
          <div class="pdf-details-grid">
            ${detailCols.slice(0,15).map(c => `
              <div class="pdf-detail-item">
                <div class="pdf-detail-label">${c}</div>
                <div class="pdf-detail-value">${row[c] || '—'}</div>
              </div>`).join('')}
          </div>
          ${row[remarkCol] ? `
            <div class="pdf-section-title">💬 Remarks</div>
            <div style="background:#F5F0FB;border-radius:8px;padding:14px 16px;font-size:13px;color:#333;border-left:4px solid #5B2D8E">${row[remarkCol]}</div>` : ''}
          <div class="pdf-footer">
            <div class="pdf-footer-brand">
              <strong>${settings.companyName || 'RCIRL Property Consultant'}</strong><br>
              ${[settings.phone, settings.email, settings.website].filter(Boolean).join(' | ')}
            </div>
            <div class="pdf-page-num">Page ${idx*2+1}</div>
          </div>
        </div>`;

      if (photos.length) {
        pagesHtml += `
          <div class="pdf-page">
            <div class="pdf-header" style="margin-bottom:20px">
              <img src="assets/logo.png" class="pdf-logo" alt="RCIRL">
              <div class="pdf-header-right">
                <div class="pdf-prop-type">Photo Gallery</div>
                <div class="pdf-prop-name">${row[nameCol] || 'Property'}</div>
              </div>
            </div>
            <div class="pdf-photos-grid">
              ${photos.slice(0,5).map((p,pi) => `<img src="${p.url}" class="pdf-photo ${pi===0?'pdf-photo-main':''}" alt="photo" crossorigin="anonymous">`).join('')}
            </div>
            <div class="pdf-footer">
              <div class="pdf-footer-brand"><strong>${settings.companyName || 'RCIRL'}</strong></div>
              <div class="pdf-page-num">Page ${idx*2+2}</div>
            </div>
          </div>`;
      }
    }

    const html = `
      <div class="modal-overlay" id="pdf-modal">
        <div class="modal modal-xl">
          <div class="modal-header">
            <div class="modal-title">📄 Presentation Preview</div>
            <button class="modal-close" onclick="UI.closeModal('pdf-modal')">×</button>
          </div>
          <div class="modal-body" style="padding:16px;background:#e0e0e0">
            <div class="pdf-preview" id="pdf-preview-content">${pagesHtml}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="UI.closeModal('pdf-modal')">Close</button>
            <button class="btn btn-primary" id="pdf-dl-btn" onclick="UI.downloadPDF()">⬇️ Download PDF</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async downloadPDF() {
    const btn = document.getElementById('pdf-dl-btn');
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    btn.disabled  = true;
    try {
      const { jsPDF } = window.jspdf;
      const pdf       = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pages     = document.querySelectorAll('#pdf-preview-content .pdf-page');
      let first = true;

      for (const page of pages) {
        if (!first) pdf.addPage();
        const canvas  = await html2canvas(page, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pW      = pdf.internal.pageSize.getWidth();
        const pH      = (canvas.height * pW) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pW, pH);
        first = false;
      }

      // Get blob and save to server
      const names    = this.presentCart.map(c => slugify(c.name)).join('-').slice(0,40);
      const filename = `RCIRL_Presentation_${names}_${dtString()}.pdf`;
      const pdfBlob  = pdf.output('blob');

      // Download to user's device
      pdf.save(filename);

      // Also save to server outputs folder
      const res = await RCIRL_DATA.saveOutput(pdfBlob, filename, 'pdf', this.presentCart.map(c=>c.name));
      if (res && res.ok) toast('PDF saved to Outputs on server!', 'success');

      this.presentCart = [];
      this.renderPresentation();
    } catch(e) {
      toast('PDF error: ' + e.message, 'error');
      console.error(e);
    }
    btn.innerHTML = '⬇️ Download PDF';
    btn.disabled  = false;
  },

  /* ══════════════════════════════════════════════════════════
     POST DESIGN
  ══════════════════════════════════════════════════════════ */
  async renderPostDesign() {
    await this.renderCatTabs('post-design', 'pd-cat-tabs');
    this.renderFilterBar('pd-filters', 'post-design');
    await this.renderPostTable();
  },

  async renderPostTable() {
    const cat = this.currentCat['post-design'];
    const el  = document.getElementById('pd-table-wrap');
    if (!el) return;
    el.innerHTML = `<div class="table-loading"><span class="spinner-purple"></span> Loading…</div>`;

    const { columns, rows } = await RCIRL_DATA.searchRows(cat, this.searchQuery, this.activeFilters);
    const nameCol = columns.find(c => /name/i.test(c)) || columns[0];

    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">🎨</span><h3>No properties found</h3></div>`;
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th class="col-sticky-left">Photo</th>
        ${columns.map(c => `<th style="white-space:nowrap">${c}</th>`).join('')}
        <th class="col-sticky-right" style="min-width:220px">Create Post</th>
      </tr></thead>
      <tbody>
        ${rows.map(row => `<tr>
          <td class="col-sticky-left" id="pdthumb-${row._id}"><div class="prop-thumb-placeholder">🏠</div></td>
          ${columns.map(c => `<td style="white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${String(row[c]||'').replace(/"/g,'&quot;')}">${row[c]||'—'}</td>`).join('')}
          <td class="col-sticky-right action-col" style="display:flex;flex-direction:column;gap:6px;padding:8px">
            <button class="btn btn-sm btn-primary" onclick="PICKER.openForPoster('${cat}','${row._id}')">🎨 Quick Design</button>
            <button class="btn btn-sm btn-secondary" onclick="UI.openAIPosterModal('${cat}','${row._id}')">🤖 AI Poster</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

    rows.forEach(row => {
      RCIRL_DATA.getPhotos(cat, row._id).then(photos => {
        const cell = document.getElementById(`pdthumb-${row._id}`);
        if (cell && photos.length) cell.innerHTML = `<img class="prop-thumb" src="${photos[0].url}" loading="lazy">`;
      });
    });
  },

  async openPosterDesigner(cat, rowId) {
    const data    = await RCIRL_DATA.getProperties(cat);
    const row     = data.rows.find(r => r._id === rowId);
    if (!row) return;
    const photos   = await RCIRL_DATA.getPhotos(cat, rowId);
    const meta     = RCIRL_DATA.getAllCategories()[cat];
    const settings = RCIRL_DATA.getSettings();

    const nameCol    = data.columns.find(c => /name/i.test(c))       || data.columns[0];
    const locCol     = data.columns.find(c => /area|location/i.test(c));
    const priceRCol  = data.columns.find(c => /readable/i.test(c));
    const priceCol   = data.columns.find(c => /price|rent/i.test(c) && !/sq|rate/i.test(c));
    const sqftCol    = data.columns.find(c => /sq\.?ft|total.*area/i.test(c) && !/rate|carpet|built|plot/i.test(c));
    const bhkCol     = data.columns.find(c => /bhk/i.test(c));
    const typeCol    = data.columns.find(c => /^type$|sub-type|land type/i.test(c));
    const facingCol  = data.columns.find(c => /facing/i.test(c));
    const parkCol    = data.columns.find(c => /parking/i.test(c));

    const propName  = row[nameCol] || 'Property';
    const location  = locCol    ? row[locCol]    : '';
    const price     = row[priceRCol] || (row[priceCol] ? formatINR(row[priceCol]) : '');
    const sqft      = sqftCol   ? row[sqftCol]   : '';
    const bhk       = bhkCol    ? row[bhkCol]    : '';
    const facing    = facingCol ? row[facingCol] : '';
    const parking   = parkCol   ? row[parkCol]   : '';

    const highlights = [
      bhk    ? bhk + ''           : null,
      sqft   ? sqft + ' Sq.Ft.'   : null,
      facing ? facing              : null,
      parking? parking             : null,
    ].filter(Boolean);

    this._posterBgImg    = null;
    this._posterCat      = cat;
    this._posterRowId    = rowId;
    this._posterPropName = propName;

    const html = `
      <div class="modal-overlay" id="poster-modal">
        <div class="modal modal-xl">
          <div class="modal-header">
            <div class="modal-title">🎨 Post Designer — ${propName}</div>
            <button class="modal-close" onclick="UI.closeModal('poster-modal')">×</button>
          </div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 420px;gap:24px;align-items:start">
              <div>
                <h4 style="font-size:13px;font-weight:700;color:var(--purple-dark);margin-bottom:14px">🎛 Customise</h4>
                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">Template</label>
                    <select class="form-control" id="tmpl-select" onchange="UI.redrawPoster()">
                      <option value="dark">Dark Luxury</option>
                      <option value="light">Clean Light</option>
                      <option value="gradient">Purple Gradient</option>
                      <option value="minimal">Minimal White</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Contact Line</label>
                    <input class="form-control" id="poster-contact" value="${(settings.phone||'+91 98410 00000').replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Property Name</label>
                    <input class="form-control" id="poster-name" value="${propName.replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Location</label>
                    <input class="form-control" id="poster-loc" value="${location.replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Price</label>
                    <input class="form-control" id="poster-price" value="${price.replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Highlight 1</label>
                    <input class="form-control" id="poster-h1" value="${(highlights[0]||'').replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Highlight 2</label>
                    <input class="form-control" id="poster-h2" value="${(highlights[1]||'').replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Highlight 3</label>
                    <input class="form-control" id="poster-h3" value="${(highlights[2]||'').replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Highlight 4</label>
                    <input class="form-control" id="poster-h4" value="${(highlights[3]||'').replace(/"/g,'&quot;')}" oninput="UI.redrawPoster()">
                  </div>
                </div>
                <div class="form-group mt-16">
                  <label class="form-label">Background Photo</label>
                  ${photos.length ? `
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                      ${photos.map((p,i) => `<img src="${p.url}" onclick="UI.setPosterBg('${p.url}')" style="width:64px;height:52px;object-fit:cover;border-radius:5px;cursor:pointer;border:2px solid ${i===0?'var(--purple)':'var(--grey-light)'}" title="${p.filename}">`).join('')}
                    </div>` : `<p style="font-size:12px;color:var(--grey);margin-bottom:8px">No photos uploaded yet — upload below or use any image</p>`}
                  <input type="file" id="poster-bg-upload" accept="image/*" onchange="UI.handlePosterBgUpload(event)" style="font-size:12px">
                </div>
              </div>
              <div>
                <h4 style="font-size:13px;font-weight:700;color:var(--purple-dark);margin-bottom:14px">👁 Preview (1080×1080)</h4>
                <div id="poster-preview-container">
                  <div id="poster-canvas-wrap">
                    <canvas id="poster-canvas" width="1080" height="1080" style="width:400px;height:400px;display:block;border-radius:10px"></canvas>
                  </div>
                </div>
                <p style="font-size:11px;color:var(--grey);text-align:center;margin-top:8px">Downloads as 1080×1080 JPG</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="UI.closeModal('poster-modal')">Cancel</button>
            <button class="btn btn-primary" onclick="UI.downloadPoster()">⬇️ Download JPG</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    // Load first photo as background
    if (photos.length) {
      const img   = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { this._posterBgImg = img; this.redrawPoster(); };
      img.onerror = () => { this._posterBgImg = null; this.redrawPoster(); };
      img.src     = photos[0].url;
    } else {
      setTimeout(() => this.redrawPoster(), 80);
    }
  },

  setPosterBg(src) {
    const img   = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => { this._posterBgImg = img; this.redrawPoster(); };
    img.onerror = () => toast('Could not load image', 'error');
    img.src     = src;
  },

  handlePosterBgUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = e => { this.setPosterBg(e.target.result); };
    r.readAsDataURL(file);
  },

  redrawPoster() {
    const canvas = document.getElementById('poster-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W   = 1080, H = 1080;

    const tmpl    = (document.getElementById('tmpl-select')    ||{}).value || 'dark';
    const name    = (document.getElementById('poster-name')    ||{}).value || '';
    const loc     = (document.getElementById('poster-loc')     ||{}).value || '';
    const price   = (document.getElementById('poster-price')   ||{}).value || '';
    const h1      = (document.getElementById('poster-h1')      ||{}).value || '';
    const h2      = (document.getElementById('poster-h2')      ||{}).value || '';
    const h3      = (document.getElementById('poster-h3')      ||{}).value || '';
    const h4      = (document.getElementById('poster-h4')      ||{}).value || '';
    const contact = (document.getElementById('poster-contact') ||{}).value || '';
    const highlights = [h1,h2,h3,h4].filter(Boolean);

    const T = {
      dark:     { bg:'#1A1A2E', ov:'rgba(20,10,40,0.70)',  ac:'#5B2D8E', tx:'#fff',     sub:'rgba(255,255,255,0.78)', chip:'rgba(255,255,255,0.13)', chipTx:'#fff'     },
      light:    { bg:'#F7F7F8', ov:'rgba(255,255,255,0.82)',ac:'#5B2D8E', tx:'#1A1A2E', sub:'#555555',               chip:'#EDE7F6',                chipTx:'#5B2D8E'   },
      gradient: { bg:'#5B2D8E', ov:'rgba(50,20,90,0.72)',  ac:'#FFD700', tx:'#fff',     sub:'rgba(255,255,255,0.82)', chip:'rgba(255,255,255,0.15)', chipTx:'#fff'     },
      minimal:  { bg:'#ffffff', ov:'rgba(255,255,255,0.90)',ac:'#5B2D8E', tx:'#1A1A2E', sub:'#777777',               chip:'#F3EEF9',                chipTx:'#5B2D8E'   },
    };
    const t = T[tmpl] || T.dark;

    // Background image
    if (this._posterBgImg) {
      const img = this._posterBgImg;
      const sc  = Math.max(W/img.width, H/img.height);
      ctx.drawImage(img, (W-img.width*sc)/2, (H-img.height*sc)/2, img.width*sc, img.height*sc);
    } else {
      ctx.fillStyle = t.bg;
      ctx.fillRect(0,0,W,H);
    }
    // Overlay
    ctx.fillStyle = t.ov;
    ctx.fillRect(0,0,W,H);

    // Top accent stripe
    ctx.fillStyle = t.ac;
    ctx.fillRect(0,0,W,10);

    // Brand
    ctx.fillStyle = t.tx;
    ctx.font = 'bold 54px Inter, Arial';
    ctx.fillText('RCIRL', 60, 96);
    ctx.font = '500 21px Inter, Arial';
    ctx.fillStyle = t.sub;
    ctx.fillText('PROPERTY CONSULTANT', 60, 124);

    // Accent divider
    ctx.strokeStyle = t.ac;
    ctx.lineWidth   = 3;
    ctx.beginPath(); ctx.moveTo(60,146); ctx.lineTo(360,146); ctx.stroke();

    // Property Name (word wrap)
    ctx.fillStyle = t.tx;
    ctx.font      = 'bold 66px Inter, Arial';
    const words   = name.split(' ');
    let line = '', lines = [];
    for (const w of words) {
      const test = line ? line+' '+w : w;
      if (ctx.measureText(test).width > 960 && line) { lines.push(line); line=w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines = lines.slice(0,2);
    lines.forEach((l,i) => ctx.fillText(l, 60, 250+i*78));
    const nameBottom = 250 + (lines.length-1)*78 + 20;

    // Location
    ctx.font      = '400 31px Inter, Arial';
    ctx.fillStyle = t.sub;
    ctx.fillText('📍 ' + loc, 60, nameBottom+56);

    // Price badge
    ctx.font = 'bold 40px Inter, Arial';
    const ptw = ctx.measureText(price).width;
    const px=60, py=nameBottom+130, pw=ptw+52, ph=68;
    ctx.fillStyle = t.ac;
    rrect(ctx,px,py-50,pw,ph,13); ctx.fill();
    ctx.fillStyle = (t.ac==='#FFD700'||t.ac==='#fff') ? '#1A1A2E' : '#fff';
    ctx.fillText(price, px+26, py);

    // Highlights grid (2×2)
    if (highlights.length) {
      const cW=442, cH=72, gX=28, gY=18, sX=60, sY=py+70;
      highlights.forEach((h,i) => {
        const col=i%2, row=Math.floor(i/2);
        const cx=sX+col*(cW+gX), cy=sY+row*(cH+gY);
        ctx.fillStyle = t.chip;
        rrect(ctx,cx,cy,cW,cH,10); ctx.fill();
        ctx.fillStyle = t.chipTx;
        ctx.font      = '600 27px Inter, Arial';
        ctx.fillText(h, cx+20, cy+46);
      });
    }

    // Bottom bar
    ctx.fillStyle = t.ac;
    ctx.fillRect(0,H-104,W,104);
    const btx = (t.ac==='#FFD700') ? '#1A1A2E' : '#fff';
    ctx.fillStyle = btx;
    ctx.font      = 'bold 28px Inter, Arial';
    ctx.fillText('RCIRL Property Consultant', 60, H-64);
    ctx.font      = '400 24px Inter, Arial';
    ctx.fillStyle = (t.ac==='#FFD700') ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.8)';
    ctx.fillText(contact, 60, H-30);

    // Website right
    ctx.textAlign = 'right';
    ctx.font      = '400 22px Inter, Arial';
    ctx.fillStyle = (t.ac==='#FFD700') ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    ctx.fillText('www.rcirl.in', W-60, H-30);
    ctx.textAlign = 'left';
  },

  async downloadPoster() {
    const canvas   = document.getElementById('poster-canvas');
    if (!canvas) return;
    const filename = `RCIRL_Post_${slugify(this._posterCat)}_${slugify(this._posterPropName)}_${dtString()}.jpg`;
    const dataUrl  = canvas.toDataURL('image/jpeg', 0.95);

    // Download to device
    const a  = document.createElement('a');
    a.href   = dataUrl;
    a.download = filename;
    a.click();

    // Save to server outputs
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const sRes = await RCIRL_DATA.saveOutput(blob, filename, 'jpg', [this._posterPropName]);
    if (sRes && sRes.ok) toast('Poster saved to Outputs on server!', 'success');

    this.closeModal('poster-modal');
    if (this.currentPage === 'outputs') this.renderOutputs();
  },

  /* ══════════════════════════════════════════════════════════
     OUTPUTS
  ══════════════════════════════════════════════════════════ */
  async renderOutputs() {
    const el = document.getElementById('outputs-grid');
    if (!el) return;
    el.innerHTML = `<div class="table-loading" style="grid-column:1/-1"><span class="spinner-purple"></span> Loading outputs…</div>`;

    const outputs = await RCIRL_DATA.getOutputs();
    if (!outputs.length) {
      el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">📁</span><h3>No outputs yet</h3><p>Generate presentations or post designs</p></div>`;
      return;
    }

    el.innerHTML = outputs.map(out => {
      const date    = new Date(out.created).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      const time    = new Date(out.created).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      const sizeStr = out.size > 1048576 ? (out.size/1048576).toFixed(1)+' MB' : Math.round(out.size/1024)+' KB';
      return `
        <div class="output-card">
          <div class="output-thumb">
            ${out.type==='jpg' ? `<img src="${out.url}" alt="preview" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : '📄'}
            <span class="output-type-badge">${out.type.toUpperCase()}</span>
          </div>
          <div class="output-info">
            <div class="output-name" title="${out.filename}">${out.filename}</div>
            <div class="output-meta">${date} at ${time} · ${sizeStr}</div>
            <div class="output-meta">${(out.properties||[]).join(', ')}</div>
            <div class="output-actions">
              <button class="btn btn-xs btn-secondary" onclick="UI.viewOutput('${out.url}','${out.type}','${out.filename}')">👁 View</button>
              <button class="btn btn-xs btn-primary" onclick="UI.downloadFile('${out.url}','${out.filename}')">⬇️ Download</button>
              <button class="btn btn-xs btn-danger" onclick="UI.deleteOutput('${out.filename}')">🗑</button>
            </div>
          </div>
        </div>`;
    }).join('');
  },

  async openInCanva(imgUrl, filename) {
    // Check if already connected to Canva
    let connected = false;
    try {
      const s = await fetch('http://127.0.0.1:8001/canva/status');
      connected = (await s.json()).connected;
    } catch (e) { /* service not running */ }

    if (!connected) {
      // Open OAuth in a popup, wait for it to finish and post back the edit URL
      toast('Connecting to Canva…', 'info');
      const popup = window.open(
        `http://127.0.0.1:8001/canva/auth?file=${encodeURIComponent(filename)}`,
        'canva_auth', 'width=600,height=700,left=200,top=100'
      );

      // Listen for the callback page to post back the edit URL
      const handler = (e) => {
        if (e.data?.type === 'CANVA_READY') {
          window.removeEventListener('message', handler);
          window.open(e.data.url, '_blank');
        }
      };
      window.addEventListener('message', handler);

      // Fallback: if popup closed without posting a message, try opening directly
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener('message', handler);
        }
      }, 500);
      return;
    }

    // Already connected — upload and open directly
    toast('Uploading to Canva…', 'info');
    try {
      const resp = await fetch('http://127.0.0.1:8001/canva/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await resp.json();
      if (data.edit_url) {
        window.open(data.edit_url, '_blank');
        // Show editing tip after a short delay
        setTimeout(() => toast(
          '✏️ In Canva: click the poster image — it is now moveable and resizable. Use the Text tool to add or edit text layers.',
          'info'
        ), 1500);
      } else {
        toast('Canva error: ' + (data.detail || JSON.stringify(data)), 'error');
      }
    } catch (e) {
      toast('Could not reach AI service — is run_local.py running?', 'error');
    }
  },

    async downloadFile(url, filename) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast('Download failed: ' + e.message, 'error');
    }
  },

    viewOutput(url, type, filename) {
    const id = 'view-lightbox';
    document.getElementById(id)?.remove();

    const isPdf = type === 'pdf';
    const inner = isPdf
      ? `<iframe src="${url}" style="width:100%;height:80vh;border:none;border-radius:8px;background:#fff"></iframe>`
      : `<img src="${url}" alt="${filename}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:8px;display:block;margin:auto">`;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="${id}" onclick="if(event.target.id==='${id}')document.getElementById('${id}').remove()">
        <div class="modal" style="max-width:900px;width:95vw">
          <div class="modal-header">
            <div class="modal-title">${isPdf ? '📄' : '🖼'} ${filename}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-sm btn-primary" onclick="UI.downloadFile('${url}','${filename}')">⬇️ Download</button>
              <button class="modal-close" onclick="document.getElementById('${id}').remove()">×</button>
            </div>
          </div>
          <div class="modal-body" style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:16px">
            ${inner}
          </div>
        </div>
      </div>`);
  },

  async deleteOutput(filename) {
    if (!confirm('Delete "' + filename + '"?')) return;
    await RCIRL_DATA.deleteOutput(filename);
    toast('Output deleted', 'success');
    this.renderOutputs();
  },

  /* ══════════════════════════════════════════════════════════
     SETTINGS
  ══════════════════════════════════════════════════════════ */
  async renderSettings() {
    const settings = RCIRL_DATA.getSettings();
    const cats     = RCIRL_DATA.getAllCategories();
    const el       = document.getElementById('settings-content');
    if (!el) return;

    const filterSections = Object.entries(cats).map(([catKey, meta]) => {
      const filters = (settings.filters && settings.filters[catKey]) || {};
      return `
        <div class="settings-section">
          <h3>${meta.icon} ${meta.label} Filters</h3>
          ${Object.entries(filters).map(([col, opts]) => `
            <div class="mb-16">
              <div style="font-size:12px;font-weight:600;color:var(--grey-dark);margin-bottom:8px">${col}</div>
              <div class="filter-tag-list">
                ${opts.map((opt,i) => `<div class="filter-tag">${opt}<button onclick="UI.removeFilterOption('${catKey}','${col}',${i})">×</button></div>`).join('')}
              </div>
              <div style="display:flex;gap:8px;margin-top:6px">
                <input class="form-control" id="newopt-${catKey}-${slugify(col)}" placeholder="Add option…" style="flex:1;padding:6px 10px;font-size:12px">
                <button class="btn btn-sm btn-secondary" onclick="UI.addFilterOption('${catKey}','${col}','newopt-${catKey}-${slugify(col)}')">Add</button>
              </div>
            </div>`).join('')}
          <div class="divider"></div>
          <div style="font-size:12px;font-weight:600;color:var(--grey-dark);margin-bottom:8px">Add New Filter Column</div>
          <div style="display:flex;gap:8px">
            <input class="form-control" id="newcol-${catKey}" placeholder="Column name" style="flex:1;padding:6px 10px;font-size:12px">
            <button class="btn btn-sm btn-primary" onclick="UI.addFilterCol('${catKey}','newcol-${catKey}')">+ Add</button>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="settings-section mb-24" style="max-width:620px">
        <h3>🏢 Company Details</h3>
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Company Name</label><input class="form-control" id="set-company" value="${settings.companyName||''}"></div>
          <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="set-phone" value="${settings.phone||''}"></div>
          <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="set-email" value="${settings.email||''}"></div>
          <div class="form-group"><label class="form-label">Website</label><input class="form-control" id="set-website" value="${settings.website||''}"></div>
          <div class="form-group form-full"><label class="form-label">Company Address (shown in PDF footer)</label><input class="form-control" id="set-address" value="${settings.address||''}"></div>
        </div>
        <button class="btn btn-primary mt-16" onclick="UI.saveCompanySettings()">Save Company Details</button>
      </div>

      <div class="settings-section mb-24" style="max-width:520px">
        <h3>➕ Add New Property Category</h3>
        <p style="font-size:13px;color:var(--grey-dark);margin-bottom:16px">Create a custom category beyond the 4 built-in ones.</p>
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Category Name</label><input class="form-control" id="new-cat-name" placeholder="e.g. Hospitality"></div>
          <div class="form-group"><label class="form-label">Icon (emoji)</label><input class="form-control" id="new-cat-icon" placeholder="🏨" style="font-size:20px"></div>
        </div>
        <button class="btn btn-primary mt-16" onclick="UI.addCategory()">Create Category</button>
      </div>

      <div class="settings-section mb-24" style="max-width:520px">
        <h3>📊 Data Management</h3>
        <p style="font-size:13px;color:var(--grey-dark);margin-bottom:14px">Export any category's data to Excel.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${Object.entries(cats).map(([key,meta]) => `<button class="btn btn-secondary" onclick="RCIRL_DATA.exportExcel('${key}').then(()=>toast('Exported ${meta.label}!','success'))">${meta.icon} Export ${meta.label}</button>`).join('')}
        </div>
      </div>

      <div class="mb-8" style="font-size:16px;font-weight:700;color:var(--purple-dark)">🔧 Filter Options</div>
      <p style="font-size:13px;color:var(--grey-dark);margin-bottom:20px">Manage filter choices per category.</p>
      <div class="settings-grid">${filterSections}</div>`;
  },

  async saveCompanySettings() {
    const s = RCIRL_DATA.getSettings();
    s.companyName = document.getElementById('set-company').value;
    s.phone       = document.getElementById('set-phone').value;
    s.email       = document.getElementById('set-email').value;
    s.website     = document.getElementById('set-website').value;
    s.address     = document.getElementById('set-address') ? document.getElementById('set-address').value : (s.address || '');
    await RCIRL_DATA.saveSettings(s);
    toast('Saved!', 'success');
  },

  async addFilterOption(cat, col, inputId) {
    const input = document.getElementById(inputId);
    const val   = input ? input.value.trim() : '';
    if (!val) { toast('Enter a value', 'error'); return; }
    const s = RCIRL_DATA.getSettings();
    if (!s.filters) s.filters = {};
    if (!s.filters[cat]) s.filters[cat] = {};
    if (!s.filters[cat][col]) s.filters[cat][col] = [];
    if (s.filters[cat][col].includes(val)) { toast('Already exists', 'info'); return; }
    s.filters[cat][col].push(val);
    await RCIRL_DATA.saveSettings(s);
    this.renderSettings();
    toast('Option added', 'success');
  },

  async removeFilterOption(cat, col, idx) {
    const s = RCIRL_DATA.getSettings();
    s.filters[cat][col].splice(idx, 1);
    await RCIRL_DATA.saveSettings(s);
    this.renderSettings();
  },

  async addFilterCol(cat, inputId) {
    const input = document.getElementById(inputId);
    const col   = input ? input.value.trim() : '';
    if (!col) { toast('Enter a column name', 'error'); return; }
    const s = RCIRL_DATA.getSettings();
    if (!s.filters) s.filters = {};
    if (!s.filters[cat]) s.filters[cat] = {};
    if (s.filters[cat][col]) { toast('Already exists', 'info'); return; }
    s.filters[cat][col] = [];
    await RCIRL_DATA.saveSettings(s);
    this.renderSettings();
    toast('Filter column added', 'success');
  },

  async addCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    const icon = document.getElementById('new-cat-icon').value.trim() || '🏗';
    if (!name) { toast('Enter a category name', 'error'); return; }
    const key = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    if (RCIRL_DATA.BUILTIN_META[key] || RCIRL_DATA._customCats[key]) { toast('Already exists', 'error'); return; }
    await RCIRL_DATA.addCategory(key, { label: name, icon, color: '#5B2D8E' });
    document.getElementById('new-cat-name').value = '';
    document.getElementById('new-cat-icon').value = '';
    this.renderSettings();
    toast(`"${name}" category created!`, 'success');
  },

  /* ── Utilities ───────────────────────────────────────────── */
  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  },
};

/* ── Canvas rounded rect ────────────────────────────────────────── */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

/* ── Toast ────────────────────────────────────────────────────── */
function toast(msg, type='info', duration=3200) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icons[type]||''} ${msg}`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, duration);
}

const PAGE_META = {
  'property-list': { title:'🏘 Property List',  sub:'View, add, and manage all properties' },
  'presentation':  { title:'📄 Presentation',   sub:'Generate branded property brochures'   },
  'post-design':   { title:'🎨 Post Design',    sub:'Create Instagram & WhatsApp posts'      },
  'outputs':       { title:'📁 Outputs',        sub:'All saved PDFs and poster images'       },
  'settings':      { title:'⚙️ Settings',      sub:'Company info, categories & filters'     },
};

/* ══════════════════════════════════════════════════════════
   AI POSTER MODAL
   Shows style picker → generates 3 variants via Python service
   → comparison lightbox to pick from.
══════════════════════════════════════════════════════════ */
Object.assign(UI, {

  /* Style definitions mirroring nano_banana.py STYLES — labels + swatch colours */
  _AI_STYLES: [
    { id: 'luxury',    label: 'Luxury',    swatch: 'linear-gradient(135deg,#1a0a00,#8B6914)', desc: 'Black & gold, premium' },
    { id: 'minimal',   label: 'Minimal',   swatch: 'linear-gradient(135deg,#f5f5f5,#d0d0d0)', desc: 'White, clean, airy'   },
    { id: 'modern',    label: 'Modern',    swatch: 'linear-gradient(135deg,#5B2D8E,#0D1B3E)', desc: 'Bold purple, sleek'   },
    { id: 'corporate', label: 'Corporate', swatch: 'linear-gradient(135deg,#0D3B6E,#1a5fa8)', desc: 'Navy, professional'    },
    { id: 'tropical',  label: 'Warm Living',swatch: 'linear-gradient(135deg,#D4622A,#F4A460)', desc: 'Coral, lifestyle'    },
    { id: 'gradient',  label: 'Gradient',  swatch: 'linear-gradient(135deg,#3D0B8C,#C9A84C)', desc: 'Purple-gold, bold'    },
  ],

  async openAIPosterModal(cat, rowId) {
    const running = await RCIRL_AI.isRunning();
    document.getElementById('ai-poster-modal')?.remove();

    // Load property data
    let photos = [], cols = [], row = {};
    try {
      const data = await RCIRL_DATA.getProperties(cat);
      row  = data.rows.find(r => r._id === rowId) || {};
      cols = data.columns.filter(c => !c.startsWith('_'));
      photos = (await RCIRL_DATA.getPhotos(cat, rowId)) || [];
    } catch (e) { /* degrade silently */ }

    // ── Photo thumbnails (first photo selected by default) ──────────────
    const photoHtml = photos.length
      ? photos.map((p, i) =>
          `<div onclick="UI._aiTogglePhoto('${p.url}',this)" data-url="${p.url}" id="ai-photo-picker"
               style="cursor:pointer;border-radius:6px;overflow:hidden;width:72px;height:54px;
                      position:relative;border:3px solid ${i===0?'var(--purple)':'var(--grey-light)'}">
            <img src="${p.url}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);
                        color:#fff;font-size:9px;padding:2px 4px;text-align:center">Photo ${i+1}</div>
            <div class="ai-photo-num" style="display:${i===0?'flex':'none'};position:absolute;top:3px;right:3px;
                        background:var(--purple);color:#fff;border-radius:50%;width:16px;height:16px;
                        font-size:9px;font-weight:700;align-items:center;justify-content:center">
              ${i===0?1:''}
            </div>
          </div>`).join('')
      : '<p style="font-size:12px;color:var(--grey)">No photos uploaded yet.</p>';

    // ── All column checkboxes ────────────────────────────────────────────
    const colsHtml = cols.length
      ? cols.map(c => {
          const val = row[c] ? ` <span style="color:var(--grey);font-size:10px">${String(row[c]).slice(0,28)}</span>` : '';
          return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;
                               color:var(--grey-dark);padding:3px 0;cursor:pointer">
            <input type="checkbox" name="ai-col" value="${c}" checked
                   style="accent-color:var(--purple);cursor:pointer">
            <span style="font-weight:600">${c}</span>${val}
          </label>`;
        }).join('')
      : '<span style="font-size:12px;color:var(--grey)">No columns found.</span>';

    // ── Optional style hint ──────────────────────────────────────────────
    const banner = running ? '' :
      `<div style="background:#FFF3CD;border:1px solid #FFD700;border-radius:8px;
                   padding:10px 14px;margin-bottom:12px;font-size:13px;color:#856404">
         ⚠️ AI service not running. Start via <strong>run_local.py</strong> first.
       </div>`;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="ai-poster-modal"
           onclick="">
        <div class="modal" style="max-width:780px;width:95vw">
          <div class="modal-header">
            <div class="modal-title">🤖 AI Poster Generator</div>
            <button class="modal-close" onclick="document.getElementById('ai-poster-modal').remove()">×</button>
          </div>
          <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
            ${banner ? `<div style="grid-column:1/-1">${banner}</div>` : ''}

            <!-- LEFT: columns -->
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--purple-dark);margin-bottom:6px">
                🏷️ Property fields to include
                <span style="font-weight:400;color:var(--grey);margin-left:6px">
                  <a href="#" onclick="document.querySelectorAll('input[name=ai-col]').forEach(c=>c.checked=true);return false"
                     style="color:var(--purple);font-size:10px">All</a>
                  &nbsp;·&nbsp;
                  <a href="#" onclick="document.querySelectorAll('input[name=ai-col]').forEach(c=>c.checked=false);return false"
                     style="color:var(--purple);font-size:10px">None</a>
                </span>
              </div>
              <div style="max-height:240px;overflow-y:auto;border:1px solid var(--grey-light);
                          border-radius:8px;padding:10px 12px;background:#fafafa">
                ${colsHtml}
              </div>

              <div style="margin-top:14px">
                <div style="font-size:12px;font-weight:700;color:var(--purple-dark);margin-bottom:6px">
                  ✍️ Style hint
                  <span style="font-weight:400;color:var(--grey)"> (optional — AI decides freely if blank)</span>
                </div>
                <textarea id="ai-style-hint" rows="3"
                  placeholder="e.g. luxury dark theme with gold accents&#10;or: bright modern with lots of white space&#10;Leave blank — AI chooses the best style for this property"
                  style="width:100%;font-size:12px;padding:8px;border-radius:8px;
                         border:1px solid var(--grey-light);resize:vertical;
                         color:var(--grey-dark);line-height:1.5;box-sizing:border-box"></textarea>
              </div>
            </div>

            <!-- RIGHT: photos + size + info -->
            <div style="display:flex;flex-direction:column;gap:14px">
              <div>
                <div style="font-size:12px;font-weight:700;color:var(--purple-dark);margin-bottom:8px">
                  📷 Photos
                  <span style="font-weight:400;color:var(--grey)">(select up to 3 — all will be used)</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">${photoHtml}</div>
              </div>
              <div>
                <div style="font-size:12px;font-weight:700;color:var(--purple-dark);margin-bottom:8px">📐 Poster size</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <label class="ai-size-opt" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 12px;border-radius:8px;border:2px solid var(--purple);transition:.15s"
                         onclick="document.querySelectorAll('.ai-size-opt').forEach(l=>l.style.borderColor='var(--grey-light)');this.style.borderColor='var(--purple)'">
                    <input type="radio" name="ai-size" value="1024x1536" checked style="display:none">
                    <span style="font-size:16px">📱</span>
                    <span style="font-size:11px;font-weight:700;color:var(--purple-dark)">Portrait</span>
                    <span style="font-size:9px;color:var(--grey)">1024×1536</span>
                    <span style="font-size:9px;color:var(--grey)">Instagram / Print</span>
                  </label>
                  <label class="ai-size-opt" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 12px;border-radius:8px;border:2px solid var(--grey-light);transition:.15s"
                         onclick="document.querySelectorAll('.ai-size-opt').forEach(l=>l.style.borderColor='var(--grey-light)');this.style.borderColor='var(--purple)'">
                    <input type="radio" name="ai-size" value="1024x1024" style="display:none">
                    <span style="font-size:16px">⬛</span>
                    <span style="font-size:11px;font-weight:700;color:var(--purple-dark)">Square</span>
                    <span style="font-size:9px;color:var(--grey)">1024×1024</span>
                    <span style="font-size:9px;color:var(--grey)">Facebook / Feed</span>
                  </label>
                  <label class="ai-size-opt" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 12px;border-radius:8px;border:2px solid var(--grey-light);transition:.15s"
                         onclick="document.querySelectorAll('.ai-size-opt').forEach(l=>l.style.borderColor='var(--grey-light)');this.style.borderColor='var(--purple)'">
                    <input type="radio" name="ai-size" value="1536x1024" style="display:none">
                    <span style="font-size:16px">🖥️</span>
                    <span style="font-size:11px;font-weight:700;color:var(--purple-dark)">Landscape</span>
                    <span style="font-size:9px;color:var(--grey)">1536×1024</span>
                    <span style="font-size:9px;color:var(--grey)">LinkedIn / Banner</span>
                  </label>
                </div>
              </div>
              <div style="background:var(--purple-xpale);border-radius:8px;padding:12px;
                          font-size:12px;color:var(--grey-dark);line-height:1.6">
                <strong>How it works:</strong><br>
                3 unique poster variations are generated in parallel.<br>
                Pick the ones you like and download or open in Canva.<br><br>
                ${running
                  ? '✅ Service running · typically <strong>20–45 seconds</strong>'
                  : '❌ Start run_local.py first'}<br><br>
                Needs <code>OPENAI_API_KEY</code> in <code>python-service/.env</code>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="document.getElementById('ai-poster-modal').remove()">Cancel</button>
            <button class="btn btn-primary"
                    onclick="UI._runAIPosterGeneration('${cat}','${rowId}')"
                    ${running ? '' : 'disabled'}>
              ✨ Generate Poster
            </button>
          </div>
        </div>
      </div>`);

    this._aiSelectedPhotos = photos.length ? [photos[0].url] : [];
  },


  _aiTogglePhoto(url, el) {
    if (!this._aiSelectedPhotos) this._aiSelectedPhotos = [];
    const idx = this._aiSelectedPhotos.indexOf(url);
    if (idx === -1) {
      if (this._aiSelectedPhotos.length >= 3) { toast('Select up to 3 photos', 'warning'); return; }
      this._aiSelectedPhotos.push(url);
      el.style.borderColor = 'var(--purple)';
      el.querySelector('.ai-photo-num').textContent = this._aiSelectedPhotos.length;
      el.querySelector('.ai-photo-num').style.display = 'flex';
    } else {
      this._aiSelectedPhotos.splice(idx, 1);
      el.style.borderColor = 'var(--grey-light)';
      el.querySelector('.ai-photo-num').style.display = 'none';
      // Renumber remaining selected photos
      document.querySelectorAll('#ai-photo-picker > div').forEach(d => {
        const dUrl = d.dataset.url;
        const dIdx = this._aiSelectedPhotos.indexOf(dUrl);
        const numEl = d.querySelector('.ai-photo-num');
        if (numEl) {
          numEl.textContent = dIdx + 1;
          numEl.style.display = dIdx >= 0 ? 'flex' : 'none';
          d.style.borderColor = dIdx >= 0 ? 'var(--purple)' : 'var(--grey-light)';
        }
      });
    }
  },

  _toggleAiStyle(id, el) {
    const cb = el.querySelector('input');
    const checked = document.querySelectorAll('#ai-style-grid input:checked');
    if (!cb.checked && checked.length >= 3) { toast('Pick up to 3 styles', 'warning'); return; }
    cb.checked = !cb.checked;
    el.style.borderColor = cb.checked ? 'var(--purple)' : 'transparent';
    el.style.background   = cb.checked ? 'var(--purple-xpale)' : '';
  },

  async _runAIPosterGeneration(cat, rowId) {
    const selCols   = [...document.querySelectorAll('input[name="ai-col"]:checked')].map(cb => cb.value);
    const styleHint = (document.getElementById('ai-style-hint')?.value || '').trim();
    const heroPhotos = this._aiSelectedPhotos?.length ? [...this._aiSelectedPhotos] : null;
    const selSize   = document.querySelector('input[name="ai-size"]:checked')?.value || '1024x1536';

    document.getElementById('ai-poster-modal').remove();
    this._showAILoading(
      'Generating 3 poster options…',
      'All 3 run in parallel — AI picks a unique style for each. Usually 20–45 seconds.'
    );

    const result = await RCIRL_AI.generatePosterTriple(cat, rowId, selCols, heroPhotos, styleHint, selSize);
    this._hideAILoading();

    if (!result || !result.ok) {
      const err = result?.errors?.map(e => `Option ${e.variation}: ${e.error}`).join('\n') || 'Generation failed.';
      this._showAIError('Poster Generation Failed', err);
      return;
    }

    this._showPosterComparison(result.posters, result.fallback_copy);
  },

  _showPosterComparison(posters, fallbackCopy) {
    document.getElementById('ai-compare-modal')?.remove();

    const cards = posters.map((p, idx) => {
      const imgUrl = AI_API + p.url;
      const fname  = p.url.split('/').pop();
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;
                    padding:14px;border-radius:12px;border:3px solid transparent;
                    transition:.2s;background:#1a1a2e" id="pc-card-${idx}">
          <!-- Checkbox -->
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                        font-size:13px;font-weight:700;color:var(--purple-pale)">
            <input type="checkbox" id="pc-chk-${idx}" data-url="${imgUrl}" data-fname="${fname}"
                   checked onchange="UI._pcToggleCard(${idx},this)"
                   style="accent-color:var(--purple);width:16px;height:16px;cursor:pointer">
            ${p.label}
          </label>

          <!-- Poster image -->
          <div style="cursor:pointer;border-radius:8px;overflow:hidden;
                      box-shadow:0 4px 20px rgba(91,45,142,0.4)"
               onclick="UI.viewOutput('${imgUrl}','jpg','${fname}')">
            <img src="${imgUrl}" alt="${p.label}"
                 style="width:220px;height:auto;max-height:320px;
                        object-fit:contain;display:block" loading="lazy">
          </div>

          <!-- Per-poster actions -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
            <button class="btn btn-xs btn-secondary"
                    onclick="UI.viewOutput('${imgUrl}','jpg','${fname}')">👁 View</button>
            <button class="btn btn-xs btn-primary"
                    onclick="UI.downloadFile('${imgUrl}','${fname}')">⬇️ Download</button>
            <button class="btn btn-xs"
                    onclick="UI.openInCanva('${imgUrl}','${fname}')"
                    style="background:#7B2FBE;color:#fff;border:none;font-size:11px;
                           padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:600">
              🎨 Canva
            </button>
          </div>
        </div>`;
    }).join('');

    const note = fallbackCopy
      ? '<p style="font-size:11px;color:var(--grey);margin-top:8px">ℹ️ Copy generated from property data (add OPENAI_API_KEY for AI-written copy).</p>'
      : '';

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="ai-compare-modal"
           onclick="">
        <div class="modal" style="max-width:900px;width:95vw">
          <div class="modal-header">
            <div class="modal-title">🎨 AI Generated Posters — Pick your favourite(s)</div>
            <button class="modal-close"
                    onclick="document.getElementById('ai-compare-modal').remove()">×</button>
          </div>
          <div class="modal-body">
            <!-- Poster grid -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);
                        gap:16px;justify-items:center;margin-bottom:20px">
              ${cards}
            </div>

            <!-- Bulk actions bar -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        flex-wrap:wrap;gap:10px;padding:12px 16px;
                        background:var(--purple-xpale);border-radius:10px">
              <div style="display:flex;align-items:center;gap:12px">
                <label style="display:flex;align-items:center;gap:6px;
                              font-size:12px;color:var(--grey-dark);cursor:pointer">
                  <input type="checkbox" id="pc-chk-all" checked
                         onchange="UI._pcToggleAll(this)"
                         style="accent-color:var(--purple);width:15px;height:15px">
                  Select all
                </label>
                <span style="font-size:12px;color:var(--grey)" id="pc-sel-count">
                  ${posters.length} of ${posters.length} selected
                </span>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-primary" onclick="UI._pcDownloadSelected()">
                  ⬇️ Download Selected
                </button>
                <button class="btn btn-ghost"
                        onclick="document.getElementById('ai-compare-modal').remove()">
                  Close
                </button>
              </div>
            </div>
            ${note}
          </div>
        </div>
      </div>`);

    // Highlight selected cards
    posters.forEach((_, i) => UI._pcToggleCard(i, document.getElementById('pc-chk-' + i)));
  },

  _pcToggleCard(idx, chk) {
    const card = document.getElementById('pc-card-' + idx);
    if (!card) return;
    card.style.borderColor = chk.checked ? 'var(--purple)' : 'transparent';
    card.style.background  = chk.checked ? '#1a1a2e' : '#111';
    // Update "select all" state
    const all    = [...document.querySelectorAll('[id^="pc-chk-"]:not(#pc-chk-all)')];
    const checked = all.filter(c => c.checked).length;
    const allChk = document.getElementById('pc-chk-all');
    if (allChk) {
      allChk.checked       = checked === all.length;
      allChk.indeterminate = checked > 0 && checked < all.length;
    }
    const cnt = document.getElementById('pc-sel-count');
    if (cnt) cnt.textContent = `${checked} of ${all.length} selected`;
  },

  _pcToggleAll(allChk) {
    document.querySelectorAll('[id^="pc-chk-"]:not(#pc-chk-all)')
      .forEach((c, i) => { c.checked = allChk.checked; UI._pcToggleCard(i, c); });
  },

  async _pcDownloadSelected() {
    const checked = [...document.querySelectorAll('[id^="pc-chk-"]:not(#pc-chk-all)')].filter(c => c.checked);
    if (!checked.length) { toast('Select at least one poster', 'error'); return; }
    for (const chk of checked) {
      await UI.downloadFile(chk.dataset.url, chk.dataset.fname);
      await new Promise(r => setTimeout(r, 400)); // small delay between downloads
    }
    toast(`Downloaded ${checked.length} poster${checked.length > 1 ? 's' : ''}`, 'success');
  },


  /* ══════════════════════════════════════════════════════════
     AI PRESENTATION — AI Brochure per property in cart
  ══════════════════════════════════════════════════════════ */
  async generateAIPresentation() {
    if (!this.presentCart?.length) { toast('Add properties to cart first', 'error'); return; }

    const running = await RCIRL_AI.isRunning();
    if (!running) {
      toast('AI service is not running. Start it via run_local.py first.', 'error'); return;
    }

    // Load columns from the first cart item's category
    const firstItem = this.presentCart[0];
    let columns = [];
    try {
      const data = await RCIRL_DATA.getProperties(firstItem.cat);
      columns = (data.columns || []).filter(c => !c.startsWith('_'));
    } catch (e) { /* fallback: no column picker */ }

    // Show config modal before generating
    await this._showBrochureConfigModal(columns);
  },

  async _showBrochureConfigModal(columns) {
    document.getElementById('ai-brochure-config-modal')?.remove();

    const colsHtml = columns.length
      ? columns.map(c =>
          `<label style="display:flex;align-items:center;gap:7px;font-size:12px;
                         color:var(--grey-dark);padding:3px 0;cursor:pointer">
            <input type="checkbox" name="brochure-col" value="${c}" checked
                   style="accent-color:var(--purple);cursor:pointer">
            <span style="font-weight:600">${c}</span>
          </label>`
        ).join('')
      : '<span style="font-size:12px;color:var(--grey)">No columns found.</span>';

    const settings = RCIRL_DATA.getSettings();
    const company  = settings.companyName || 'RCIRL Property Consultant';

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="ai-brochure-config-modal">
        <div class="modal" style="max-width:520px;width:95vw">
          <div class="modal-header">
            <div class="modal-title">📄 Configure AI Brochure</div>
            <button class="modal-close" onclick="document.getElementById('ai-brochure-config-modal').remove()">×</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">

            <div>
              <div style="font-size:12px;font-weight:700;color:var(--purple-dark);margin-bottom:6px">
                🏷️ Columns to include in brochure
                <span style="font-weight:400;color:var(--grey);margin-left:6px">
                  <a href="#" onclick="document.querySelectorAll('input[name=brochure-col]').forEach(c=>c.checked=true);return false"
                     style="color:var(--purple);font-size:10px">All</a>
                  &nbsp;·&nbsp;
                  <a href="#" onclick="document.querySelectorAll('input[name=brochure-col]').forEach(c=>c.checked=false);return false"
                     style="color:var(--purple);font-size:10px">None</a>
                </span>
              </div>
              <div style="max-height:220px;overflow-y:auto;border:1px solid var(--grey-light);
                          border-radius:8px;padding:10px 14px;background:#fafafa;
                          display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
                ${colsHtml}
              </div>
            </div>

            <div>
              <div style="font-size:12px;font-weight:700;color:var(--purple-dark);margin-bottom:6px">🏢 Company name</div>
              <input id="brochure-company" type="text" value="${company}"
                     style="width:100%;font-size:13px;padding:8px 10px;border-radius:8px;
                            border:1px solid var(--grey-light);box-sizing:border-box">
            </div>

            <div style="background:var(--purple-xpale);border-radius:8px;padding:10px 14px;
                        font-size:12px;color:var(--grey-dark)">
              Generating brochure for <strong>${this.presentCart.length}</strong>
              propert${this.presentCart.length > 1 ? 'ies' : 'y'}.
              Each brochure is a 2-page A4 PDF with a cover page and a details page.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="document.getElementById('ai-brochure-config-modal').remove()">Cancel</button>
            <button class="btn btn-primary" onclick="UI._runBrochureGeneration()">
              📄 Generate Brochures
            </button>
          </div>
        </div>
      </div>`);
  },

  async _runBrochureGeneration() {
    const selCols = [...document.querySelectorAll('input[name="brochure-col"]:checked')].map(cb => cb.value);
    const company = document.getElementById('brochure-company')?.value?.trim()
                    || 'RCIRL Property Consultant';

    document.getElementById('ai-brochure-config-modal').remove();

    this._showAILoading(
      `Generating ${this.presentCart.length} brochure${this.presentCart.length > 1 ? 's' : ''}…`,
      'Building a 2-page PDF for each property.'
    );

    const items = this.presentCart.map(c => ({
      cat:          c.cat,
      row_id:       c.rowId,
      company_name: company,
      columns:      selCols,
    }));

    const result = await RCIRL_AI.generateBrochureBatch(items);
    this._hideAILoading();

    if (!result?.results) { toast('Brochure generation failed', 'error'); return; }

    const successes = result.results.filter(r => r.ok);
    const fails     = result.results.filter(r => !r.ok);

    if (!successes.length) { toast('All brochures failed — check the AI service log', 'error'); return; }

    document.getElementById('ai-brochure-modal')?.remove();
    const cards = successes.map(r => {
      const url   = AI_API + r.url;
      const fname = r.url.split('/').pop();
      const name  = this.presentCart.find(c => c.rowId === r.row_id)?.name || r.row_id;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:12px 14px;background:var(--purple-xpale);
                    border-radius:8px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:var(--purple-dark)">📄 ${name}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-xs btn-secondary"
                    onclick="UI.viewOutput('${url}','pdf','${fname}')">👁 View</button>
            <button class="btn btn-xs btn-primary"
                    onclick="UI.downloadFile('${url}','${fname}')">⬇️ Download</button>
            <button class="btn btn-xs"
                    onclick="UI.openInCanva('${url}','${fname}')"
                    style="background:#7B2FBE;color:#fff;border:none;font-size:11px;
                           padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:600">
              🎨 Open in Canva
            </button>
          </div>
        </div>`;
    }).join('');

    const failNote = fails.length
      ? `<p style="font-size:12px;color:var(--danger);margin-top:10px">
           ⚠️ ${fails.length} brochure(s) failed:
           ${fails.map(f => f.error || 'unknown error').join('; ')}
         </p>`
      : '';

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="ai-brochure-modal">
        <div class="modal" style="max-width:580px;width:95vw">
          <div class="modal-header">
            <div class="modal-title">📄 AI Brochures Ready</div>
            <button class="modal-close"
                    onclick="document.getElementById('ai-brochure-modal').remove()">×</button>
          </div>
          <div class="modal-body">
            ${cards}
            ${failNote}
            <p style="font-size:11px;color:var(--grey);margin-top:10px">
              💡 <strong>Open in Canva</strong> — the brochure opens as an editable design.
              Click any element to move or resize it, and use the Text tool to edit text.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost"
                    onclick="document.getElementById('ai-brochure-modal').remove()">Close</button>
          </div>
        </div>
      </div>`);

    if (this.currentPage === 'outputs') this.renderOutputs();
  },

  /* ══════════════════════════════════════════════════════════
     LOADING OVERLAY helper
  ══════════════════════════════════════════════════════════ */
  _showAIError(title, message) {
    document.getElementById('ai-loading-overlay')?.remove();
    document.getElementById('ai-error-modal')?.remove();

    const isQuota = /quota|RESOURCE_EXHAUSTED|429|billing|insufficient/i.test(message);
    const extraHelp = isQuota
      ? `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px 14px;margin-top:12px;font-size:13px;color:#5d4037">
           <strong>💳 OpenAI billing/quota issue:</strong><br>
           Check your usage and billing at
           <a href="https://platform.openai.com/account/billing" target="_blank" style="color:var(--purple)">platform.openai.com/account/billing</a>.
           gpt-image-1 costs roughly $0.02–0.07 per poster depending on quality.
         </div>`
      : `<p style="font-size:12px;color:var(--grey);margin-top:12px">Common causes:<br>
         • <strong>Property not found</strong> — run run_local.py so migration runs first<br>
         • <strong>No photos uploaded</strong> — upload at least one photo for this property<br>
         • <strong>OPENAI_API_KEY not set</strong> — add it to python-service/.env<br>
         • <strong>OpenAI billing issue</strong> — check platform.openai.com/account/billing</p>`;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="ai-error-modal" onclick="if(event.target.id==='ai-error-modal')document.getElementById('ai-error-modal').remove()">
        <div class="modal" style="max-width:520px;width:95vw">
          <div class="modal-header">
            <div class="modal-title">⚠️ ${title}</div>
            <button class="modal-close" onclick="document.getElementById('ai-error-modal').remove()">×</button>
          </div>
          <div class="modal-body">
            <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;background:#fff3f3;border:1px solid #ffcdd2;border-radius:8px;padding:12px;color:#b71c1c;font-family:monospace">${message}</pre>
            ${extraHelp}
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" onclick="document.getElementById('ai-error-modal').remove()">OK</button>
          </div>
        </div>
      </div>`);
  },

  _showAILoading(title, sub) {
    document.getElementById('ai-loading-overlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div id="ai-loading-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center">
        <div style="background:#fff;border-radius:16px;padding:40px 48px;text-align:center;max-width:360px">
          <div style="font-size:36px;margin-bottom:16px">🤖</div>
          <div style="font-size:16px;font-weight:700;color:var(--purple-dark);margin-bottom:8px">${title}</div>
          <div style="font-size:13px;color:var(--grey);margin-bottom:20px">${sub}</div>
          <div style="display:flex;gap:6px;justify-content:center">
            ${[0,1,2].map(i=>`<div style="width:10px;height:10px;border-radius:50%;background:var(--purple);animation:bounce .9s ${i*0.2}s infinite alternate"></div>`).join('')}
          </div>
        </div>
      </div>
      <style>@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-12px)}}</style>`);
  },

  _hideAILoading() {
    document.getElementById('ai-loading-overlay')?.remove();
  },
});
