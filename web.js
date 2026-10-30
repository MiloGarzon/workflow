/* FilmFlow Workflow — browser (iPhone / iPad / any browser) backend.
   Projects live in IndexedDB on the device; iCloud Drive is reached through the system file picker
   ("Abrir desde iCloud") and the share sheet ("Guardar en iCloud" → Guardar en Archivos). */
(function () {
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native) return;

  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('filmflow-workflow', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects'); r.result.createObjectStore('meta'); r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  const get = (s, k) => tx(s, 'readonly', st => st.get(k));
  const put = (s, k, v) => tx(s, 'readwrite', st => st.put(v, k));
  const del = (s, k) => tx(s, 'readwrite', st => st.delete(k));
  const all = s => tx(s, 'readonly', st => st.getAll());

  // keep data from being evicted by the browser
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

  function pickFile() {
    return new Promise(resolve => {
      const i = document.createElement('input');
      i.type = 'file';
      i.style.display = 'none';
      document.body.append(i);
      let done = false;
      const finish = v => { if (done) return; done = true; i.remove(); resolve(v); };
      i.addEventListener('change', async () => {
        const f = i.files && i.files[0];
        if (!f) return finish(null);
        finish({ json: await f.text(), name: f.name });
      });
      i.addEventListener('cancel', () => finish(null));
      i.click();
    });
  }

  async function shareFile(json, name) {
    const fname = name.replace(/[\\/:*?"<>|]+/g, '-') + '.ffworkflow';
    const file = new File([json], fname, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fname }); return fname; }
      catch (e) { if (e && e.name === 'AbortError') return null; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = fname;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return fname;
  }

  // Print-based PDF: Safari's print sheet → Compartir / Guardar como PDF
  async function printPDF(json) {
    const project = JSON.parse(json);
    let root = document.getElementById('printRoot');
    if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.append(root); }
    const pages = await FFRender.render(project, root, { export: true });
    const size = project.pageSize === 'a4' ? ['210mm', '297mm'] : ['8.5in', '11in'];
    let st = document.getElementById('printStyle');
    if (!st) { st = document.createElement('style'); st.id = 'printStyle'; document.head.append(st); }
    st.textContent = `@page { size: ${size[0]} ${size[1]}; margin: 0; } @page land { size: ${size[1]} ${size[0]}; margin: 0; }`;
    pages.forEach(p => { if (p.classList.contains('landscape')) p.style.page = 'land'; });
    document.body.classList.add('printing');
    await new Promise(r => setTimeout(r, 120));
    const cleanup = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(() => { if (document.body.classList.contains('printing') && !matchMedia('print').matches) cleanup(); }, 1500);
    return 'print';
  }

  async function call(cmd, data = {}) {
    switch (cmd) {
      case 'libList': return all('meta');
      case 'libSave': await put('projects', data.id, data.json); await put('meta', data.id, JSON.parse(data.meta)); await put('kv', 'last', data.id); return true;
      case 'libLoad': return (await get('projects', data.id)) || null;
      case 'libDelete': await del('projects', data.id); await del('meta', data.id); return true;
      case 'libLast': return (await get('kv', 'last')) || null;
      case 'loadBaseTemplate': return (await get('kv', 'base')) || null;
      case 'saveBaseTemplate': await put('kv', 'base', data.json); return true;
      case 'resetBaseTemplate': await del('kv', 'base'); return true;
      case 'open': return pickFile();
      case 'exportFile': return shareFile(data.json, data.name);
      case 'exportPDF': return printPDF(data.json);
      case 'setTitle': document.title = data.name; return true;
      default: return null;
    }
  }

  window.FFWeb = { call };
})();
