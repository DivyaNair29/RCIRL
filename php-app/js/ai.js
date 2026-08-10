/* ══════════════════════════════════════════════════════════════
   RCIRL_AI — talks to the local Python AI service (FastAPI, port 8001).
   Separate from RCIRL_DATA (which talks to the PHP app on port 8000).
   Both run locally side by side — see run_local.py.
══════════════════════════════════════════════════════════════ */
const RCIRL_AI = {
  BASE: 'http://127.0.0.1:8001',

  async _post(path, body) {
    const res = await fetch(this.BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'AI service request failed');
    return data;
  },

  async _get(path) {
    const res = await fetch(this.BASE + path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'AI service request failed');
    return data;
  },

  async health() {
    try {
      const res = await fetch(this.BASE + '/', { signal: AbortSignal.timeout(2000) });
      return res.ok ? res.json() : null;
    } catch {
      return null; // Python service not running — caller should handle this
    }
  },

  posterStyles()                          { return this._get('/generate/poster/styles'); },
  generateCopy(cat, rowId, tone)          { return this._post('/generate/copy', { cat, row_id: rowId, tone }); },
  generatePosterVariants(cat, rowId, style, tone) {
    return this._post('/generate/poster', { cat, row_id: rowId, style, tone: tone || 'modern' });
  },
  savePoster(cat, rowId, chosenFilename, allFilenames) {
    return this._post('/generate/poster/save', { cat, row_id: rowId, chosen_filename: chosenFilename, all_filenames: allFilenames });
  },
  generateBrochure(cat, rowId, companyName) {
    return this._post('/generate/brochure', { cat, row_id: rowId, company_name: companyName });
  },
  generateSocial(cat, rowId, platform)    { return this._post('/generate/social', { cat, row_id: rowId, platform }); },
  socialPlatforms()                       { return this._get('/generate/social/platforms'); },
};
