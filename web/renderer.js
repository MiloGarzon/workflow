/* FilmFlow Workflow — document renderer: turns a project into laid-out pages */
(function () {
  const SIZES = { letter: { w: 612, h: 792 }, a4: { w: 595, h: 842 } };
  const NAMING_COLORS = ['#E5484D', '#F5A524', '#37A14F', '#3E9BF0', '#A66CF0', '#E85FB5', '#2FB8AC'];

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/\n/g, '<br>');
  const lines = s => String(s || '').split('\n').map(x => x.replace(/\s+$/, '')).filter(x => x.trim());
  const kvParse = s => lines(s).map(l => { const i = l.indexOf(':'); return i < 0 ? [l.trim(), null] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
  const pad2 = n => String(n).padStart(2, '0');
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const fmt = (n, d = 2) => { const v = Number(n) || 0; return (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('es-CO', { maximumFractionDigits: d }); };

  const srcCache = new Map();
  function imgSrc(s) {
    if (!s || !s.startsWith('data:')) return s || '';
    let u = srcCache.get(s);
    if (u) return u;
    try {
      const i = s.indexOf(',');
      const mime = s.slice(5, i).split(';')[0];
      const bin = atob(s.slice(i + 1));
      const arr = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      u = URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch (e) { u = s; }
    if (srcCache.size > 80) { const [k0, u0] = srcCache.entries().next().value; srcCache.delete(k0); if (u0.startsWith('blob:')) URL.revokeObjectURL(u0); }
    srcCache.set(s, u);
    return u;
  }

  function pageDims(project, orient) {
    const s = SIZES[project.pageSize] || SIZES.letter;
    return orient === 'landscape' ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
  }

  // ---------- brand graphics ----------
  function segDigit(d, x, y, W, H, T, attrs) {
    const g = T * 0.18, h2 = H / 2;
    const hz = (x1, x2, cy) => `${x1},${cy} ${x1 + T / 2},${cy - T / 2} ${x2 - T / 2},${cy - T / 2} ${x2},${cy} ${x2 - T / 2},${cy + T / 2} ${x1 + T / 2},${cy + T / 2}`;
    const vt = (cx, y1, y2) => `${cx},${y1} ${cx + T / 2},${y1 + T / 2} ${cx + T / 2},${y2 - T / 2} ${cx},${y2} ${cx - T / 2},${y2 - T / 2} ${cx - T / 2},${y1 + T / 2}`;
    const S = {
      a: hz(g, W - g, 0), b: vt(W, g, h2 - g), c: vt(W, h2 + g, H - g), d: hz(g, W - g, H),
      e: vt(0, h2 + g, H - g), f: vt(0, g, h2 - g), g: hz(g, W - g, h2)
    };
    const map = { 0: 'abcdef', 1: 'bc' };
    const segs = (map[d] || '').split('').map(k => `<polygon points="${S[k]}"/>`).join('');
    return `<g transform="translate(${x} ${y}) skewX(-9)" ${attrs}>${segs}</g>`;
  }

  function logoSVG(project) {
    if (project.logo) return `<img src="${imgSrc(project.logo)}" alt="">`;
    const G = 'var(--brand)', L = 'var(--brand-2)', O = 'var(--logo-off)';
    const sq = [[G, G, G], [G, L, O], [G, O, O]];
    let s = '';
    sq.forEach((row, r) => row.forEach((c, k) => { s += `<rect x="${276 + k * 159.5}" y="${158 + r * 152.5}" width="132" height="127" fill="${c}"/>`; }));
    const dg = [['0', '0', '0'], ['0', '0', '1'], ['0', '1', '0']];
    const dc = [[G, G, G], [G, G, O], [G, O, O]];
    dg.forEach((row, r) => row.forEach((d, k) => { s += segDigit(d, 800 + k * 150, 168 + r * 153, 56, 112, 14, `fill="${dc[r][k]}"`); }));
    const st = 'fill="none" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"';
    const T = 'var(--logo-text)';
    s += `<path d="M120,880 V765 H238 M120,822 H238" stroke="${G}" ${st}/>`;
    s += `<path d="M292,765 V880 M344,765 V880 H463 M516,880 V765 L575,824 L635,765 V880" stroke="${T}" ${st}/>`;
    s += `<path d="M687,880 V765 H806 M687,822 H806" stroke="${G}" ${st}/>`;
    s += `<path d="M859,765 V880 H978 M1031,880 V828 L1126,767 H1149 V880 Z M1202,765 V880 L1261,822 L1321,880 V765" stroke="${T}" ${st}/>`;
    return `<svg viewBox="95 150 1250 755" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  function decoSVG(w, h, variant) {
    // diagonal square field + segmented digits, echoing the FilmFlow mark
    const A = 'var(--accent)';
    let s = '';
    const big = variant === 'cover' || variant === 'divider';
    const size = big ? 74 : 40, gap = big ? 12 : 7;
    const ops = [1, .55, .3, .16, .08];
    const pattern = big
      ? [[0, 0, 0, 1, 2], [0, 1, 2, 3, 4], [1, 2, 3, 4, -1], [2, 3, 4, -1, -1], [3, 4, -1, -1, -1]]
      : [[0, 1, 2], [1, 3, -1], [2, -1, -1]];
    const ox = big ? -40 : w - 40, oy = big ? h + 40 : h + 10;
    pattern.forEach((row, r) => row.forEach((lv, k) => {
      if (lv < 0) return;
      const x = k * (size + gap), y = -(r + 1) * (size + gap);
      s += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${big ? 3 : 2}" fill="${A}" opacity="${ops[lv]}"/>`;
    }));
    const rot = big ? -30 : 150;
    let out = `<g opacity="var(--deco-a)" style="opacity:var(--deco-a)"><g transform="translate(${ox} ${oy}) rotate(${rot})">${s}</g>`;
    if (big) {
      const D = [['0', '0', '1'], ['0', '1', '0']];
      const dw = 46, dh = 92, sx = w - 3 * 66 - 20, sy = 60;
      D.forEach((row, r) => row.forEach((d, k) => {
        out += segDigit(d, sx + k * 66, sy + r * 112, dw, dh, 9, `fill="none" stroke="${A}" stroke-width="1.4"`);
      }));
    } else {
      out += segDigit('0', w - 40, 34 + 28, 14, 28, 3.5, `fill="${A}" opacity=".0"`);
    }
    out += '</g>';
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
  }

  // ---------- block renderers ----------
  // Each returns {el} or {items, make(subset, start, cont)} for splittable blocks
  function cls(b, base) { return `blk ${base} ${b.width === 'half' ? 'half' : b.width === 'third' ? 'third' : ''}`; }

  const R = {
    heading(b) { return { el: el(`<div class="${cls(b, 'heading keep-next')} ${b.size === 'lg' ? 'lg' : ''}"><h3>${esc(b.text)}</h3></div>`) }; },
    paragraph(b) {
      const paras = String(b.text || '').split(/\n\s*\n/).filter(p => p.trim());
      return {
        items: paras,
        make: (sub) => el(`<div class="${cls(b, 'paragraph')}">${sub.map(p => `<p class="txt ${b.style === 'lead' ? 'lead' : ''}">${md(p.trim())}</p>`).join('')}</div>`)
      };
    },
    bullets(b) {
      const it = lines(b.text).map(l => ({ sub: /^\s{2,}|^\t/.test(l), t: l.trim().replace(/^[-•*·]\s*/, '') }));
      return { items: it, make: (sub) => el(`<div class="${cls(b, 'bullets')}"><ul class="lst bul">${sub.map(x => `<li class="${x.sub ? 'sub' : ''}">${md(x.t)}</li>`).join('')}</ul></div>`) };
    },
    numbered(b) {
      const it = lines(b.text).map(l => l.trim().replace(/^\d+[.)]\s*/, ''));
      return { items: it, make: (sub, start) => el(`<div class="${cls(b, 'numbered')}"><ol class="lst num" style="--start:${start}">${sub.map(x => `<li>${md(x)}</li>`).join('')}</ol></div>`) };
    },
    keyvalue(b) {
      const rows = kvParse(b.text);
      const make = (sub, start, cont) => el(`<div class="${cls(b, 'keyvalue')}">${b.title && !cont ? `<div class="kv-title">${esc(b.title)}</div>` : ''}<div class="kv ${b.columns == 2 ? 'c2' : ''}">${sub.map(([k, v]) => v === null ? `<div class="kv-row solo"><span class="v">${md(k)}</span></div>` : `<div class="kv-row"><span class="k">${md(k)}</span><span class="v">${md(v)}</span></div>`).join('')}</div></div>`);
      return b.columns == 2 ? { el: make(rows, 0, false) } : { items: rows, make };
    },
    note(b) { return { el: el(`<div class="${cls(b, 'note-b')}"><div class="note ${b.style === 'warn' ? 'warn' : ''}">${b.label ? `<div class="nt">${esc(b.label)}</div>` : ''}${md(b.text)}</div></div>`) }; },
    camera(b) {
      const chips = String(b.chips || '').split(',').map(x => x.trim()).filter(Boolean);
      const rows = kvParse(b.specs);
      return {
        el: el(`<div class="${cls(b, 'camera')}"><div class="card cam">
        <div class="cam-head"><div>${b.label ? `<div class="cam-label">${esc(b.label)}</div>` : ''}${b.brand ? `<div class="cam-brand">${esc(b.brand)}</div>` : ''}<div class="cam-model">${esc(b.model)}</div></div>${b.image ? `<img class="cam-img" src="${imgSrc(b.image)}">` : ''}</div>
        ${chips.length ? `<div class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
        ${rows.length ? `<div class="kv">${rows.map(([k, v]) => v === null ? `<div class="kv-row solo"><span class="v">${md(k)}</span></div>` : `<div class="kv-row"><span class="k">${md(k)}</span><span class="v">${md(v)}</span></div>`).join('')}</div>` : ''}
      </div></div>`)
      };
    },
    spec(b) {
      const rows = kvParse(b.text);
      return { el: el(`<div class="${cls(b, 'spec-b')}"><div class="card spec"><div class="spec-h">${esc(b.title)}</div><div class="kv">${rows.map(([k, v]) => v === null ? `<div class="kv-row solo"><span class="v">${md(k)}</span></div>` : `<div class="kv-row"><span class="k">${md(k)}</span><span class="v">${md(v)}</span></div>`).join('')}</div></div></div>`) };
    },
    table(b) {
      const rows = lines(b.text).map(l => l.split('|').map(c => c.trim()));
      const head = b.header !== false && rows.length ? rows[0] : null;
      const body = head ? rows.slice(1) : rows;
      return {
        items: body,
        make: (sub) => el(`<div class="${cls(b, 'table')}"><table class="tbl">${head ? `<thead><tr>${head.map(c => `<th>${md(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${sub.map(r => `<tr>${r.map(c => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      };
    },
    naming(b) {
      const parts = lines(b.text).map(l => { const i = l.indexOf('='); return i < 0 ? [l.trim(), l.trim()] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
      const sep = b.separator ?? '_';
      const segs = parts.map(([lb, ex], i) => `${i ? `<div class="nm-sep">${esc(sep)}</div>` : ''}<div class="nm-seg" style="--c:${NAMING_COLORS[i % NAMING_COLORS.length]}"><div class="ex">${esc(ex)}</div><div class="lb">${esc(lb)}</div></div>`).join('');
      return { el: el(`<div class="${cls(b, 'naming-b')}"><div class="naming">${b.title ? `<div class="nm-t">${esc(b.title)}</div>` : ''}<div class="nm-row">${segs}</div></div></div>`) };
    },
    storage(b) {
      const cams = b.cameras || [];
      // 4+ cameras: compact 2-column cards so the whole section fits on one page
      const compact = cams.length >= 4;
      let total = 0;
      const rows = cams.map(c => {
        const rate = window.FFDefaults && FFDefaults.STORAGE.storageRate(c);
        const tbph = rate ? rate.tbph : Number(c.tbph) || 0;
        const codec = rate ? rate.label : c.codec || '';
        const [hh, mm] = String(c.hours || '0').split(':');
        const hrs = (Number(hh) || 0) + (Number(mm) || 0) / 60;
        const perDay = hrs * tbph;
        const tot = perDay * (Number(c.days) || 0);
        total += tot;
        if (compact) return `<div class="stor-card">
          <div class="sc-h"><span class="tl">${esc(c.label || 'Cámara')}</span><span class="sc-nm">${esc(c.name || '')}</span>${codec ? `<span class="sc-codec">${esc(codec)}</span>` : ''}</div>
          <div class="sc-tiles">
            <div class="tile"><span class="tl">Días</span><span class="tv">${fmt(c.days, 0)}</span></div>
            <div class="tile"><span class="tl">Rodado / día</span><span class="tv">${esc(c.hours || '0')}<small>h</small></span></div>
            <div class="tile"><span class="tl">Por día</span><span class="tv">${fmt(perDay)}<small>TB</small></span></div>
            <div class="tile acc"><span class="tl">Total</span><span class="tv">${fmt(tot, 2)}<small>TB</small></span></div>
          </div>
          ${b.showFormula !== false ? `<div class="stor-formula">${fmt(c.days, 0)} días × ${fmt(perDay)} TB = <strong>${fmt(tot, 2)} TB</strong> · tiempo total ${fmt(hrs * (Number(c.days) || 0), 1)} h · ${fmt(tbph)} TB/h</div>` : ''}
        </div>`;
        return `<div class="stor-row">
          <div class="tile name"><span class="tl">${esc(c.label || 'Cámara')}</span><span class="tv">${esc(c.name || '')}</span></div>
          <div class="tile"><span class="tl">Días de rodaje</span><span class="tv">${fmt(c.days, 0)}</span></div>
          <div class="tile"><span class="tl">Rodado / día</span><span class="tv">${esc(c.hours || '0')}<small>h</small></span></div>
          <div class="tile"><span class="tl">Por día</span><span class="tv">${fmt(perDay)}<small>TB</small></span></div>
          <div class="tile acc"><span class="tl">Total</span><span class="tv">${fmt(tot, 2)}<small>TB</small></span></div>
        </div>
        ${b.showFormula !== false ? `<div class="stor-formula">${fmt(c.days, 0)} días × ${fmt(perDay)} TB = <strong>${fmt(tot, 2)} TB</strong> · tiempo total ${fmt(hrs * (Number(c.days) || 0), 1)} h · ${fmt(tbph)} TB/h${codec ? ` (${esc(codec)})` : ''}</div>` : ''}`;
      }).join('');
      return {
        el: el(`<div class="${cls(b, 'storage')}"><div class="stor${compact ? ' compact' : ''}">${b.title ? `<div class="stor-t">${esc(b.title)}</div>` : ''}${compact ? `<div class="stor-grid">${rows}</div>` : rows}
        ${cams.length > 1 ? `<div class="stor-total"><span class="tl">Total proyecto</span><span class="tv">${fmt(total, 1)} TB</span></div>` : ''}</div></div>`)
      };
    },
    contacts(b) {
      const it = b.items || [];
      return { el: el(`<div class="${cls(b, 'contacts-b')}"><div class="contacts">${it.map(c => `<div class="contact"><div class="role">${esc(c.role)}</div><div class="nm">${esc(c.name)}</div>${c.phone ? `<div class="ln">${esc(c.phone)}</div>` : ''}${c.email ? `<div class="ln">${esc(c.email)}</div>` : ''}</div>`).join('')}</div></div>`) };
    },
    image(b) {
      if (!b.src && OPTS.export) return { skip: true };
      const inner = b.src ? `<img src="${imgSrc(b.src)}">` : `<div class="ph">Sin imagen · no aparecerá en el PDF</div>`;
      return { el: el(`<div class="${cls(b, 'image')}"><figure class="fig s-${b.size || 'full'} ${b.frame ? 'framed' : ''} ${b.align === 'left' ? 'left' : ''}">${inner}${b.caption ? `<figcaption>${md(b.caption)}</figcaption>` : ''}</figure></div>`), image: true, fill: !!b.fill };
    },
    stages(b) {
      const cols = b.columns || [];
      const arrow = `<div class="st-arrow"><svg viewBox="0 0 10 10"><path d="M2 1 L8 5 L2 9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></div>`;
      const html = cols.map(c => {
        const items = lines(c.items).map(l => { const [a, ...r] = l.split('|'); return `<div class="st-item"><div class="a">${md(a.trim())}</div>${r.length ? `<div class="b">${md(r.join('|').trim())}</div>` : ''}</div>`; }).join('');
        return `<div class="stage"><div class="stage-h">${esc(c.title)}</div><div class="stage-b">${items}</div></div>`;
      }).join(arrow);
      return { el: el(`<div class="${cls(b, 'stages-b')}"><div class="stages">${html}</div></div>`) };
    },
    colorpipe(b) {
      const arrow = `<div class="st-arrow"><svg viewBox="0 0 10 10"><path d="M2 1 L8 5 L2 9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></div>`;
      const kv = l => { const m = l.match(/^([^:]{1,24}):\s*(.*)$/); return m ? `<div class="cp-kv"><b>${esc(m[1])}</b><span>${md(m[2])}</span></div>` : `<div class="cp-kv"><span>${md(l)}</span></div>`; };
      const notes = t => {
        const ls = lines(t); if (!ls.length) return '';
        let html = '', ul = [];
        const flush = () => { if (ul.length) { html += `<ul>${ul.map(x => `<li>${md(x)}</li>`).join('')}</ul>`; ul = []; } };
        ls.forEach(l => { const m = l.match(/^\s*[-•]\s*(.*)$/); if (m) ul.push(m[1]); else { flush(); html += `<div>${md(l)}</div>`; } });
        flush();
        return `<div class="cp-notes">${html}</div>`;
      };
      const box = x => `<div class="cp-box">
          ${x.tag ? `<div class="cp-tag">${esc(x.tag)}</div>` : ''}
          ${x.logo ? `<img class="cp-logo" src="${imgSrc(x.logo)}">` : ''}
          ${x.tool ? `<div class="cp-tool">${esc(x.tool)}</div>` : ''}
          ${lines(x.specs).length ? `<div class="cp-specs">${lines(x.specs).map(kv).join('')}</div>` : ''}
          ${notes(x.notes)}
          ${x.method ? `<div class="cp-method">Method: <strong>${esc(x.method)}</strong></div>` : ''}
          ${x.caption ? `<div class="cp-cap">${esc(x.caption)}</div>` : ''}
        </div>`;
      const cols = (b.columns || []).filter(c => c.title || (c.boxes || []).length);
      const stages = cols.map(c => `<div class="cp-stage">${c.title ? `<div class="stage-h">${esc(c.title)}</div>` : ''}<div class="cp-boxes">${(c.boxes || []).map(box).join('')}</div></div>`).join(arrow);
      const cam = b.cameraImage ? `<img src="${imgSrc(b.cameraImage)}">`
        : `<svg viewBox="0 0 64 40" class="cp-camico"><rect x="2" y="9" width="40" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M42 18 L60 10 V34 L42 26 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><rect x="8" y="3" width="14" height="6" rx="2" fill="currentColor"/><circle cx="12" cy="22" r="3" fill="currentColor"/></svg>`;
      return { el: el(`<div class="${cls(b, 'cpipe')}">
        <div class="cp-row">
          <div class="cp-src">${cam}${b.camera ? `<div class="cp-cam">${esc(b.camera)}</div>` : ''}</div>
          <div class="cp-link">${b.signal ? `<span>${esc(b.signal)}</span>` : ''}<div class="cp-line"></div>${arrow}</div>
          <div class="cp-flow">
            ${b.monitoring ? `<div class="cp-mon"><span>${esc(b.monitoring)}</span></div>` : ''}
            <div class="cp-stages">${stages}</div>
          </div>
        </div>
        ${b.credit ? `<div class="cp-credit">${esc(b.credit)}</div>` : ''}
      </div>`), center: true };
    },
    spacer(b) { return { el: el(`<div class="spacer" style="height:${Number(b.size) || 16}px"></div>`) }; },
    pagebreak() { return { pagebreak: true }; },
  };

  // ---------- layout ----------
  async function waitImages(node) {
    const imgs = [...node.querySelectorAll('img')];
    await Promise.all(imgs.map(i => (i.complete && i.naturalWidth) ? null : new Promise(r => {
      i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 4000);
    })));
  }
  const overflow = body => body.scrollHeight > body.clientHeight + 0.5;

  let OPTS = {};
  const isEmptyImage = b => b.type === 'image' && !b.src;
  // a content section with nothing but empty images is left out of the PDF
  const sectionIsEmpty = sec => sec.kind === 'content' && (sec.blocks || []).filter(b => !b.hidden).every(b => isEmptyImage(b) || b.type === 'spacer' || b.type === 'pagebreak') && (sec.blocks || []).some(isEmptyImage);

  async function render(project, root, opts = {}) {
    OPTS = opts;
    root.innerHTML = '';
    root.className = `doc theme-${project.theme === 'light' ? 'light' : 'dark'}`;
    root.style.setProperty('--accent', project.accent || '#37A14F');
    const deco = project.decoration || 'full';
    const pages = [];
    const tocEntries = [];
    let tocPage = null;
    const logo = logoSVG(project);
    const metaHtml = `<span><b>${esc(project.code || '')}</b></span><i></i><span>${esc(project.docTitle || 'Workflow')}</span>${project.version ? `<i></i><span>${esc(project.version)}</span>` : ''}`;

    function newPage(kind, orient, si) {
      const d = pageDims(project, orient);
      const p = el(`<div class="page ${kind} ${orient}" style="width:${d.w}px;height:${d.h}px" data-section="${si}"></div>`);
      p._dims = d;
      if (deco !== 'none' && (kind !== 'content' || deco === 'full')) p.insertAdjacentHTML('beforeend', `<div class="deco">${decoSVG(d.w, d.h, kind === 'content' ? 'content' : kind)}</div>`);
      root.appendChild(p);
      pages.push(p);
      return p;
    }
    function contentPage(orient, si) {
      const p = newPage('content', orient, si);
      p.insertAdjacentHTML('beforeend', `<header class="pg-head"><div class="logo">${logo}</div><div class="pg-meta">${metaHtml}</div></header><div class="pg-body"></div><footer class="pg-foot"><span>${esc(project.footer || 'FilmFlow · Laboratorio digital')}</span><span class="pn"></span></footer>`);
      return { page: p, body: p.querySelector('.pg-body'), orient, si };
    }

    let cur = null;
    let num = 0;
    const sections = project.sections || [];

    let breaks = 0;
    function breakPage(sec, si) {
      if (++breaks > 600) throw new Error('Paginación detenida: un bloque no cabe en la página');
      const old = cur;
      cur = contentPage(sec.orientation || 'portrait', si);
      // keep headings with what follows (only if something else stays on the old page)
      if (old) {
        const kids = [...old.body.children];
        let i = kids.length;
        while (i > 0 && kids[i - 1].classList.contains('keep-next')) i--;
        if (i > 0) kids.slice(i).forEach(m => cur.body.appendChild(m));
      }
      return cur;
    }

    async function place(node, sec, si, info) {
      cur.body.appendChild(node);
      await waitImages(node);
      if (info && info.fill) {
        const img = node.querySelector('img');
        if (img) {
          const avail = cur.body.clientHeight - node.offsetTop - (node.offsetHeight - img.offsetHeight) - 2;
          if (avail > 80) { img.style.maxHeight = avail + 'px'; img.style.width = 'auto'; img.style.maxWidth = '100%'; return; }
        }
      }
      if (info && info.center && !overflow(cur.body) && sec.blocks.filter(b => !b.hidden).length === 1) {
        const free = cur.body.clientHeight - (node.offsetTop + node.offsetHeight);
        if (free > 24) node.style.paddingTop = Math.floor(free * 0.42) + 'px';
        return;
      }
      if (!overflow(cur.body)) return;
      if (info && info.image) {
        const img = node.querySelector('img');
        if (img) {
          const fit = async () => {
            const avail = cur.body.clientHeight - (node.offsetTop) - (node.offsetHeight - img.offsetHeight) - 2;
            return avail;
          };
          let avail = await fit();
          if (avail >= cur.body.clientHeight * 0.38 || cur.body.children.length === 1) {
            img.style.maxHeight = Math.max(60, avail) + 'px';
            img.style.width = 'auto';
            return;
          }
          node.remove();
          breakPage(sec, si);
          cur.body.appendChild(node);
          avail = await fit();
          if (overflow(cur.body)) { img.style.maxHeight = Math.max(60, avail) + 'px'; img.style.width = 'auto'; }
          return;
        }
      }
      node.remove();
      if ([...cur.body.children].every(c => c.classList.contains('keep-next'))) { cur.body.appendChild(node); return; }
      breakPage(sec, si);
      cur.body.appendChild(node);
    }

    async function placeSplittable(r, sec, si) {
      let items = r.items, start = 0, cont = false;
      if (!items.length) return;
      while (items.length) {
        const full = r.make(items, start, cont);
        cur.body.appendChild(full);
        await waitImages(full);
        if (!overflow(cur.body)) return;
        full.remove();
        // find how many items fit here
        let lo = 0, hi = items.length - 1;
        while (lo < hi) {
          const n = Math.ceil((lo + hi) / 2);
          const t = r.make(items.slice(0, n), start, cont);
          cur.body.appendChild(t);
          const of = overflow(cur.body);
          t.remove();
          if (of) hi = n - 1; else lo = n;
        }
        const k = lo;
        if (k === 0) {
          const empty = [...cur.body.children].every(c => c.classList.contains('keep-next'));
          if (empty) { cur.body.appendChild(r.make(items, start, cont)); return; }
          breakPage(sec, si);
          continue;
        }
        cur.body.appendChild(r.make(items.slice(0, k), start, cont));
        items = items.slice(k); start += k; cont = true;
        breakPage(sec, si);
      }
    }

    // "Columnas libres": consecutive non-full blocks stack independently in a left and a right column
    function groupColumns(sec, units) {
      const cols = columnsOf(sec);
      const out = [];
      let grp = null;
      for (const u of units) {
        const c = cols[u.b.id] || 'full';
        if (c === 'full' || u.r.pagebreak) { grp = null; out.push(u); continue; }
        if (!grp) {
          grp = el(`<div class="blk colgrp"><div class="col"></div><div class="col"></div></div>`);
          out.push({ b: u.b, r: { el: grp, image: false } });
        }
        grp.children[c === 'right' ? 1 : 0].appendChild(unitEl(u.r));
      }
      return out;
    }
    const unitEl = r => r.el || (r.items ? r.make(r.items, 0, false) : null);

    // "Todo en una sola página": everything on the current page, shrunk if it does not fit
    async function placeFit(units, sec, si) {
      const wrap = el(`<div class="fit"></div>`);
      cur.body.appendChild(wrap);
      for (const { r } of units) { const n = r.pagebreak ? null : unitEl(r); if (n) wrap.appendChild(n); }
      await waitImages(wrap);
      const body = cur.body;
      const bottom = () => wrap.offsetTop + wrap.offsetHeight;
      // images marked "fill" share whatever height is left over
      const fills = units.filter(u => u.r.fill && u.r.el).map(u => u.r.el.querySelector('img')).filter(Boolean);
      if (fills.length) {
        fills.forEach(img => { img.style.maxHeight = '60px'; img.style.width = 'auto'; img.style.maxWidth = '100%'; });
        const free = body.clientHeight - bottom();
        if (free > 0) fills.forEach(img => { img.style.maxHeight = Math.floor(60 + free / fills.length) + 'px'; });
      }
      // still too tall: scale the whole section down
      for (let k = 0; k < 4 && overflow(body); k++) {
        const z = Number(wrap.style.zoom || 1);
        const avail = body.clientHeight - wrap.offsetTop;
        const need = wrap.offsetHeight;
        if (need <= 0 || avail <= 0) break;
        wrap.style.zoom = String(Math.max(0.5, z * (avail / need) * 0.995));
      }
    }

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      if (sec.hidden) continue;
      if (opts.export && sectionIsEmpty(sec)) continue;
      const orient = sec.orientation || 'portrait';
      if (sec.kind === 'cover') {
        const p = newPage('cover', orient, si);
        const logos = (project.clientLogos || []).filter(Boolean).map(s => `<img src="${imgSrc(s)}">`).join('');
        const meta = [['Código', project.code], ['Versión', project.version], ['Fecha', project.date], ['Preparado por', project.preparedBy]].filter(m => m[1]);
        p.insertAdjacentHTML('afterbegin', project.coverImage ? `<div class="cover-bg"><img src="${imgSrc(project.coverImage)}"></div>` : '');
        p.insertAdjacentHTML('beforeend', `
          <div class="cover-top"><div class="logo">${logo}</div><div class="client-logos">${logos}</div></div>
          <div class="cover-main">
            <div class="cover-kicker">${esc(sec.kicker || project.docTitle || 'Workflow')}</div>
            <h1 class="cover-title">${esc(project.name || 'Proyecto')}</h1>
            ${project.client ? `<div class="cover-sub">${esc(project.client)}</div>` : ''}
            ${meta.length ? `<div class="cover-meta" style="grid-template-columns:repeat(${meta.length},auto)">${meta.map(m => `<div><div class="ml">${esc(m[0])}</div><div class="mv">${esc(m[1])}</div></div>`).join('')}</div>` : ''}
          </div>
          ${project.confidential ? `<div class="cover-conf">${esc(project.confidential)}</div>` : ''}`);
        cur = null; continue;
      }
      if (sec.kind === 'divider') {
        const p = newPage('divider', orient, si);
        p.insertAdjacentHTML('beforeend', `<header class="pg-head"><div class="logo">${logo}</div><div class="pg-meta">${metaHtml}</div></header>
          <div class="div-main">${sec.bigText ? `<div class="div-num">${esc(sec.bigText)}</div>` : ''}<h1 class="div-title">${esc(sec.title)}</h1>${sec.subtitle ? `<div class="div-sub">${esc(sec.subtitle)}</div>` : ''}${sec.text ? `<div class="div-text">${md(sec.text)}</div>` : ''}</div>`);
        tocEntries.push({ part: true, title: sec.title, page: pages.length });
        cur = null; continue;
      }
      if (sec.kind === 'toc') {
        cur = contentPage(orient, si);
        cur.body.insertAdjacentHTML('beforeend', `<div class="sec-title"><h2>${esc(sec.title || 'Contenido')}</h2></div><div class="toc"></div>`);
        tocPage = cur.body.querySelector('.toc');
        cur = null; continue;
      }
      // content section
      if (sec.numbered !== false) num++;
      const fresh = !cur || sec.newPage !== false || cur.orient !== orient;
      if (fresh) cur = contentPage(orient, si);
      if (sec.showTitle !== false) {
        const t = el(`<div class="sec-title keep-next ${fresh ? '' : 'inline'}">${sec.numbered !== false && project.numberSections !== false ? `<span class="n">${pad2(num)}</span>` : ''}<h2>${esc(sec.title)}</h2>${sec.subtitle ? `<span class="sub">${esc(sec.subtitle)}</span>` : ''}</div>`);
        await place(t, sec, si);
      }
      tocEntries.push({ n: sec.numbered !== false ? num : null, title: sec.title, page: pages.indexOf(cur.page) + 1 });
      let units = [];
      for (const b of sec.blocks || []) {
        if (b.hidden) continue;
        const r = (R[b.type] || R.paragraph)(b);
        if (r.skip) continue;
        units.push({ b, r });
      }
      if (sec.columns) units = groupColumns(sec, units);
      if (sec.fitPage) { await placeFit(units, sec, si); continue; }
      for (const { r } of units) {
        if (r.pagebreak) { cur = contentPage(orient, si); continue; }
        if (r.items) await placeSplittable(r, sec, si);
        else await place(r.el, sec, si, r);
      }
    }

    // page numbers
    const total = pages.length;
    pages.forEach((p, i) => { const pn = p.querySelector('.pn'); if (pn) pn.innerHTML = `${pad2(i + 1)} <span>/ ${pad2(total)}</span>`; });
    if (tocPage) {
      tocPage.innerHTML = tocEntries.filter(e => e.title).map(e => e.part
        ? `<div class="toc-row part"><span class="tn"></span><span class="tt">${esc(e.title)}</span><span class="tp">${pad2(e.page)}</span></div>`
        : `<div class="toc-row"><span class="tn">${e.n ? pad2(e.n) : ''}</span><span class="tt">${esc(e.title)}</span><span class="tp">${pad2(e.page)}</span></div>`).join('');
    }
    return pages;
  }

  // column of each block in a "Columnas libres" section: its own choice, or alternating left/right like half-width rows
  function columnsOf(sec) {
    const out = {};
    let run = 0;
    for (const b of sec.blocks || []) {
      const full = ['pagebreak', 'spacer', 'stages', 'storage', 'colorpipe'].includes(b.type) && !b.col;
      const c = b.col || (full || !b.width || b.width === 'full' ? 'full' : run % 2 ? 'right' : 'left');
      if (c === 'full') run = 0; else if (!b.hidden) run++;
      out[b.id] = c;
    }
    return out;
  }

  window.FFRender = { render, logoSVG, pageDims, sectionIsEmpty, columnsOf };
})();
