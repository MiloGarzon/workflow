# Build web/cameras.js from the researched JSON files.
import json, sys, os, re
src, out = sys.argv[1], sys.argv[2]
order = [('ARRI', 'arri.json', None), ('Sony', 'sony.json', None), ('RED', 'red.json', None), ('Apple iPhone', 'apple-dji.json', 'apple'), ('DJI', 'apple-dji.json', 'dji')]
brands, report = [], []
# display order and names follow the user's list
ORDER = ['arri-alexa35', 'arri-alexa35-xtreme', 'arri-alexa65', 'arri-alexa265', 'arri-alexa-mini', 'arri-alexa-mini-lf',
         'sony-venice1', 'sony-venice2-6k', 'sony-venice2-8k', 'sony-fx9', 'sony-fx6', 'sony-fx5', 'sony-fx3', 'sony-fx30', 'sony-burano',
         'red-epic-dragon', 'red-gemini', 'red-helium', 'red-monstro', 'red-vraptor-s35', 'red-vraptor-vv', 'red-vraptor-x-vv', 'red-vraptor-xe',
         'red-vraptor-xl-s35', 'red-vraptor-xl-vv', 'red-vraptor-xl-x-vv', 'red-komodo-6k', 'red-komodo-x', 'red-ranger-gemini', 'red-ranger-helium',
         'red-ranger-monstro', 'red-raven', 'red-scarlet-dragon', 'red-scarlet-mx', 'red-scarlet-w', 'red-weapon-dragon-6k', 'red-weapon-dragon-8k-vv',
         'apple-iphone17pro', 'apple-iphone18pro', 'dji-inspire3-x9', 'dji-inspire2-x7', 'dji-mavic2pro']
NAMES = {'arri-alexa35': 'ALEXA 35', 'arri-alexa35-xtreme': 'ALEXA 35 Xtreme', 'arri-alexa65': 'ALEXA 65', 'arri-alexa265': 'ALEXA 265', 'arri-alexa-mini': 'ALEXA Mini', 'arri-alexa-mini-lf': 'ALEXA Mini LF',
         'sony-venice1': 'Venice 1', 'sony-venice2-6k': 'Venice 2 (6K)', 'sony-venice2-8k': 'Venice 2 (8K)', 'sony-fx9': 'FX9', 'sony-fx6': 'FX6', 'sony-fx5': 'FX5', 'sony-fx3': 'FX3', 'sony-fx30': 'FX30', 'sony-burano': 'Burano',
         'red-epic-dragon': 'Epic Dragon 6K', 'red-gemini': 'Epic-W Gemini 5K', 'red-helium': 'Epic-W / Weapon Helium 8K', 'red-monstro': 'Weapon / DSMC2 Monstro 8K VV',
         'red-vraptor-s35': 'V-Raptor S35', 'red-vraptor-vv': 'V-Raptor VV', 'red-vraptor-x-vv': 'V-Raptor VV [X]', 'red-vraptor-xe': 'V-Raptor XE',
         'red-vraptor-xl-s35': 'V-Raptor XL S35', 'red-vraptor-xl-vv': 'V-Raptor XL VV', 'red-vraptor-xl-x-vv': 'V-Raptor XL VV [X]', 'red-komodo-6k': 'Komodo 6K', 'red-komodo-x': 'Komodo-X',
         'red-ranger-gemini': 'Ranger Gemini', 'red-ranger-helium': 'Ranger Helium', 'red-ranger-monstro': 'Ranger Monstro', 'red-raven': 'Raven 4.5K',
         'red-scarlet-dragon': 'Scarlet (Dragon)', 'red-scarlet-mx': 'Scarlet (MX)', 'red-scarlet-w': 'Scarlet-W 5K', 'red-weapon-dragon-6k': 'Weapon Dragon 6K S35', 'red-weapon-dragon-8k-vv': 'Weapon Dragon 8K VV',
         'dji-inspire3-x9': 'Inspire 3 (X9-8K Air)', 'dji-inspire2-x7': 'Inspire 2 (X7)', 'dji-mavic2pro': 'Mavic 2 Pro'}
# camera makers that don't publish ProRes/DNx rates (RED): use Apple ProRes white paper (1920x1080 @ 29.97)
# and Avid DNxHR (1920x1080 @ 23.976) targets, scaled per pixel
PX30, PX24 = 1920 * 1080 * 29.97, 1920 * 1080 * 23.976
STD = {'ProRes 422 Proxy': 45 / PX30 * 1e6, 'ProRes 422 LT': 102 / PX30 * 1e6, 'ProRes 422': 147 / PX30 * 1e6, 'ProRes 422 HQ': 220 / PX30 * 1e6,
       'ProRes 4444': 330 / PX30 * 1e6, 'ProRes 4444 XQ': 500 / PX30 * 1e6,
       'DNxHR LB': 36 / PX24 * 1e6, 'DNxHR SQ': 116 / PX24 * 1e6, 'DNxHR HQ': 176 / PX24 * 1e6, 'DNxHR HQX': 176 / PX24 * 1e6, 'DNxHR 444': 352 / PX24 * 1e6,
       'DNxHD 36': 36 / PX24 * 1e6, 'DNxHD 115': 115 / PX24 * 1e6, 'DNxHD 175': 175 / PX24 * 1e6, 'DNxHD 175x': 175 / PX24 * 1e6}
