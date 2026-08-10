/* ═══════════════════════════════════════════════════════════════
   RCIRL v3 — Data Layer
   Excel files ARE the database. PHP reads/writes .xlsx directly.
   ═══════════════════════════════════════════════════════════════ */

const API = 'api/api.php';

const RCIRL_DATA = {

  /* ── In-memory cache (per page load — server is always truth) ── */
  _cache:      {},
  _settings:   null,
  _customCats: {},

  /* ── Default columns (used only when creating a brand-new category) ── */
  DEFAULT_COLUMNS: {
    residential: ['Property ID','Property Name','Location / Area','BHK','Furnished Status','Type','Total Sq.Ft.','Built-Up Sq.Ft.','Floor','Total Floors','Facing','Parking','Amenities','Age of Property (Yrs)','Sq.Ft. Rate (₹)','Price (₹)','Price (Readable)','Availability','Owner Name','Contact','Remarks'],
    commercial:  ['Property ID','Property Name','Location / Area','Property Sub-Type','Total Sq.Ft.','Carpet Area Sq.Ft.','Floor','Total Floors','Furnished Status','Facing','Parking (Cars)','Power Supply (KW)','Washrooms','Amenities','Age (Yrs)','Sq.Ft. Rate (₹)','Price / Rent (₹)','Transaction Type','Owner / Agent','Contact','Remarks'],
    industrial:  ['Property ID','Property Name','Location / Area','Property Sub-Type','Plot Area (Sq.Ft.)','Built-Up Area (Sq.Ft.)','Ceiling Height (ft)','Power Supply (KW)','Water Supply','Flooring Type','Loading Docks','Parking (Trucks)','Crane Provision','Road Width (ft)','Zoning / Approval','Age (Yrs)','Rate per Sq.Ft. (₹)','Price (₹)','Transaction Type','Owner / Agent','Contact','Remarks'],
    land:        ['Property ID','Property Name','Location / Area','Land Type','Total Area (Sq.Ft.)','Total Area (Cents/Acres)','Dimensions (ft)','Facing','Road Width (ft)','Road Type','Zoning','DTCP / CMDA Approved','Patta / Documents','Soil Type','Water Source Available','Electricity Available','Distance from City (km)','Near Landmarks','Rate per Sq.Ft. (₹)','Total Price (₹)','Price (Readable)','Owner Name','Contact','Remarks'],
  },

  /* ── Built-in category metadata ─────────────────────────────── */
  BUILTIN_META: {
    residential: { label: 'Residential', icon: '🏠', color: '#5B2D8E' },
    commercial:  { label: 'Commercial',  icon: '🏢', color: '#0277BD' },
    industrial:  { label: 'Industrial',  icon: '🏭', color: '#E65100' },
    land:        { label: 'Raw Land',    icon: '🌿', color: '#2E7D32' },
  },

  /* ══════════════════════════════════════════════════════════
     INIT — load settings + custom categories from server
  ══════════════════════════════════════════════════════════ */
  async init() {
    const [settings, cats] = await Promise.all([
      this.api('get', `${API}?action=get_settings`),
      this.api('get', `${API}?action=get_categories`),
    ]);
    this._settings   = settings || {};
    this._customCats = (cats && cats.custom) ? cats.custom : {};
    return true;
  },

  /* ── Fetch wrapper ───────────────────────────────────────── */
  async api(method, url, body) {
    try {
      const opts = { method: method.toUpperCase() };
      if (body && !(body instanceof FormData)) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body    = JSON.stringify(body);
      } else if (body instanceof FormData) {
        opts.body = body;
      }
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      return await r.json();
    } catch(e) {
      console.error('API error:', url, e.message);
      return null;
    }
  },

  /* ══════════════════════════════════════════════════════════
     PROPERTIES — all reads/writes go to Excel on server
  ══════════════════════════════════════════════════════════ */
  async getProperties(cat) {
    if (this._cache[cat]) return this._cache[cat];
    const data = await this.api('get', `${API}?action=get_properties&cat=${cat}`);
    const result = data && !data.error ? data : { columns: this.DEFAULT_COLUMNS[cat] || [], rows: [] };
    this._cache[cat] = result;
    return result;
  },

  invalidateCache(cat) { delete this._cache[cat]; },

  async addRow(cat, rowObj) {
    const res = await this.api('post', `${API}?action=add_row`, { cat, row: rowObj });
    this.invalidateCache(cat);
    return res && res.ok ? res.row : null;
  },

  async updateRow(cat, rowId, updates) {
    const res = await this.api('post', `${API}?action=update_row`, { cat, row_id: rowId, row: updates });
    this.invalidateCache(cat);
    return res;
  },

  async deleteRow(cat, rowId) {
    const res = await this.api('post', `${API}?action=delete_row`, { cat, row_id: rowId });
    this.invalidateCache(cat);
    return res;
  },

  /* ── Search (client-side filter after server fetch) ─────── */
  async searchRows(cat, query, filters) {
    const data = await this.getProperties(cat);
    let rows   = data.rows || [];

    if (query && query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(q))
      );
    }

    if (filters) {
      Object.entries(filters).forEach(([col, val]) => {
        if (val && val !== '__all__') {
          rows = rows.filter(r => String(r[col] || '').toLowerCase().includes(val.toLowerCase()));
        }
      });
    }

    return { columns: data.columns || [], rows };
  },

  /* ══════════════════════════════════════════════════════════
     EXCEL IMPORT
     Sends the actual .xlsx file to PHP → PHP parses it and
     overwrites the category's Excel file on the server.
     Any columns in the uploaded file appear in the app.
  ══════════════════════════════════════════════════════════ */
  async importExcel(file, cat) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('cat',  cat);
    const res = await this.api('post', `${API}?action=import_excel`, fd);
    this.invalidateCache(cat);
    if (res && res.ok) return { columns: res.columns, count: res.count };
    throw new Error(res ? res.error : 'Import failed');
  },

  /* ══════════════════════════════════════════════════════════
     EXCEL EXPORT — download the live Excel file directly
     Since the xlsx on the server IS the database, we just
     let the user download it directly.
  ══════════════════════════════════════════════════════════ */
  exportExcel(cat) {
    return new Promise(resolve => {
      const a  = document.createElement('a');
      a.href   = API + '?action=export_excel&cat=' + (cat || 'residential');
      a.target = '_blank';
      a.click();
      setTimeout(resolve, 500);
    });
  },

  /* ══════════════════════════════════════════════════════════
     PHOTOS
  ══════════════════════════════════════════════════════════ */
  async getPhotos(cat, rowId) {
    const res = await this.api('get', `${API}?action=get_photos&cat=${cat}&row_id=${rowId}`);
    return (res && res.photos) ? res.photos : [];
  },

  async uploadPhoto(cat, rowId, file) {
    const fd = new FormData();
    fd.append('photo',  file);
    fd.append('cat',    cat);
    fd.append('row_id', rowId);
    return await this.api('post', `${API}?action=upload_photo`, fd);
  },

  async deletePhoto(cat, rowId, filename) {
    return await this.api('post', `${API}?action=delete_photo`, { cat, row_id: rowId, filename });
  },

  /* ══════════════════════════════════════════════════════════
     OUTPUTS
  ══════════════════════════════════════════════════════════ */
  async getOutputs() {
    const res = await this.api('get', `${API}?action=get_outputs`);
    return (res && res.outputs) ? res.outputs : [];
  },

  async saveOutput(blob, filename, type, properties) {
    const fd = new FormData();
    fd.append('file',       blob, filename);
    fd.append('filename',   filename);
    fd.append('type',       type);
    fd.append('properties', JSON.stringify(properties));
    return await this.api('post', `${API}?action=save_output`, fd);
  },

  async deleteOutput(filename) {
    return await this.api('post', `${API}?action=delete_output`, { filename });
  },

  /* ══════════════════════════════════════════════════════════
     SETTINGS & CATEGORIES
  ══════════════════════════════════════════════════════════ */
  getSettings() { return this._settings || {}; },

  async saveSettings(data) {
    this._settings = data;
    return await this.api('post', `${API}?action=save_settings`, data);
  },

  getAllCategories() {
    return { ...this.BUILTIN_META, ...this._customCats };
  },

  async addCategory(key, meta) {
    this._customCats[key] = meta;
    await this.api('post', `${API}?action=save_categories`, { custom: this._customCats });
    // Create a blank Excel file for the new category via a dummy add then delete
    // Actually just call add_row with empty data to trigger Excel creation
    await this.api('post', `${API}?action=add_row`, {
      cat: key,
      row: { 'Property ID': 'SAMPLE-001', 'Property Name': 'Sample Property', 'Location / Area': 'Location', 'Remarks': 'Delete this row' }
    });
  },
};

