/* ══════════════════════════════════════════════════════════════
   AI_UI — modals for AI Poster (Nano Banana, 3 variants) and
   AI Presentation (AI-written PDF brochure). Wired to RCIRL_AI
   (python-service) rather than RCIRL_DATA (PHP app).
══════════════════════════════════════════════════════════════ */
const AI_UI = {

  async openToolsModal(cat, rowId, propName) {
    const health = await RCIRL_AI.health();
    if (!health) {
      toast('AI service is not running. Start it with run_local.py (see README).', 'error');
      return;
    }

    const html =
      '<div class="modal-overlay" id="ai-tools-modal"><div class="modal" style="max-width:420px">' +
      '<div class="modal-header"><div class="modal-title">✨ AI Tools — ' + (propName || '') + '</div>' +
      '<button class="modal-close" onclick="UI.closeModal(\'ai-tools-modal\')">×</button></div>' +
      '<div class="modal-body" style="display:flex;flex-direction:column;gap:12px">' +
      '<button class="btn btn-primary" style="justify-content:flex-start;padding:16px" onclick="UI.closeModal(\'ai-tools-modal\');AI_UI.openPosterModal(\'' + cat + '\',\'' + rowId + '\',\'' + (propName || '').replace(/'/g, "\\'") + '\')">' +
      '🖼️ AI Poster <span style="font-weight:400;font-size:12px;margin-left:auto;opacity:0.8">Nano Banana · 3 options</span></button>' +
      '<button class="btn btn-primary" style="justify-content:flex-start;padding:16px" onclick="UI.closeModal(\'ai-tools-modal\');AI_UI.generateBrochureNow(\'' + cat + '\',\'' + rowId + '\')">' +
      '📄 AI Presentation <span style="font-weight:400;font-size:12px;margin-left:auto;opacity:0.8">AI-written PDF</span></button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async openPosterModal(cat, rowId, propName) {
    let styles = [];
    try {
      const r = await RCIRL_AI.posterStyles();
      styles = r.styles;
    } catch (e) {
      toast('Could not load poster styles: ' + e.message, 'error');
      return;
    }

    const styleHtml = styles.map((s, i) =>
      '<div class="tmpl-thumb' + (i === 1 ? ' selected' : '') + '" id="ai-style-' + s.id + '" onclick="AI_UI.selectStyle(\'' + s.id + '\')" title="' + s.description.replace(/"/g, '&quot;') + '">' +
      '<div class="tmpl-swatch" style="background:linear-gradient(135deg,#5B2D8E,#2D0F5C)"></div>' + s.label + '</div>'
    ).join('');

    const html =
      '<div class="modal-overlay" id="ai-poster-modal"><div class="modal modal-xl">' +
      '<div class="modal-header"><div class="modal-title">🖼️ AI Poster — ' + (propName || '') + '</div>' +
      '<button class="modal-close" onclick="UI.closeModal(\'ai-poster-modal\')">×</button></div>' +
      '<div class="modal-body">' +
      '<div class="form-group"><label class="form-label">Style</label>' +
      '<div class="tmpl-thumb-row" id="ai-style-row">' + styleHtml + '</div></div>' +
      '<div id="ai-poster-status" style="margin-top:16px"></div>' +
      '<div id="ai-poster-results" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px"></div>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="UI.closeModal(\'ai-poster-modal\')">Close</button>' +
      '<button class="btn btn-primary" id="ai-poster-generate-btn" onclick="AI_UI.generatePosters(\'' + cat + '\',\'' + rowId + '\')">✨ Generate 3 Options</button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    this._selectedStyle = styles[1] ? styles[1].id : (styles[0] ? styles[0].id : 'modern');
  },

  selectStyle(id) {
    this._selectedStyle = id;
    document.querySelectorAll('#ai-style-row .tmpl-thumb').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('ai-style-' + id);
    if (el) el.classList.add('selected');
  },

  async generatePosters(cat, rowId) {
    const statusEl = document.getElementById('ai-poster-status');
    const resultsEl = document.getElementById('ai-poster-results');
    const btn = document.getElementById('ai-poster-generate-btn');
    btn.disabled = true;
    statusEl.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:var(--grey-dark)"><span class="spinner-purple"></span> Generating 3 poster options — this can take 20–40 seconds…</div>';
    resultsEl.innerHTML = '';

    try {
      const result = await RCIRL_AI.generatePosterVariants(cat, rowId, this._selectedStyle || 'modern');
      this._currentVariants = result.variants.map(v => v.filename);
      statusEl.innerHTML = '<p style="font-size:13px;color:var(--grey-dark)">Pick the one you want — the other two are discarded once you save.</p>';
      resultsEl.innerHTML = result.variants.map((v, i) =>
        '<div style="display:flex;flex-direction:column;gap:8px;align-items:center">' +
        '<img src="' + RCIRL_AI.BASE + v.preview_url + '" style="width:100%;border-radius:8px;border:3px solid var(--grey-light);cursor:pointer" id="ai-variant-img-' + i + '" onclick="AI_UI.pickVariant(' + i + ')">' +
        '<button class="btn btn-sm btn-secondary" id="ai-variant-btn-' + i + '" onclick="AI_UI.saveVariant(\'' + cat + '\',\'' + rowId + '\',\'' + v.filename + '\')">Save this one</button>' +
        '</div>'
      ).join('');
    } catch (e) {
      statusEl.innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
    } finally {
      btn.disabled = false;
    }
  },

  pickVariant(i) {
    for (let j = 0; j < (this._currentVariants || []).length; j++) {
      const img = document.getElementById('ai-variant-img-' + j);
      if (img) img.style.borderColor = j === i ? 'var(--purple)' : 'var(--grey-light)';
    }
  },

  async saveVariant(cat, rowId, filename) {
    try {
      await RCIRL_AI.savePoster(cat, rowId, filename, this._currentVariants || [filename]);
      toast('Poster saved to Outputs!', 'success');
      UI.closeModal('ai-poster-modal');
      if (UI.currentPage === 'outputs') UI.renderOutputs();

      // Show Canva edit prompt — open blank Canva poster template for manual polish
      const localUrl = `http://127.0.0.1:8000/outputs/${filename}`;
      const canvaUrl = 'https://www.canva.com/create/posters/';
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#fff;padding:14px 20px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 24px rgba(0,0,0,0.4);z-index:9999;font-size:14px;max-width:480px';
      msg.innerHTML =
        '<span>🎨 Want to refine it further?</span>' +
        '<a href="' + canvaUrl + '" target="_blank" style="background:#7C3AED;color:#fff;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:600;white-space:nowrap">Open Canva ↗</a>' +
        '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:18px;line-height:1">×</button>';
      document.body.appendChild(msg);
      setTimeout(() => { if (msg.parentNode) msg.remove(); }, 12000);
    } catch (e) {
      toast('Could not save poster: ' + e.message, 'error');
    }
  },

  async generateBrochureNow(cat, rowId) {
    toast('Generating AI presentation…', 'success');
    try {
      await RCIRL_AI.generateBrochure(cat, rowId);
      toast('Presentation ready — check Outputs!', 'success');
      if (UI.currentPage === 'outputs') UI.renderOutputs();

      // Canva nudge for brochure polish
      const canvaUrl = 'https://www.canva.com/create/brochures/';
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#fff;padding:14px 20px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 24px rgba(0,0,0,0.4);z-index:9999;font-size:14px;max-width:480px';
      msg.innerHTML =
        '<span>🎨 Want to tweak the brochure?</span>' +
        '<a href="' + canvaUrl + '" target="_blank" style="background:#7C3AED;color:#fff;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:600;white-space:nowrap">Open Canva ↗</a>' +
        '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:18px;line-height:1">×</button>';
      document.body.appendChild(msg);
      setTimeout(() => { if (msg.parentNode) msg.remove(); }, 12000);
    } catch (e) {
      toast('Could not generate presentation: ' + e.message, 'error');
    }
  },
};