RESNAME = {'4096x2160': '4K DCI', '3840x2160': 'UHD', '2048x1080': '2K DCI', '1920x1080': 'HD'}
RENAME = {
    'ProRes RAW (DJI high-rate tier, ~4 bpp)': 'ProRes RAW (tasa normal)',
    'ProRes RAW (DJI reduced-rate tier, ~2 bpp: 8K above 25 fps, 8K 2.39:1, 4K 120)': 'ProRes RAW (tasa reducida: 8K >25 fps, 8K 2.39:1, 4K 120)',
    'H.264 (all modes, max)': 'H.264 (máximo, todos los modos)', 'H.265 (all modes, max)': 'H.265 (máximo, todos los modos)',
    'H.264 (max)': 'H.264 (máximo)', 'H.265 (max)': 'H.265 (máximo)',
    'H.264 4K/4.1K up to 30 fps': 'H.264 4K hasta 30 fps', 'H.264 4K/4.1K 48-60 fps': 'H.264 4K 48–60 fps', 'H.264 4K/4.1K 72-120 fps (FF only, S&Q)': 'H.264 4K 72–120 fps',
}
for name, fn, pref in order:
    path = os.path.join(src, fn)
    if not os.path.exists(path): report.append(f'MISSING {fn}'); continue
    data = json.load(open(path))
    cams = []
    for c in data.get('cameras', []):
        cid = c.get('id', '')
        if pref and not (cid.startswith(pref) or (pref == 'apple' and 'iphone' in cid.lower())): continue
        if c.get('exists') is False: report.append(f'SKIP (no existe) {c.get("name")}'); continue
        res = [{k: r[k] for k in ('key', 'name', 'w', 'h', 'maxfps') if r.get(k) is not None} for r in c.get('resolutions', []) if r.get('w') and r.get('h')]
        for r in res: r['name'] = re.sub(r'\s*\(\d+\s*[x×]\s*\d+\)', '', r['name']).strip()
        keys = {r['key'] for r in res}
        codecs = []
        for x in c.get('codecs', []):
            if not isinstance(x.get('bpp'), (int, float)) or x['bpp'] <= 0: report.append(f'  sin data rate: {c["name"]} · {x.get("name")}'); continue
            r = x.get('res')
            r = [k for k in r if k in keys] if r else None
            br = {k: round(v['bpp'] if isinstance(v, dict) else v, 4) for k, v in (x.get('byRes') or {}).items() if k in keys and isinstance(v.get('bpp') if isinstance(v, dict) else v, (int, float))}
            for rt in sorted(x.get('rates') or [], key=lambda q: abs((q.get('fps') or 24) - 24), reverse=True):
                if rt.get('res') in keys and isinstance(rt.get('bpp'), (int, float)) and rt['bpp'] > 0: br[rt['res']] = round(rt['bpp'], 4)
            if x.get('external'): x = {**x, 'name': x['name'] + ' (grabador externo)'}
            codecs.append({'key': x['key'], 'name': RENAME.get(x['name'], x['name']), 'bpp': round(x['bpp'], 4), **({'res': r} if r else {}), **({'byRes': br} if br else {}), **({'estimated': True} if x.get('estimated') else {})})
        # ProRes/DNx listed without a rate → derived codec limited to its recording resolutions
        derived = {}
        for f in c.get('fixed', []) or []:
            nm = f.get('codec') or f.get('name')
            if f.get('mbps') or nm not in STD: continue
            m = re.match(r'(\d+)\s*[x×]\s*(\d+)', str(f.get('res') or ''))
            if not m: continue
            w, hh = int(m.group(1)), int(m.group(2)); rk = f'out-{w}x{hh}'
            if rk not in keys:
                res.append({'key': rk, 'name': f'{RESNAME.get(f"{w}x{hh}", f"{w}×{hh}")} (salida {nm.split()[0]})', 'w': w, 'h': hh, **({'maxfps': f['maxfps']} if f.get('maxfps') else {})}); keys.add(rk)
            d = derived.setdefault(nm, {'key': 'std-' + re.sub(r'\W+', '-', nm.lower()), 'name': nm, 'bpp': round(STD[nm], 4), 'res': [], 'estimated': True})
            if rk not in d['res']: d['res'].append(rk)
        if derived:
            base = [r['key'] for r in res if not r['key'].startswith('out-')]
            for x in codecs:
                if 'res' not in x: x['res'] = base
        codecs += list(derived.values())
        fixed = [{'key': f['key'], 'name': RENAME.get(f['name'], f['name']), 'mbps': f['mbps']} for f in c.get('fixed', []) or [] if isinstance(f.get('mbps'), (int, float)) and f['mbps'] > 0]
        if not res or not (codecs or fixed): report.append(f'SKIP (sin datos) {c.get("name")}'); continue
        cams.append({'id': cid, 'name': c['name'], 'resolutions': res, 'codecs': codecs, 'fixed': fixed})
        report.append(f'OK {c["name"]}: {len(res)} resoluciones, {len(codecs)} códecs, {len(fixed)} fijos')
    for cm in cams: cm['name'] = NAMES.get(cm['id'], cm['name'])
    cams.sort(key=lambda cm: ORDER.index(cm['id']) if cm['id'] in ORDER else 999)
    if cams: brands.append({'name': name, 'cameras': cams})
open(out, 'w').write('/* FilmFlow Workflow — camera library for the storage calculator.\n   bpp = bits per pixel per frame derived from manufacturer-published data rates (see project notes). Generated file. */\nwindow.FFCameras = ' + json.dumps({'brands': brands}, ensure_ascii=False, indent=1) + ';\n')
print('\n'.join(report))