/* ── Utility helpers ───────────────────────────────────────────── */
function formatINR(val) {
  const n = parseFloat(String(val).replace(/[^\d.]/g,''));
  if (isNaN(n)) return val || '—';
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + ' Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(2)   + ' L';
  return '₹' + n.toLocaleString('en-IN');
}

function slugify(str) {
  return String(str).replace(/[^a-zA-Z0-9]/g,'_').replace(/_+/g,'_').slice(0,40);
}

function dtString() {
  const d = new Date();
  return d.toISOString().slice(0,10) + '_' + d.toTimeString().slice(0,5).replace(':','h');
}

/* ══════════════════════════════════════════════════════════
   AI SERVICE (Python FastAPI on :8001)
   All calls are best-effort — if the service isn't running
   or a key is missing, we return {ok:false, error:'...'}.
══════════════════════════════════════════════════════════ */
const AI_API = (() => {
  // On Railway, both PHP and Python run behind the same proxy
  // so API calls go to the same hostname but via /api path prefix
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8001';
  }
  // On Railway: same origin, no port needed (proxy handles routing)
  return window.location.origin;
})();

const RCIRL_AI = {

  async _call(method, path, body) {
    try {
      const opts = { method: method.toUpperCase() };
      if (body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body    = JSON.stringify(body);
      }
      const r = await fetch(AI_API + path, opts);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        return { ok: false, error: err.detail || r.statusText };
      }
      return await r.json();
    } catch(e) {
      return { ok: false, error: e.message.includes('fetch') ? 'AI service is not running. Start it with run_local.py.' : e.message };
    }
  },

  async isRunning() {
    try {
      const r = await fetch(AI_API + '/', { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  },

  async getStyles() {
    return await this._call('get', '/generate/styles');
  },

  async generatePosterSingle(cat, rowId, columns, heroPhotoUrls, styleHint, variation = 1, size = '1024x1536') {
    return await this._call('post', '/generate/poster/single', {
      cat, row_id: rowId,
      columns:         columns || [],
      hero_photo_urls: Array.isArray(heroPhotoUrls) ? heroPhotoUrls : (heroPhotoUrls ? [heroPhotoUrls] : []),
      style_prompt:    styleHint || '',
      variation,
      size,
    });
  },

  async generatePosterTriple(cat, rowId, columns, heroPhotoUrls, styleHint, size = '1024x1536') {
    /* Generate 3 independent poster variations in parallel. */
    const results = await Promise.allSettled([
      this.generatePosterSingle(cat, rowId, columns, heroPhotoUrls, styleHint, 1, size),
      this.generatePosterSingle(cat, rowId, columns, heroPhotoUrls, styleHint, 2, size),
      this.generatePosterSingle(cat, rowId, columns, heroPhotoUrls, styleHint, 3, size),
    ]);
    const posters = [], errors = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value?.ok) {
        const p = r.value.posters?.[0];
        if (p) posters.push(p);
      } else {
        errors.push({ variation: i + 1, error: r.reason?.message || 'Failed' });
      }
    });
    return { ok: posters.length > 0, posters, errors, fallback_copy: results[0]?.value?.fallback_copy };
  },

  async generatePosterBatch(cat, rowId, styles, size, fields, photos, quality) {
    return await this._call('post', '/generate/poster/batch', { cat, row_id: rowId, styles, size, fields, hero_photo_url: photos?.[0] || null, quality: quality || 'medium' });
  },

  async generateBrochure(cat, rowId, companyName) {
    return await this._call('post', '/generate/brochure', { cat, row_id: rowId, company_name: companyName || 'RCIRL Property Consultant' });
  },

  async generateBrochureBatch(items) {
    // items already contain { cat, row_id, company_name, columns }
    return await this._call('post', '/generate/brochure/batch', items);
  },

  async generateCopy(cat, rowId, tone) {
    return await this._call('post', '/generate/copy', { cat, row_id: rowId, tone: tone || 'modern' });
  },
};
