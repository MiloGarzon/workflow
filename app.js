/* FilmFlow Workflow — editor app */
(function () {
  const { PRESETS, BLOCK_TYPES, defaultProject, uid } = window.FFDefaults;
  const $ = s => document.querySelector(s);
  const isExport = !!window.FF_EXPORT || new URLSearchParams(location.search).get('mode') === 'export';
  const hasNative = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native);

  async function native(cmd, data = {}) {
    if (hasNative) return window.webkit.messageHandlers.native.postMessage({ cmd, ...data });
    return window.FFWeb.call(cmd, data);
  }
  const isWeb = !hasNative;
  // readable file name used for iCloud Drive/FilmFlow Workflow/Workflows (same rule as the Mac app)
  const syncName = p => ([p.name || 'Proyecto', p.version || ''].join(' ').trim() || 'Proyecto').replace(/[\\/:*?"<>|]+/g, '-');

  // ================= export mode =================
  if (isExport) {
    document.body.classList.add('export');
    let pages = [];
    window.prepareExport = async (json) => {
      const project = normalize(JSON.parse(json));
      pages = await FFRender.render(project, $('#exportRoot'), { export: true });
      return pages.length;
    };
    window.showExportPage = async (i) => {
      pages.forEach(p => p.classList.remove('show'));
      pages[i].classList.add('show');
      await new Promise(r => setTimeout(r, 40));
      return { w: pages[i]._dims.w, h: pages[i]._dims.h };
    };
    return;
  }

  // ================= state =================
  const state = { project: null, sel: 'project', collapsed: new Set(), zoom: 'fit', fileName: null, dirty: false };

  function normalize(p) {
    if (!p || !Array.isArray(p.sections)) return defaultProject();
    p.sections.forEach(s => { s.id = s.id || uid(); (s.blocks || []).forEach(b => b.id = b.id || uid()); s.blocks = s.blocks || []; });
    p.clientLogos = p.clientLogos || [];
    p.id = p.id || uid() + uid();
    return p;
  }
  const P = () => state.project;
  const secById = id => P().sections.find(s => s.id === id);
  const fileBase = () => {
    const p = P();
    const d = (p.date || '').replace(/-/g, '');
    return [p.code ? `${p.code} - ` : '', (p.docTitle || 'Workflow').toUpperCase(), d ? ` ${d}` : '', p.version ? ` ${p.version}` : ''].join('').trim();
  };

  // ================= helpers =================
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  function toast(msg, actions = [], ms = 3200) {
    const t = $('#toast');
    t.innerHTML = '';
    t.append(h('span', {}, msg), ...actions.map(a => h('button', { onclick: () => { a.fn(); t.classList.remove('show'); } }, a.label)));
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), actions.length ? 8000 : ms);
  }
  function busy(msg) {
    const b = h('div', { class: 'busy' }, msg);
    document.body.append(b);
    return () => b.remove();
  }

  let renderTimer, saveTimer;
  function changed(structural) {
    state.dirty = true;
    updateFileLabel();
    if (structural) renderSidebar();
    clearTimeout(renderTimer); renderTimer = setTimeout(renderPreview, 350);
    clearTimeout(saveTimer); saveTimer = setTimeout(saveToLibrary, 1800);
  }

  function projectMeta(p) {
    return JSON.stringify({ id: p.id, name: p.name || 'Sin nombre', code: p.code || '', client: p.client || '', version: p.version || '', date: p.date || '', theme: p.theme || 'dark', accent: p.accent || '#37A14F', sections: p.sections.length, active: p.sections.filter(x => !x.hidden).length, modified: p.updatedAt || new Date().toISOString() });
  }
  let saving = null;
  async function saveToLibrary() {
    clearTimeout(saveTimer);
    if (!P()) return;
    if (saving) await saving;
    const p = P();
    if (state.dirty || !p.updatedAt) p.updatedAt = new Date().toISOString();
    saving = native('libSave', { id: p.id, json: JSON.stringify(p), meta: projectMeta(p) }).catch(e => { toast('No se pudo guardar: ' + e); }).finally(() => { saving = null; });
    await saving;
    if (P() === p) { state.dirty = false; state.savedAt = new Date(); updateFileLabel(); }
  }

  function updateFileLabel() {
    const name = P()?.name || 'Proyecto';
    $('#fileName').textContent = state.dirty ? `${name} · guardando…` : `${name} · guardado${isWeb ? ' en este dispositivo' : ' en Mis proyectos'}`;
  }

  // ================= fields =================
  function field(label, input, hint) {
    return h('div', { class: 'f' }, label ? h('label', {}, label, hint ? h('em', {}, hint) : null) : null, input);
  }
  function fText(label, obj, key, o = {}) {
    const i = h('input', { type: o.type || 'text', placeholder: o.ph || '', step: o.step });
    i.value = obj[key] ?? '';
    i.addEventListener('input', () => { obj[key] = o.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; o.after && o.after(); changed(o.structural); });
    return field(label, i, o.hint);
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(520, t.scrollHeight + 2) + 'px'; }
  function fArea(label, obj, key, o = {}) {
    const t = h('textarea', { rows: o.rows || 4, placeholder: o.ph || '', class: o.mono ? 'mono' : '', spellcheck: 'true' });
    t.value = obj[key] ?? '';
    t.addEventListener('input', () => { obj[key] = t.value; autoGrow(t); o.after && o.after(); changed(); });
    requestAnimationFrame(() => autoGrow(t));
    const f = field(label, t, o.hint);
    if (o.help) f.append(h('div', { class: 'hint' }, o.help));
    return f;
  }
  function fChips(label, obj, key, options, o = {}) {
    const wrap = h('div', { class: 'chips-sel' });
    const cur = () => obj[key] ?? o.def;
    options.forEach(([v, l]) => {
      const b = h('button', { class: String(cur()) === String(v) ? 'on' : '' }, l);
      b.onclick = () => { obj[key] = v; [...wrap.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); o.after && o.after(); changed(o.structural); };
      wrap.append(b);
    });
    return field(label, wrap);
  }
  function fToggle(label, obj, key, o = {}) {
    const def = o.def ?? true;
    const c = h('input', { type: 'checkbox' });
    c.checked = obj[key] === undefined ? def : !!obj[key];
    c.onchange = () => { obj[key] = c.checked; o.after && o.after(); changed(o.structural); };
    return h('label', { class: 'toggle' }, c, label);
  }

  async function readImage(file) {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    if (/svg/.test(file.type)) return url;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const MAX = 2800;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 3.5e6) return url;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return /png/.test(file.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
  }

  function fImage(label, obj, key, o = {}) {
    const thumb = h('div', { class: 'thumb' });
    const info = h('div', { class: 'hint' });
    const fileIn = h('input', { type: 'file', accept: 'image/*' });
    const paint = () => {
      const v = obj[key];
      thumb.style.backgroundImage = v ? `url("${v}")` : '';
      thumb.textContent = v ? '' : '▧';
      info.textContent = v ? `Imagen cargada · ${Math.round(v.length * 0.75 / 1024)} KB` : (o.empty || 'Arrastra, pega (⌘V) o elige una imagen');
      rm.style.display = v ? '' : 'none';
    };
    const set = async (file) => {
      if (!file || !/^image\//.test(file.type)) return;
      obj[key] = await readImage(file);
      paint(); o.after && o.after(); changed();
    };
    const pick = h('button', { class: 'icon-btn', onclick: () => fileIn.click() }, 'Elegir…');
    const rm = h('button', { class: 'icon-btn danger', onclick: () => { obj[key] = ''; paint(); o.after && o.after(); changed(); } }, 'Quitar');
    fileIn.onchange = () => set(fileIn.files[0]);
    const box = h('div', { class: 'imgf', tabindex: '0' }, thumb, h('div', { class: 'ib' }, info, h('div', { class: 'btns' }, pick, rm)), fileIn);
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); set(e.dataTransfer.files[0]); });
    box.addEventListener('paste', e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (it) { e.preventDefault(); set(it.getAsFile()); } });
    box.addEventListener('click', e => { if (e.target === box || e.target === thumb) box.focus(); });
    paint();
    return field(label, box, o.hint);
  }

  // ================= sidebar =================
  const KIND_ICON = { cover: '◼', divider: '▌', toc: '☰', content: '¶' };
  function sectionNumbers() {
    let n = 0; const map = {};
    P().sections.forEach(s => { if (s.kind === 'content' && !s.hidden && s.numbered !== false) map[s.id] = ++n; });
    return map;
  }
  function renderSidebar() {
    const list = $('#secList'); list.innerHTML = '';
    const nums = sectionNumbers();
    $('#projItem').classList.toggle('sel', state.sel === 'project');
    $('#secCount').textContent = P().sections.length;
    P().sections.forEach((s, i) => {
      const preset = PRESETS.find(p => p.make && s.kind !== 'content' && p.key === s.kind);
      const row = h('div', { class: `sec-row ${state.sel === s.id ? 'sel' : ''} ${s.hidden ? 'hid' : ''}`, draggable: 'true' },
        h('span', { class: 'n' }, nums[s.id] ? String(nums[s.id]).padStart(2, '0') : ''),
        h('span', { class: 'k' }, KIND_ICON[s.kind] || '¶'),
        h('span', { class: 't' }, s.kind === 'cover' ? 'Portada' : (s.title || 'Sin título')),
        s.orientation === 'landscape' ? h('span', { class: 'o', title: 'Horizontal' }, '▭') : null,
        FFRender.sectionIsEmpty(s) && !s.hidden ? h('span', { class: 'warn-b', title: 'Sin imagen: esta hoja no saldrá en el PDF' }, 'sin img') : null,
        sectionSwitch(s));
      row.onclick = () => select(s.id);
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault(); row.classList.remove('drag-over');
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (isNaN(from) || from === i) return;
        const [m] = P().sections.splice(from, 1);
        P().sections.splice(from < i ? i - 1 : i, 0, m);
        changed(true);
      });
      list.append(row);
    });
  }

  function sectionSwitch(s, big) {
    const c = h('input', { type: 'checkbox' });
    c.checked = !s.hidden;
    c.onchange = () => { s.hidden = !c.checked; changed(true); if (state.sel === s.id) renderEditor(); };
    const l = h('label', { class: `sw ${big ? 'big' : ''}`, title: s.hidden ? 'Apagada: no sale en el PDF' : 'Encendida: sale en el PDF', onclick: e => e.stopPropagation() }, c, h('span'));
    return l;
  }

  const isNarrow = () => matchMedia('(max-width: 1000px)').matches;
  function setPane(p) {
    document.body.dataset.pane = p;
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.pane === p));
    if (p === 'preview') { if (isNarrow()) state.zoom = 'fit'; requestAnimationFrame(() => { applyZoom(); highlightPreview(true); }); }
  }
  function select(id) {
    if (isNarrow() && document.body.dataset.pane === 'sections') setPane('editor');
    state.sel = id;
    renderSidebar();
    renderEditor();
    highlightPreview(true);
  }

  // ================= editor: project =================
  const ACCENTS = ['#37A14F', '#1FA39A', '#3E8EF0', '#8B6CF0', '#E85FB5', '#E5484D', '#E5A024', '#8A938D'];

  function renderProjectEditor(ed) {
    const p = P();
    ed.append(h('div', { class: 'ed-h' }, h('div', {}, h('h1', {}, 'Proyecto'), h('div', { class: 'sub' }, 'Información general, estilo del documento e imágenes de portada'))));

    ed.append(h('div', { class: 'panel' }, h('div', { class: 'panel-t' }, 'Información'),
      fText('Nombre del proyecto', p, 'name', { ph: 'Tierra de Ciegos', after: setTitle }),
      h('div', { class: 'row' }, fText('Código', p, 'code', { ph: 'TDC' }), fText('Versión', p, 'version', { ph: 'V1' })),
      fText('Productora / plataforma', p, 'client', { ph: 'Dynamo · Netflix' }),
      h('div', { class: 'row' }, fText('Tipo de documento', p, 'docTitle', { ph: 'Workflow' }), fText('Fecha', p, 'date', { type: 'date' })),
      fText('Preparado por', p, 'preparedBy'),
      fText('Texto de confidencialidad (portada)', p, 'confidential'),
      fText('Pie de página', p, 'footer')
    ));

    const themeCard = (v, label, bg, fg) => {
      const b = h('button', { class: `theme-card ${p.theme === v ? 'on' : ''}` },
        h('div', { class: 'tc-prev', style: `background:${bg}` }, h('i', { style: `width:28px;background:${p.accent}` }), h('i', { style: `width:70%;background:${fg}` }), h('i', { style: `width:50%;background:${fg};opacity:.45` })),
        h('div', { class: 'tc-l' }, label));
      b.onclick = () => { p.theme = v; syncTheme(); renderEditor(); changed(); };
      return b;
    };
    const sw = h('div', { class: 'swatches' });
    ACCENTS.forEach(c => { const s = h('span', { class: `swatch ${p.accent === c ? 'on' : ''}`, style: `background:${c}` }); s.onclick = () => { p.accent = c; renderEditor(); changed(); }; sw.append(s); });
    const ci = h('input', { type: 'color', value: p.accent || '#37A14F', title: 'Color personalizado' });
    ci.oninput = () => { p.accent = ci.value; [...sw.querySelectorAll('.swatch')].forEach(x => x.classList.remove('on')); changed(); };
    sw.append(ci);

    ed.append(h('div', { class: 'panel' }, h('div', { class: 'panel-t' }, 'Estilo del documento'),
      field('Modo', h('div', { class: 'theme-cards' }, themeCard('dark', 'Oscuro · letra blanca', '#0C0E0D', '#fff'), themeCard('light', 'Claro · letra negra', '#fff', '#111'))),
      field('Color de acento', sw),
      h('div', { class: 'row' },
        fChips('Tamaño de página', p, 'pageSize', [['letter', 'Carta'], ['a4', 'A4']], { def: 'letter' }),
        fChips('Gráfica de fondo', p, 'decoration', [['full', 'Completa'], ['subtle', 'Sutil'], ['none', 'Ninguna']], { def: 'full' })),
      fToggle('Numerar secciones (01, 02, 03…)', p, 'numberSections', { structural: true })
    ));

    const logos = h('div', { class: 'row' });
    for (let i = 0; i < 2; i++) logos.append(fImage(`Logo cliente ${i + 1}`, p.clientLogos, i, { empty: 'Opcional (PNG transparente)' }));
    ed.append(h('div', { class: 'panel' }, h('div', { class: 'panel-t' }, 'Logos e imágenes'),
      fImage('Logo principal', p, 'logo', { empty: 'Por defecto: logo FilmFlow', hint: 'vacío = FilmFlow' }),
      fImage('Imagen de fondo de portada', p, 'coverImage', { empty: 'Opcional: un still del proyecto' }),
      logos,
      h('div', { class: 'hint' }, 'Los logos de cliente (productora, plataforma) aparecen en la esquina superior derecha de la portada.')
    ));

    ed.append(h('div', { class: 'panel' }, h('div', { class: 'panel-t' }, 'Plantilla base'),
      h('div', { class: 'hint', style: 'margin-bottom:10px' }, '“Nuevo proyecto” parte de la plantilla base. Guarda este proyecto como base para que tus próximos workflows empiecen con estas secciones, textos y estilo.'),
      h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        h('button', { class: 'icon-btn', onclick: async () => { await native('saveBaseTemplate', { json: JSON.stringify(P()) }); toast('Plantilla base actualizada'); } }, 'Guardar como plantilla base'),
        h('button', { class: 'icon-btn', onclick: async () => { if (confirm('¿Restaurar la plantilla base original de FilmFlow?')) { await native('resetBaseTemplate'); toast('Plantilla original restaurada'); } } }, 'Restaurar original'))
    ));
  }

  // ================= editor: section =================
  function renderSectionEditor(ed, s) {
    const idx = P().sections.indexOf(s);
    const move = d => { const j = idx + d; if (j < 0 || j >= P().sections.length) return; P().sections.splice(idx, 1); P().sections.splice(j, 0, s); changed(true); renderEditor(); };
    const kindName = { cover: 'Portada', divider: 'Separador de capítulo', toc: 'Índice automático', content: 'Sección de contenido' }[s.kind];
    ed.append(h('div', { class: 'ed-h' },
      h('div', { style: 'min-width:0' }, h('h1', {}, s.kind === 'cover' ? 'Portada' : (s.title || 'Sin título')), h('div', { class: 'sub' }, kindName)),
      h('div', { class: 'ed-actions' },
        h('button', { class: 'icon-btn', title: 'Subir', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'icon-btn', title: 'Bajar', onclick: () => move(1) }, '↓'),
        h('button', { class: 'icon-btn', title: 'Duplicar sección', onclick: () => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.blocks.forEach(b => b.id = uid()); c.title = (c.title || '') + ' (copia)'; P().sections.splice(idx + 1, 0, c); changed(true); select(c.id); } }, '⧉'),
        h('button', { class: 'icon-btn danger', title: 'Eliminar sección', onclick: () => { if (!confirm(`¿Eliminar la sección “${s.title || kindName}”?`)) return; P().sections.splice(idx, 1); changed(true); select(P().sections[Math.max(0, idx - 1)]?.id || 'project'); } }, '✕'))));

    ed.append(h('div', { class: `include-bar ${s.hidden ? 'off' : ''}` }, sectionSwitch(s, true),
      h('div', {}, h('b', {}, s.hidden ? 'Hoja apagada' : 'Hoja encendida'), h('div', { class: 'hint' }, s.hidden ? 'Esta hoja no aparecerá en el PDF.' : (FFRender.sectionIsEmpty(s) ? 'Sin imagen cargada: no aparecerá en el PDF hasta que adjuntes una.' : 'Esta hoja aparecerá en el PDF.')))));

    const sp = h('div', { class: 'panel' }, h('div', { class: 'panel-t' }, 'Sección'));
    const retitle = () => { ed.querySelector('.ed-h h1').textContent = s.title || 'Sin título'; renderSidebar(); };
    if (s.kind === 'cover') {
      sp.append(fText('Texto superior', s, 'kicker', { ph: P().docTitle || 'Workflow' }),
        h('div', { class: 'hint' }, 'El título, productora, código, versión, fecha y logos de la portada se editan en “Proyecto”.'),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'icon-btn', onclick: () => select('project') }, 'Ir a Proyecto →')));
    } else if (s.kind === 'divider') {
      sp.append(fText('Título', s, 'title', { after: retitle }), h('div', { class: 'row' }, fText('Número / texto grande', s, 'bigText', { ph: '01' }), fText('Subtítulo', s, 'subtitle')),
        fArea('Texto (opcional)', s, 'text', { rows: 2 }));
    } else if (s.kind === 'toc') {
      sp.append(fText('Título', s, 'title', { after: retitle }), h('div', { class: 'hint' }, 'El índice se genera automáticamente con las secciones y números de página.'));
    } else {
      sp.append(fText('Título', s, 'title', { after: retitle }), fText('Etiqueta a la derecha del título (opcional)', s, 'subtitle'));
    }
    sp.append(fChips('Orientación', s, 'orientation', [['portrait', '▯ Vertical'], ['landscape', '▭ Horizontal']], { def: 'portrait', structural: true }));
    if (s.kind === 'content') {
      sp.append(fToggle('Empezar en una página nueva', s, 'newPage'), fToggle('Numerar esta sección', s, 'numbered', { structural: true }), fToggle('Mostrar título de sección', s, 'showTitle'));
    }
    ed.append(sp);

    if (s.kind !== 'content') return;
    ed.append(h('div', { class: 'panel-t', style: 'margin:18px 2px 8px' }, `Contenido · ${s.blocks.length} bloques`, h('span', {},
      h('button', { class: 'icon-btn', style: 'height:22px', onclick: () => { const all = s.blocks.every(b => state.collapsed.has(b.id)); s.blocks.forEach(b => all ? state.collapsed.delete(b.id) : state.collapsed.add(b.id)); renderEditor(); } }, 'Contraer / expandir'))));
    const cams = s.blocks.filter(b => b.type === 'camera');
    if (cams.length || /c[aá]mara/i.test(s.title || '')) {
      const addCam = () => {
        const last = cams[cams.length - 1];
        const letter = String.fromCharCode(65 + Math.min(25, cams.length));
        const nb = BLOCK_TYPES.find(t => t.type === 'camera').make();
        Object.assign(nb, { label: `Camera ${letter}`, width: last ? last.width : 'half', brand: last ? last.brand : nb.brand, model: last ? last.model : nb.model, chips: last ? last.chips : nb.chips, specs: last ? last.specs : nb.specs });
        const at = last ? s.blocks.indexOf(last) + 1 : s.blocks.length;
        s.blocks.splice(at, 0, nb);
        changed(); renderEditor();
        requestAnimationFrame(() => { const c = ed.querySelector(`[data-b="${nb.id}"]`); c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      };
      const perRow = cams.length && cams.every(c => c.width === 'third') ? 3 : cams.length && cams.every(c => c.width === 'full') ? 1 : 2;
      const lay = h('div', { class: 'chips-sel' }, ...[[1, '1 por fila'], [2, '2 por fila'], [3, '3 por fila']].map(([n, l]) => h('button', { class: perRow === n ? 'on' : '', onclick: () => { cams.forEach(c => c.width = n === 1 ? 'full' : n === 2 ? 'half' : 'third'); changed(); renderEditor(); } }, l)));
      ed.append(h('div', { class: 'panel cam-panel' },
        h('div', { class: 'panel-t' }, `Cámaras · ${cams.length}`),
        h('div', { class: 'cam-row' }, h('button', { class: 'tb-btn primary', onclick: addCam }, h('span', {}, '＋'), 'Añadir cámara'), cams.length ? lay : null),
        h('div', { class: 'hint', style: 'margin-top:8px' }, 'Cada cámara copia las especificaciones de la anterior para que solo cambies lo necesario. Elimina una cámara con ✕ en su tarjeta.')));
    }
    s.blocks.forEach((b, i) => ed.append(blockCard(s, b, i)));

    const grid = h('div', { class: 'add-blocks' });
    BLOCK_TYPES.forEach(t => grid.append(h('button', { onclick: () => { const nb = t.make(); s.blocks.push(nb); changed(); renderEditor(); requestAnimationFrame(() => { const c = ed.querySelector(`[data-b="${nb.id}"]`); c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const f = c && c.querySelector('textarea, input[type=text]'); f && f.focus(); }); } }, h('b', {}, t.icon), t.name)));
    ed.append(h('div', { class: 'panel' }, h('div', { class: 'panel-t' }, 'Añadir bloque'), grid));
  }

  function blockSummary(b) {
    const first = s => String(s || '').split('\n').find(x => x.trim()) || '';
    switch (b.type) {
      case 'camera': return [b.label, b.model].filter(Boolean).join(' · ');
      case 'spec': case 'keyvalue': case 'naming': case 'storage': return b.title || first(b.text);
      case 'image': return b.src ? (b.caption || 'Imagen cargada') : 'Sin imagen';
      case 'contacts': return (b.items || []).map(c => c.name).join(', ');
      case 'stages': return (b.columns || []).map(c => c.title).join(' › ');
      case 'heading': return b.text;
      default: return first(b.text);
    }
  }

  function blockCard(s, b, i) {
    const t = BLOCK_TYPES.find(x => x.type === b.type) || { name: b.type, icon: '?' };
    const collapsed = state.collapsed.has(b.id);
    const card = h('div', { class: `blk-card ${collapsed ? 'collapsed' : ''} ${b.hidden ? 'hid' : ''}`, 'data-b': b.id });
    const mv = d => { const j = i + d; if (j < 0 || j >= s.blocks.length) return; s.blocks.splice(i, 1); s.blocks.splice(j, 0, b); changed(); renderEditor(); };
    const stop = fn => e => { e.stopPropagation(); fn(); };
    const canWidth = !['pagebreak', 'spacer', 'stages', 'storage'].includes(b.type);
    const wbtn = canWidth ? h('button', { class: 'icon-btn wsel', title: 'Ancho del bloque', onclick: stop(() => { b.width = b.width === 'full' || !b.width ? 'half' : b.width === 'half' ? 'third' : 'full'; wbtn.textContent = wl(); changed(); }) }) : null;
    const wl = () => ({ half: '½ ancho', third: '⅓ ancho' }[b.width] || 'Completo');
    if (wbtn) wbtn.textContent = wl();
    const summary = h('span', { class: 'bp' }, blockSummary(b));
    const head = h('div', { class: 'blk-head', onclick: () => { collapsed ? state.collapsed.delete(b.id) : state.collapsed.add(b.id); renderEditor(); } },
      h('span', { class: 'bi' }, t.icon), h('span', { class: 'bt' }, t.name), summary, wbtn,
      h('button', { class: 'icon-btn', title: 'Subir', onclick: stop(() => mv(-1)) }, '↑'),
      h('button', { class: 'icon-btn', title: 'Bajar', onclick: stop(() => mv(1)) }, '↓'),
      h('button', { class: 'icon-btn', title: 'Duplicar', onclick: stop(() => { const c = JSON.parse(JSON.stringify(b)); c.id = uid(); s.blocks.splice(i + 1, 0, c); changed(); renderEditor(); }) }, '⧉'),
      h('button', { class: 'icon-btn', title: b.hidden ? 'Mostrar' : 'Ocultar del PDF', onclick: stop(() => { b.hidden = !b.hidden; changed(); renderEditor(); }) }, b.hidden ? '◌' : '◉'),
      h('button', { class: 'icon-btn danger', title: 'Eliminar', onclick: stop(() => { s.blocks.splice(i, 1); changed(); renderEditor(); }) }, '✕'));
    const body = h('div', { class: 'blk-body' });
    const after = () => { summary.textContent = blockSummary(b); };
    blockFields(b, body, after);
    card.append(head, body);
    return card;
  }

  const LIST_HELP = 'Un elemento por línea. Empieza con dos espacios para un sub-elemento. **texto** = negrita.';
  function blockFields(b, body, after) {
    const o = { after };
    switch (b.type) {
      case 'heading':
        body.append(fText('', b, 'text', o), fChips('Tamaño', b, 'size', [['', 'Normal (acento)'], ['lg', 'Grande']], { def: '' }));
        break;
      case 'paragraph':
        body.append(fArea('', b, 'text', { ...o, rows: 4, help: 'Separa párrafos con una línea vacía. **texto** = negrita.' }), fChips('Estilo', b, 'style', [['', 'Normal'], ['lead', 'Introducción (grande)']], { def: '' }));
        break;
      case 'bullets': case 'numbered':
        body.append(fArea('', b, 'text', { ...o, rows: 5, help: LIST_HELP }));
        break;
      case 'keyvalue':
        body.append(fText('Título (opcional)', b, 'title', o), fArea('Datos', b, 'text', { ...o, mono: true, rows: 5, help: 'Un dato por línea con el formato  Clave: Valor' }), fChips('Columnas', b, 'columns', [[1, '1 columna'], [2, '2 columnas']], { def: 1 }));
        break;
      case 'spec':
        body.append(fText('Título de la tarjeta', b, 'title', o), fArea('Especificaciones', b, 'text', { ...o, mono: true, rows: 6, help: 'Un dato por línea:  Codec: H.264' }));
        break;
      case 'camera':
        body.append(h('div', { class: 'row3' }, fText('Etiqueta', b, 'label', { ...o, ph: 'Camera A - B' }), fText('Marca', b, 'brand', { ...o, ph: 'ARRI' }), fText('Modelo', b, 'model', { ...o, ph: 'Alexa 35' })),
          fText('Etiquetas destacadas', b, 'chips', { ...o, hint: 'separadas por coma', ph: 'ARRIRAW HDE, 4.6K OG, 24 fps' }),
          fArea('Especificaciones', b, 'specs', { ...o, mono: true, rows: 6, help: 'Un dato por línea:  Codec: ARRIRAW HDE' }),
          fImage('Foto de la cámara (opcional)', b, 'image', o));
        break;
      case 'image':
        body.append(fImage('', b, 'src', o), fText('Pie de imagen', b, 'caption', o),
          fChips('Tamaño', b, 'size', [['full', 'Completo'], ['large', 'Grande'], ['medium', 'Mediano'], ['small', 'Pequeño']], { def: 'full' }),
          fToggle('Ocupar el resto de la página', b, 'fill', { def: false }), fToggle('Borde redondeado', b, 'frame', { def: false }), fToggle('Alinear a la izquierda', b, 'align', { def: false }));
        // align uses truthy → 'left'
        body.lastChild.querySelector('input').onchange = e => { b.align = e.target.checked ? 'left' : ''; changed(); };
        body.lastChild.querySelector('input').checked = b.align === 'left';
        break;
      case 'note':
        body.append(fText('Etiqueta', b, 'label', { ...o, ph: 'Importante' }), fArea('Texto', b, 'text', { ...o, rows: 3 }), fChips('Estilo', b, 'style', [['', 'Acento'], ['warn', 'Advertencia']], { def: '' }));
        break;
      case 'table':
        body.append(fArea('', b, 'text', { ...o, mono: true, rows: 5, help: 'Una fila por línea, columnas separadas con  |' }), fToggle('La primera fila es encabezado', b, 'header'));
        break;
      case 'naming':
        body.append(h('div', { class: 'row' }, fText('Título', b, 'title', o), fText('Separador', b, 'separator', o)),
          fArea('Partes', b, 'text', { ...o, mono: true, rows: 5, help: 'Una parte por línea:  Etiqueta = Ejemplo' }));
        break;
      case 'contacts':
        listEditor(body, b, 'items', c => [h('div', { class: 'row' }, fText('Cargo', c, 'role', o), fText('Nombre', c, 'name', o)), h('div', { class: 'row' }, fText('Teléfono', c, 'phone', o), fText('Correo', c, 'email', o))],
          () => ({ role: '', name: '', phone: '', email: '' }), '＋ Añadir contacto');
        break;
      case 'storage': {
        body.append(fText('Título', b, 'title', o), fToggle('Mostrar fórmula del cálculo', b, 'showFormula'));
        listEditor(body, b, 'cameras', c => {
          const res = h('div', { class: 'hint', style: 'margin-top:6px' });
          const calc = () => { const [hh, mm] = String(c.hours || '0').split(':'); const hrs = (+hh || 0) + (+mm || 0) / 60; const pd = hrs * (+c.tbph || 0); res.innerHTML = `Por día: <b>${pd.toFixed(2)} TB</b> · Total: <b>${(pd * (+c.days || 0)).toFixed(2)} TB</b>`; };
          calc();
          const oc = { after: calc };
          return [h('div', { class: 'row3' }, fText('Etiqueta', c, 'label', oc), fText('Cámara', c, 'name', oc), fText('Códec', c, 'codec', oc)),
            h('div', { class: 'row3' }, fText('Días de rodaje', c, 'days', { ...oc, type: 'number' }), fText('Rodado por día', c, 'hours', { ...oc, hint: 'h:mm' }), fText('TB por hora', c, 'tbph', { ...oc, type: 'number', step: '0.01' })), res];
        }, () => ({ label: 'Cámara B', name: '', codec: '', days: 30, hours: '1:00', tbph: 1 }), '＋ Añadir cámara / unidad');
        body.append(h('div', { class: 'hint' }, 'Referencia: ARRIRAW HDE 4.6K 3:2 OG a 24 fps ≈ 1.12 TB/h · ProRes 4444 XQ 4.6K ≈ 0.75 TB/h. Verifica con la calculadora del fabricante.'));
        break;
      }
      case 'stages':
        listEditor(body, b, 'columns', c => [fText('Etapa', c, 'title', o), fArea('Elementos', c, 'items', { ...o, rows: 4, help: 'Uno por línea:  Equipo | detalle' })],
          () => ({ title: 'Nueva etapa', items: '' }), '＋ Añadir etapa');
        body.append(h('div', { class: 'hint' }, 'Consejo: usa este bloque en una sección horizontal. Para diagramas complejos puedes subir una imagen.'));
        break;
      case 'spacer':
        body.append(fText('Altura (pt)', b, 'size', { type: 'number' }));
        break;
      case 'pagebreak':
        body.append(h('div', { class: 'hint' }, 'El contenido siguiente empezará en una página nueva.'));
        break;
    }
  }

  function listEditor(body, obj, key, fields, make, addLabel) {
    obj[key] = obj[key] || [];
    const wrap = h('div');
    const draw = () => {
      wrap.innerHTML = '';
      obj[key].forEach((item, i) => {
        wrap.append(h('div', { class: 'sub-card' }, h('button', { class: 'icon-btn danger rm', title: 'Quitar', onclick: () => { obj[key].splice(i, 1); draw(); changed(); } }, '✕'), ...fields(item)));
      });
      wrap.append(h('button', { class: 'icon-btn', style: 'margin-bottom:8px', onclick: () => { obj[key].push(make()); draw(); changed(); } }, addLabel));
    };
    draw();
    body.append(wrap);
  }

  function renderEditor() {
    const ed = $('#editor');
    const st = ed.scrollTop;
    const keepScroll = renderEditor._last === state.sel;
    renderEditor._last = state.sel;
    ed.innerHTML = '';
    ed.append(mobileNav());
    if (state.sel === 'project') renderProjectEditor(ed);
    else { const s = secById(state.sel); if (s) renderSectionEditor(ed, s); else { state.sel = 'project'; renderProjectEditor(ed); } }
    if (keepScroll) ed.scrollTop = st; else ed.scrollTop = 0;
  }

  // phone / iPad: previous–next sheet and a shortcut to the preview
  function mobileNav() {
    const ids = ['project', ...P().sections.map(s => s.id)];
    const i = Math.max(0, ids.indexOf(state.sel));
    const s = secById(state.sel);
    const go = d => { const n = ids[i + d]; if (n) select(n); };
    return h('div', { class: 'm-nav' },
      h('button', { title: 'Hoja anterior', disabled: i === 0 ? '' : null, onclick: () => go(-1) }, '‹'),
      h('div', { class: 'm-mid' },
        h('b', {}, s ? (s.title || 'Sin título') : 'Proyecto'),
        h('small', {}, s ? `Hoja ${i} de ${ids.length - 1}${s.hidden ? ' · apagada' : ''}` : 'Datos generales')),
      h('button', { title: 'Hoja siguiente', disabled: i === ids.length - 1 ? '' : null, onclick: () => go(1) }, '›'),
      h('button', { class: 'm-pv', onclick: () => setPane('preview') }, 'Ver PDF'));
  }

  // ================= preview =================
  let renderSeq = 0;
  const staging = h('div', { style: 'position:absolute;left:-99999px;top:0' });
  document.body.append(staging);

  async function renderPreview() {
    const seq = ++renderSeq;
    let pages;
    try { pages = await FFRender.render(P(), staging, { export: false }); }
    catch (e) { if (seq === renderSeq) toast('Vista previa: ' + e.message); return; }
    if (seq !== renderSeq) return;
    const pv = $('#pvPages');
    pv.className = 'pv-pages ' + staging.className;
    pv.style.setProperty('--accent', P().accent || '#37A14F');
    pv.replaceChildren(...pages);
    pages.forEach(pg => pg.addEventListener('click', () => {
      const s = P().sections[Number(pg.dataset.section)];
      if (s && state.sel !== s.id) { state.sel = s.id; renderSidebar(); renderEditor(); highlightPreview(false); }
      if (isNarrow()) setPane('editor');
    }));
    $('#pvInfo').textContent = `${pages.length} páginas · ${P().pageSize === 'a4' ? 'A4' : 'Carta'} · Modo ${P().theme === 'light' ? 'claro' : 'oscuro'}`;
    applyZoom();
    highlightPreview(false);
  }

  function highlightPreview(scroll) {
    const pv = $('#pvPages');
    const idx = P().sections.findIndex(s => s.id === state.sel);
    let first = null;
    [...pv.children].forEach(pg => { const on = Number(pg.dataset.section) === idx; pg.classList.toggle('active', on); if (on && !first) first = pg; });
    if (scroll && first) {
      const sc = $('#pvScroll');
      sc.scrollTo({ top: sc.scrollTop + first.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16, behavior: 'smooth' });
    }
  }

  function applyZoom() {
    const pv = $('#pvPages');
    const maxW = Math.max(612, ...[...pv.children].map(p => p._dims ? p._dims.w : 612));
    let z = state.zoom;
    if (z === 'fit') z = Math.min(1.4, Math.max(0.3, ($('#pvScroll').clientWidth - (isNarrow() ? 28 : 56)) / maxW));
    pv.style.zoom = z;
    $('#zoomVal').textContent = Math.round(z * 100) + '%';
  }

  // ================= commands =================
  function setTitle() {
    native('setTitle', { name: `${P().name || 'Proyecto'} — FilmFlow Workflow` });
  }
  function syncTheme() {
    document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.theme === (P().theme || 'dark')));
  }
  function loadProject(p) {
    state.project = normalize(p);
    state.dirty = false;
    state.sel = 'project';
    state.collapsed.clear();
    syncTheme(); renderSidebar(); renderEditor(); updateFileLabel(); setTitle();
    renderPreview();
  }
  async function openFromLibrary(id) {
    if (state.dirty) await saveToLibrary();
    const json = await native('libLoad', { id });
    if (!json) { toast('No se encontró el proyecto'); return false; }
    loadProject(JSON.parse(json));
    native('libSave', { id: P().id, json, meta: projectMeta(P()) }); // marks as last opened
    return true;
  }
  async function newFromBase() {
    const base = await native('loadBaseTemplate');
    let p = null;
    try { p = base ? JSON.parse(base) : null; } catch (e) { }
    p = p || defaultProject();
    p.id = uid() + uid();
    p.date = new Date().toISOString().slice(0, 10);
    return p;
  }
  async function importJSON(json) {
    let p;
    try { p = normalize(JSON.parse(json)); } catch (e) { alert('El archivo no es un proyecto válido de FilmFlow Workflow.'); return; }
    const list = await native('libList') || [];
    const existing = list.find(m => m.id === p.id);
    if (existing && !(isWeb || confirm(`“${existing.name}” ya está en Mis proyectos.\n\nAceptar: reemplazarlo con este archivo.\nCancelar: importarlo como copia.`))) p.id = uid() + uid();
    if (!p.updatedAt) p.updatedAt = new Date().toISOString();
    if (state.dirty) await saveToLibrary();
    loadProject(p);
    await saveToLibrary();
    toast(isWeb ? `Abierto desde iCloud: ${p.name || 'Proyecto'}` : `Importado a Mis proyectos: ${p.name || 'Proyecto'}`);
  }

  // ================= library (Mis proyectos) =================
  async function openLibrary() {
    if (state.dirty) await saveToLibrary();
    const ov = h('div', { class: 'lib-ov' });
    const close = () => ov.remove();
    const search = h('input', { type: 'text', placeholder: 'Buscar por nombre, código o productora…' });
    const grid = h('div', { class: 'lib-grid' });
    const fmtDate = d => { try { return new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    let list = [];
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      grid.innerHTML = '';
      const items = list.filter(m => !q || [m.name, m.code, m.client, m.version].join(' ').toLowerCase().includes(q));
      if (!items.length) grid.append(h('div', { class: 'lib-empty' }, list.length ? 'Ningún proyecto coincide con la búsqueda.' : 'Aún no hay proyectos guardados.'));
      items.forEach(m => {
        const cur = P() && P().id === m.id;
        const card = h('div', { class: `lib-card ${cur ? 'cur' : ''}` },
          h('div', { class: `lib-cover ${m.theme === 'light' ? 'light' : 'dark'}`, style: `--acc:${m.accent}`, onclick: async () => { if (await openFromLibrary(m.id)) close(); } },
            h('div', { class: 'lc-k' }, 'Workflow'), h('div', { class: 'lc-n' }, m.name || 'Sin nombre'), h('div', { class: 'lc-c' }, m.client || ''), h('div', { class: 'lc-code' }, [m.code, m.version].filter(Boolean).join(' · '))),
          h('div', { class: 'lib-info' },
            h('div', { class: 'li-t' }, m.name || 'Sin nombre', cur ? h('span', { class: 'li-cur' }, 'Abierto') : null),
            h('div', { class: 'li-s' }, `${m.active ?? m.sections}/${m.sections} hojas activas · editado ${fmtDate(m.modified)}`),
            h('div', { class: 'li-a' },
              h('button', { class: 'icon-btn', onclick: async () => { if (await openFromLibrary(m.id)) close(); } }, 'Abrir'),
              h('button', { class: 'icon-btn', title: 'Crear una copia (por ejemplo para una nueva versión)', onclick: async () => {
                const json = await native('libLoad', { id: m.id }); if (!json) return;
                const c = JSON.parse(json); c.id = uid() + uid(); c.name = (c.name || 'Proyecto') + ' (copia)';
                await native('libSave', { id: c.id, json: JSON.stringify(c), meta: projectMeta(c) });
                if (P()) await native('libSave', { id: P().id, json: JSON.stringify(P()), meta: projectMeta(P()) });
                list = await native('libList') || []; sortList(); draw(); toast('Copia creada');
              } }, 'Duplicar'),
              h('button', { class: 'icon-btn', title: 'Guardar una copia como archivo .ffworkflow', onclick: async () => {
                const json = await native('libLoad', { id: m.id }); if (!json) return;
                const c = JSON.parse(json);
                const d = (c.date || '').replace(/-/g, '');
                const name = [c.code ? `${c.code} - ` : '', (c.docTitle || 'Workflow').toUpperCase(), d ? ` ${d}` : '', c.version ? ` ${c.version}` : ''].join('').trim();
                const r = await native('exportFile', { json, name: syncName(c) }); if (r) toast(`Archivo listo: ${r}`);
              } }, isWeb ? 'Guardar en iCloud' : 'Exportar archivo'),
              h('button', { class: 'icon-btn danger', onclick: async () => {
                if (!confirm(`¿Eliminar “${m.name}” de Mis proyectos? Se moverá a la Papelera.`)) return;
                await native('libDelete', { id: m.id });
                list = list.filter(x => x.id !== m.id); draw();
                if (cur) { const next = list[0]; if (next) await openFromLibrary(next.id); else { loadProject(await newFromBase()); await saveToLibrary(); } }
              } }, 'Eliminar'))));
        grid.append(card);
      });
    };
    const sortList = () => list.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
    search.oninput = draw;
    ov.append(h('div', { class: 'lib' },
      h('div', { class: 'lib-h' }, h('div', {}, h('h2', {}, 'Mis proyectos'), h('div', { class: 'hint' }, isWeb ? 'Se guardan en este dispositivo. Usa “Abrir desde iCloud” y “Guardar en iCloud” (carpeta iCloud Drive › FilmFlow Workflow › Workflows) para compartirlos con tu Mac.' : 'Todos tus workflows se guardan aquí automáticamente y siguen siendo editables.')),
        h('button', { class: 'icon-btn', onclick: close, title: 'Cerrar' }, '✕')),
      h('div', { class: 'lib-bar' }, search,
        h('button', { class: 'tb-btn', onclick: async () => { close(); await commands.open(); } }, h('span', {}, '⇪'), isWeb ? 'Abrir desde iCloud' : 'Importar archivo…'),
        h('button', { class: 'tb-btn primary', onclick: async () => { close(); await commands.new(); } }, h('span', {}, '＋'), 'Nuevo proyecto')),
      backupBar(async () => { list = await native('libList') || []; sortList(); draw(); }),
      grid));
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.body.append(ov);
    list = await native('libList') || [];
    sortList(); draw();
    search.focus();
  }

  // ================= iCloud Drive backup =================
  const ago = iso => {
    if (!iso) return 'nunca';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return `hace ${m} min`;
    if (m < 1440) return `hace ${Math.round(m / 60)} h`;
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  function backupBar(onRestored) {
    const bar = h('div', { class: 'bk-bar' });
    if (!hasNative) return bar;
    const draw = async () => {
      let st;
      try { st = await native('backupStatus'); } catch (e) { return; }
      bar.innerHTML = '';
      if (!st.available) {
        bar.append(h('span', { class: 'bk-ic off' }, '☁'), h('div', { class: 'bk-t' }, h('b', {}, 'iCloud Drive no está activo'), h('div', { class: 'hint' }, 'Actívalo en Ajustes del Sistema › Apple ID › iCloud › iCloud Drive para tener copia de seguridad.')));
        return;
      }
      const c = h('input', { type: 'checkbox' }); c.checked = st.enabled;
      c.onchange = async () => { await native('backupSet', { enabled: c.checked }); if (c.checked) await native('backupNow').catch(() => { }); draw(); };
      bar.append(
        h('span', { class: `bk-ic ${st.enabled ? '' : 'off'}` }, '☁'),
        h('div', { class: 'bk-t' },
          h('b', {}, st.enabled ? 'Copia de seguridad en iCloud Drive activada' : 'Copia de seguridad en iCloud Drive desactivada'),
          h('div', { class: 'hint' }, st.error ? `Error: ${st.error}` : st.enabled ? `Último backup ${ago(st.last)} · ${st.count} proyectos en iCloud · historial diario de 30 días` : 'Tus proyectos solo están guardados en este Mac.')),
        h('label', { class: 'sw big', title: 'Activar o desactivar' }, c, h('span')),
        st.enabled ? h('button', { class: 'icon-btn', onclick: async e => { e.target.textContent = 'Copiando…'; try { await native('backupNow'); toast('Backup en iCloud Drive actualizado'); } catch (err) { toast('Error: ' + err); } draw(); } }, 'Hacer backup ahora') : null,
        h('button', { class: 'icon-btn', onclick: () => restoreDialog(onRestored) }, 'Restaurar…'),
        h('button', { class: 'icon-btn', onclick: () => native('backupReveal') }, 'Ver en Finder'));
    };
    draw();
    return bar;
  }
  async function restoreDialog(onRestored) {
    const list = (await native('backupList') || []).sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
    const ov = h('div', { class: 'lib-ov', style: 'z-index:90' });
    const close = () => ov.remove();
    const rows = list.map(m => {
      const c = h('input', { type: 'checkbox' }); c.checked = !m.local; c.dataset.id = m.id;
      return h('label', { class: 'rs-row' }, c, h('div', { style: 'flex:1;min-width:0' }, h('b', {}, m.name || 'Sin nombre'), h('div', { class: 'hint' }, `${[m.code, m.version].filter(Boolean).join(' · ')} · editado ${ago(m.modified)}`)),
        h('span', { class: `rs-tag ${m.local ? '' : 'new'}` }, m.local ? 'Ya está en este Mac' : 'No está en este Mac'));
    });
    const go = async () => {
      const ids = rows.map(r => r.querySelector('input')).filter(c => c.checked).map(c => c.dataset.id);
      if (!ids.length) return close();
      const overwrite = list.filter(m => m.local && ids.includes(m.id)).length;
      if (overwrite && !confirm(`${overwrite} proyecto(s) ya existen en este Mac y se reemplazarán por la copia de iCloud. ¿Continuar?`)) return;
      if (state.dirty) await saveToLibrary();
      const n = await native('backupRestore', { ids });
      close();
      if (P() && ids.includes(P().id)) { const json = await native('libLoad', { id: P().id }); if (json) loadProject(JSON.parse(json)); }
      toast(`${n} proyecto(s) restaurados desde iCloud Drive`);
      onRestored && onRestored();
    };
    ov.append(h('div', { class: 'lib', style: 'width:min(620px,100%)' },
      h('div', { class: 'lib-h' }, h('div', {}, h('h2', {}, 'Restaurar desde iCloud Drive'), h('div', { class: 'hint' }, 'Elige los proyectos a traer a este Mac. Versiones anteriores: carpeta “Historial” en Finder.')), h('button', { class: 'icon-btn', onclick: close }, '✕')),
      h('div', { class: 'rs-list' }, rows.length ? rows : h('div', { class: 'lib-empty' }, 'No hay proyectos en la copia de iCloud todavía.')),
      h('div', { class: 'rs-foot' }, h('button', { class: 'tb-btn', onclick: close }, 'Cancelar'), h('button', { class: 'tb-btn primary', onclick: go }, 'Restaurar seleccionados'))));
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.body.append(ov);
  }

  const commands = {
    library: openLibrary,
    async new() {
      if (state.dirty) await saveToLibrary();
      loadProject(await newFromBase());
      await saveToLibrary();
      toast('Nuevo proyecto creado en Mis proyectos');
    },
    async open() {
      const r = await native('open');
      if (r) await importJSON(r.json);
    },
    async save() {
      await saveToLibrary();
      toast('Guardado en Mis proyectos');
    },
    async saveAs() {
      if (state.dirty) P().updatedAt = new Date().toISOString();
      const r = await native('exportFile', { json: JSON.stringify(P()), name: isWeb ? syncName(P()) : fileBase() });
      if (r) toast(isWeb ? 'Elige “Guardar en Archivos” › iCloud Drive › FilmFlow Workflow › Workflows (Reemplazar)' : `Archivo guardado: ${r}`, [], 6000);
      if (isWeb && state.dirty) saveToLibrary();
    },
    icloud() { return commands.saveAs(); },
    async export() {
      const done = busy('Generando PDF…');
      try {
        const path = await native('exportPDF', { json: JSON.stringify(P()), name: fileBase() });
        done();
        if (path === 'print') return;
        if (path) toast('PDF exportado', [{ label: 'Abrir', fn: () => native('openPath', { path }) }, { label: 'Mostrar en Finder', fn: () => native('revealPath', { path }) }]);
      } catch (e) { done(); alert('Error al exportar: ' + e); }
    }
  };
  window.menuCommand = c => commands[c] && commands[c]();
  window.loadProjectFromNative = (json) => importJSON(json);
  // the Mac app pulled a newer copy of a project from iCloud Drive
  window.onExternalUpdate = async (id) => {
    if (!P() || P().id !== id || state.dirty) return;
    const json = await native('libLoad', { id });
    if (!json) return;
    const sel = state.sel;
    loadProject(JSON.parse(json));
    if (secById(sel)) select(sel);
    toast('Proyecto actualizado con los cambios hechos en iPhone/iPad');
  };
  window.addEventListener('beforeunload', () => { if (state.dirty) saveToLibrary(); });

  // ================= wire up =================
  if (isWeb) {
    document.body.classList.add('is-web');
    const sv = document.querySelector('[data-cmd="save"]');
    sv.dataset.cmd = 'icloud'; sv.title = 'Guardar una copia en iCloud Drive';
    sv.innerHTML = '<span>☁</span><em>Guardar en iCloud</em>';
  }
  document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => commands[b.dataset.cmd]());
  document.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => { P().theme = b.dataset.theme; syncTheme(); if (state.sel === 'project') renderEditor(); changed(); });
  $('#projItem').onclick = () => select('project');
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => setPane(b.dataset.pane));
  setPane('editor');
  document.querySelectorAll('.pv-zoom button').forEach(b => b.onclick = () => {
    const cur = parseFloat($('#pvPages').style.zoom) || 1;
    state.zoom = b.dataset.z === 'fit' ? 'fit' : Math.min(2, Math.max(0.25, cur + (b.dataset.z === '+' ? 0.1 : -0.1)));
    applyZoom();
  });
  window.addEventListener('resize', () => state.zoom === 'fit' && applyZoom());

  // add-section popover
  const pop = $('#pop');
  $('#addSecBtn').onclick = (e) => {
    e.stopPropagation();
    pop.innerHTML = '';
    const groups = [...new Set(PRESETS.map(p => p.group))];
    groups.forEach(g => {
      pop.append(h('div', { class: 'pg' }, g));
      PRESETS.filter(p => p.group === g).forEach(p => pop.append(h('button', {
        onclick: () => {
          const s = p.make();
          const i = P().sections.findIndex(x => x.id === state.sel);
          P().sections.splice(i >= 0 ? i + 1 : P().sections.length, 0, s);
          pop.classList.remove('open');
          changed(true); select(s.id);
        }
      }, h('i', {}, p.icon), p.name)));
    });
    const r = e.currentTarget.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    pop.style.top = 'auto';
    pop.classList.add('open');
  };
  document.addEventListener('click', e => { if (!pop.contains(e.target)) pop.classList.remove('open'); });

  // brand mark in toolbar
  document.querySelector('.tb-logo').innerHTML = '<img src="brand-icon.png" alt="FilmFlow">';

  // boot
  (async () => {
    let list = [];
    try { list = await native('libList') || []; } catch (e) { }
    if (!list.length) {
      // first run with the library: bring over the previous autosave
      let p = null;
      try { const a = await native('loadAutosave'); p = a ? JSON.parse(a) : null; } catch (e) { }
      loadProject(p || await newFromBase());
      await saveToLibrary();
      return;
    }
    let last = null;
    try { last = await native('libLast'); } catch (e) { }
    const id = list.some(m => m.id === last) ? last : list.sort((a, b) => String(b.modified).localeCompare(String(a.modified)))[0].id;
    if (!(await openFromLibrary(id))) loadProject(await newFromBase());
  })();
})();
