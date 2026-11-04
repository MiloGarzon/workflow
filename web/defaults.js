/* FilmFlow Workflow — built-in template: section presets based on the FilmFlow workflow documents */
(function () {
  const uid = () => Math.random().toString(36).slice(2, 10);
  const B = (type, props = {}) => ({ id: uid(), type, width: 'full', ...props });
  const S = (props) => ({ id: uid(), kind: 'content', orientation: 'portrait', newPage: true, numbered: true, showTitle: true, blocks: [], ...props });

  // ---- storage calculator: data rate from codec × resolution × fps ----
  // bpp = bits per pixel per frame. ProRes from Apple's published 1920×1080 @ 24 fps targets,
  // scaled by pixel count; RAW from bit depth and compression. Values are estimates.
  const PR = mbps => mbps * 1e6 / (24 * 1920 * 1080);
  const CODECS = [
    { group: 'ARRI', items: [
      { key: 'arriraw13', name: 'ARRIRAW (Alexa 35)', bpp: 12.74 },
      { key: 'arrirawhde13', name: 'ARRIRAW HDE (Alexa 35)', bpp: 12.74 * 0.5 },
      { key: 'arriraw12', name: 'ARRIRAW (LF / Mini LF / Mini / 65)', bpp: 12 },
      { key: 'arrirawhde12', name: 'ARRIRAW HDE 12-bit', bpp: 12 * 0.6 }] },
    { group: 'Apple ProRes', items: [
      { key: 'pr-proxy', name: 'ProRes 422 Proxy', bpp: PR(36) },
      { key: 'pr-lt', name: 'ProRes 422 LT', bpp: PR(82) },
      { key: 'pr-422', name: 'ProRes 422', bpp: PR(117) },
      { key: 'pr-hq', name: 'ProRes 422 HQ', bpp: PR(176) },
      { key: 'pr-4444', name: 'ProRes 4444', bpp: PR(264) },
      { key: 'pr-xq', name: 'ProRes 4444 XQ', bpp: PR(396) }] },
    { group: 'Blackmagic RAW (constant bitrate)', items: [
      { key: 'braw3', name: 'Blackmagic RAW 3:1', bpp: 12 / 3 },
      { key: 'braw5', name: 'Blackmagic RAW 5:1', bpp: 12 / 5 },
      { key: 'braw8', name: 'Blackmagic RAW 8:1', bpp: 12 / 8 },
      { key: 'braw12', name: 'Blackmagic RAW 12:1', bpp: 12 / 12 }] },
    { group: 'Otros', items: [
      { key: 'raw', name: 'RAW con compresión X:1 (X-OCN, REDCODE, Canon RAW…)', raw: true },
      { key: 'mbps', name: 'Data rate conocido (Mb/s)', mbps: true },
      { key: 'manual', name: 'Escribir TB/h a mano', manual: true }] },
  ];
  const RESOLUTIONS = [
    { group: 'ARRI Alexa 35', items: [
      ['a35-46og', '4.6K 3:2 Open Gate', 4608, 3164], ['a35-46', '4.6K 16:9', 4608, 2592], ['a35-4k169', '4K 16:9', 4096, 2304],
      ['a35-4k21', '4K 2:1', 4096, 2048], ['a35-38', '3.8K 16:9 (UHD)', 3840, 2160], ['a35-33', '3.3K 6:5', 3328, 2790],
      ['a35-3k', '3K 1:1', 3072, 3072], ['a35-27', '2.7K 8:9', 2743, 3086], ['a35-2k', '2K 16:9 S16', 2048, 1152]] },
    { group: 'ARRI Alexa Mini LF / LF', items: [
      ['lf-45og', '4.5K LF 3:2 Open Gate', 4448, 3096], ['lf-45239', '4.5K LF 2.39:1', 4448, 1856], ['lf-38', 'LF 16:9 UHD', 3840, 2160]] },
    { group: 'ARRI Alexa Mini', items: [
      ['mini-34og', '3.4K Open Gate', 3424, 2202], ['mini-32', '3.2K 16:9', 3200, 1800], ['mini-28', '2.8K 4:3', 2880, 2160]] },
    { group: 'Sony Venice', items: [
      ['v2-86', '8.6K 3:2', 8640, 5760], ['v2-82', '8.2K 17:9', 8192, 4320], ['v-6k32', '6K 3:2', 6048, 4032], ['v-6k169', '6K 17:9', 6054, 3192]] },
    { group: 'RED', items: [
      ['red-8kff', '8K FF 17:9', 8192, 4320], ['red-6k', '6K 17:9', 6144, 3240]] },
    { group: 'Genéricas', items: [
      ['dci4k', '4K DCI', 4096, 2160], ['uhd', 'UHD 3840×2160', 3840, 2160], ['dci2k', '2K DCI', 2048, 1080], ['hd', 'HD 1920×1080', 1920, 1080], ['custom', 'Personalizada…', 0, 0]] },
  ];
  const codecByKey = k => CODECS.flatMap(g => g.items).find(c => c.key === k);
  const resByKey = k => { const r = RESOLUTIONS.flatMap(g => g.items).find(x => x[0] === k); return r && { key: r[0], name: r[1], w: r[2], h: r[3] }; };
  // camera library (cameras.js): each model lists its own sensor modes and recording formats
  const camList = () => ((window.FFCameras && FFCameras.brands) || []).flatMap(b => b.cameras.map(c => ({ ...c, brand: b.name })));
  const camById = id => id ? camList().find(c => c.id === id) : null;
  function camCodec(cam, key) {
    if (!cam) return null;
    const c = (cam.codecs || []).find(x => x.key === key);
    if (c) return { ...c, bpp: c.bpp };
    const f = (cam.fixed || []).find(x => x.key === key);
    return f ? { ...f, fixed: true } : null;
  }
  function camRes(cam, key) {
    const r = cam && (cam.resolutions || []).find(x => x.key === key);
    return r ? { ...r } : null;
  }
  // returns { tbph, mbps, mbFrame, label } or null when the row is typed by hand
  function storageRate(c) {
    const cam = camById(c.cam);
    const cd = camCodec(cam, c.fmt) || codecByKey(c.fmt);
    if (!cd || cd.manual) return null;
    const fps = Number(c.fps) || 0;
    let mbps = 0, res = null;
    if (cd.fixed) mbps = Number(cd.mbps) || 0;
    else if (cd.mbps) mbps = Number(c.mbps) || 0;
    else {
      res = (c.res === 'custom' ? { key: 'custom', name: 'Personalizada' } : camRes(cam, c.res) || resByKey(c.res)) || (cam && cam.resolutions && cam.resolutions[0] ? { ...cam.resolutions[0] } : resByKey('uhd'));
      const w = res.key === 'custom' ? Number(c.w) || 0 : res.w, hh = res.key === 'custom' ? Number(c.h) || 0 : res.h;
      const bpp = cd.raw ? (Number(c.bits) || 12) / Math.max(1, Number(c.ratio) || 1) : Number((cd.byRes && cd.byRes[res.key]) || cd.bpp) || 0;
      mbps = w * hh * bpp * fps / 1e6;
      // manufacturer's exact figure for this resolution + frame rate, when published (e.g. Canon Intra steps per fps)
      const exact = !cd.raw && cd.rf && cd.rf[res.key] && Object.entries(cd.rf[res.key]).find(([f]) => Math.abs(Number(f) - fps) < 0.02);
      if (exact) mbps = exact[1];
      res = { ...res, w, h: hh };
    }
    const tbph = mbps * 3600 / 8 / 1e6;
    const resLabel = !res ? '' : res.key === 'custom' ? `${res.w}×${res.h}` : res.name;
    const codecLabel = cd.raw ? `RAW ${Number(c.bits) || 12}-bit ${Number(c.ratio) || 1}:1` : cd.mbps && !cd.fixed ? `${c.codecName || 'Códec'} ${Number(c.mbps) || 0} Mb/s` : cd.name.replace(/ \(.*\)$/, '');
    return { tbph, mbps, mbFrame: fps && !cd.fixed ? mbps / 8 / fps : 0, estimated: !!cd.estimated, label: [codecLabel, resLabel, fps && !cd.fixed ? `${fps} fps` : ''].filter(Boolean).join(' · ') };
  }
  const STORAGE = { CODECS, RESOLUTIONS, codecByKey, resByKey, storageRate, camList, camById };

  // based on the FilmFlow general color pipeline diagrams (PAL, TDC, DSMD, PP…)
  const colorPipe = () => B('colorpipe', {
    camera: 'ARRI Alexa 35', signal: 'Arri Log-C4', cameraImage: '', monitoring: 'Rec 709 Dim 100 nits', credit: '',
    columns: [
      { title: 'On set color', boxes: [
        { tag: '', tool: 'Pomfort Livegrade', logo: '', specs: 'IDT: ARRI LogC4/AWG4\nIntermediate: ACES 1.3\nODT: Rec 709 100 dim', notes: '', method: 'ACES CDL Advanced', caption: 'Live Color Tools' },
        { tag: '', tool: 'Lockit Script', logo: '', specs: '', notes: '', method: 'Lockit Script', caption: 'Dynamic Metadata' }] },
      { title: 'Data management', boxes: [
        { tag: '', tool: 'Pomfort Silverstack', logo: '', specs: 'IDT: ARRI LogC4/AWG4\nIntermediate: ACES\nODT: Rec 709 100 dim', notes: 'Offload + QC + Metadata', method: '.PFLA Match', caption: 'Offload Tools' }] },
      { title: 'Laboratorio dailies', boxes: [
        { tag: '', tool: 'DaVinci Resolve', logo: '', specs: 'IDT: ARRI LogC4/AWG4\nNode: Creative LUT + CDL\nODT: Rec 709 100 dim', notes: '', method: 'Color Trace', caption: 'Dailies Colorist' },
        { tag: '', tool: 'Netflix Footage Ingest', logo: '', specs: '', notes: '', method: 'Footage Ingest', caption: 'OCF Upload Process' }] },
      { title: 'Entrega', boxes: [
        { tag: '', tool: 'Netflix', logo: '', specs: '', notes: '- DRP\n- AMF\n- EDL\nContent HUB', method: '', caption: 'Post house process' }] }
    ]
  });

  const PRESETS = [
    {
      key: 'cover', name: 'Portada', icon: '◼', group: 'Estructura',
      make: () => S({ kind: 'cover', title: 'Portada', numbered: false })
    },
    {
      key: 'toc', name: 'Índice automático', icon: '☰', group: 'Estructura',
      make: () => S({ kind: 'toc', title: 'Contenido', numbered: false })
    },
    {
      key: 'divider', name: 'Separador de capítulo', icon: '▌', group: 'Estructura',
      make: () => S({ kind: 'divider', title: 'Especificaciones técnicas', subtitle: 'Captura · Audio · Continuidad', bigText: '01', numbered: false })
    },
    {
      key: 'blank', name: 'Sección en blanco', icon: '＋', group: 'Estructura',
      make: () => S({ title: 'Nueva sección', blocks: [B('paragraph', { text: 'Escribe aquí el contenido de la sección.' })] })
    },
    {
      key: 'summary', name: 'Resumen y contacto', icon: '✆', group: 'General',
      make: () => S({
        title: 'Resumen', blocks: [
          B('paragraph', { style: 'lead', text: 'Las siguientes indicaciones muestran el flujo de trabajo diario que se debe tener en cuenta para el desarrollo del proyecto.' }),
          B('paragraph', { text: 'Si tiene cualquier duda o comentario, puede contactarse con:' }),
          B('heading', { text: 'Contacto' }),
          B('contacts', {
            items: [
              { role: 'CEO', name: 'Fernando Parra', phone: 'Tel.: +57 320 854 4830', email: 'fparra@filmflowtv.com' },
              { role: 'COO', name: 'Camilo Silva Garzón', phone: 'Tel.: +57 301 714 7708', email: 'csilva@filmflowtv.com' }
            ]
          })
        ]
      })
    },
    {
      key: 'camera', name: 'Captura de cámara', icon: '◉', group: 'Especificaciones',
      make: () => S({
        title: 'Captura de cámara', blocks: [
          B('keyvalue', { title: 'Especificaciones generales', columns: 1, text: 'Framerate Base: 24 fps\nFraming Aspect Ratio: 1.85:1\nShutter Base: 180°' }),
          B('camera', { width: 'half', label: 'Camera A - B', brand: 'ARRI', model: 'Alexa 35', chips: 'ARRIRAW HDE, 4.6K 3:2 Open Gate, 24 fps', specs: 'Resolution: 4608x3164 4.6K 3:2 OG\nAspect Ratio: 1.85:1\nCodec: ARRIRAW HDE\nColor Space: Log-C4\nLentes: Leica Summilux - Angenieux\nCard Type: CODEX Compact Drive' }),
          B('camera', { width: 'half', label: 'Camera D (Drone)', brand: 'ARRI', model: 'Alexa Mini', chips: 'ARRIRAW HDE, Open Gate, 24 fps', specs: 'Resolution: 3424x2202 OG\nAspect Ratio: 1.85:1\nCodec: ARRIRAW HDE\nColor Space: Log-C3\nCard Type: CODEX Compact Drive' })
        ]
      })
    },
    {
      key: 'cards', name: 'Tarjetas de cámara', icon: '▤', group: 'Especificaciones',
      make: () => S({
        title: 'Tarjetas de cámara', newPage: false, numbered: false, blocks: [
          B('paragraph', { text: 'Se recomienda tener mínimo **5 tarjetas de cámara por cada cámara**, esto con el fin de asegurar una copia completa de material en tarjetas y no reutilizar tarjetas en el mismo día de rodaje. (Esto es responsabilidad de producción; de no contar con el total de tarjetas recomendadas, producción será responsable de asumir la reutilización de tarjetas en un mismo día de rodaje).' }),
          B('paragraph', { text: 'Se deberá garantizar que el Data Manager descargue 4 tarjetas durante el día, distribuidas como se describe a continuación:' }),
          B('numbered', { text: 'Primera descarga: a media mañana.\nSegunda descarga: al corte de almuerzo.\nTercera descarga: a media tarde.\nCuarta descarga: al final del día de rodaje.' }),
          B('note', { label: 'Importante', text: 'Iniciar el siguiente día de rodaje sin usar las tarjetas de cámara del día anterior.' })
        ]
      })
    },
    {
      key: 'audio', name: 'Captura de audio', icon: '♪', group: 'Especificaciones',
      make: () => S({
        title: 'Captura de audio', blocks: [
          B('keyvalue', { title: 'Recording format', text: 'Formato: 24-bit / 48 kHz Polyphonic Broadcast Wave\nFramerate: 24 fps' }),
          B('heading', { text: 'Configuración' }),
          B('bullets', { text: 'La información de Escena, Plano y Toma deberá estar incluida en el nombre de archivo.\nLos rollos de sonido se numerarán consecutivamente.\nSe grabará un tono de referencia cada día a -20 dB.\nSe proporcionará un reporte de sonido diariamente.' }),
          B('spec', { width: 'half', title: 'Asignación de canales', text: 'L: Boom\nR: Mezcla\nA: Lavalier 1\nB: Lavalier 2\nC: Lavalier 3' })
        ]
      })
    },
    {
      key: 'continuity', name: 'Continuidad', icon: '✎', group: 'Especificaciones',
      make: () => S({
        title: 'Continuidad', blocks: [
          B('bullets', { text: 'Se debe utilizar la marcación con el número de capítulo, escena, plano y toma.\nAl inicio de cada toma debe mostrarse la claqueta electrónica con el código de tiempo.\nEn la claqueta debe estar escrito el nombre del director y director de fotografía.\nCuando la claqueta no alcanza a grabarse al inicio de la toma, esta debe ser colocada al final de dicha toma.\nSe debe especificar cuando se graben velocidades mayores a 24 fps.\nSi alguna toma no contiene sonido, esta debe ser marcada en la claqueta como **MOS**; esto debe ser anotado en el Reporte de Cámara y Script.\nTodos los reportes deben ser entregados al final del día (Cámara, Sonido y Script) al Data Manager en set, para su envío a laboratorio.\nSe debe indicar cualquier cambio de velocidad o notas de guion solicitadas por el director.\nLos clips en Slow Motion deben quedar marcados en claqueta e informados por script.' })
        ]
      })
    },
    {
      key: 'notes', name: 'A tener en cuenta', icon: '!', group: 'Especificaciones',
      make: () => S({
        title: 'A tener en cuenta', blocks: [
          B('bullets', { text: 'Todas las cámaras deben ser sincronizadas con el código de tiempo a la hora del día por el departamento de sonido.\nEsto se debe realizar al inicio de rodaje, luego del corte de almuerzo y cada vez que una cámara es apagada o el framerate sea alterado.\nTodos los rollos de cámara deben ser nombrados con letras, seguido por el número consecutivo del rollo. Ejemplo: **A001, B001, C001, D001**.\nSi existe alguna variación de velocidad en el rodaje, la base del proyecto debe permanecer a 24 fps.\nEl primer fotograma de cada toma debe contener la imagen de la claqueta y código de tiempo. En caso de que la claqueta se encuentre al final del clip, esto debe ser anotado en el reporte de cámara.\nEl segundo asistente de cámara debe llevar un control de los clips grabados por medio de un reporte de cámara; el reporte debe ser entregado cada vez que se cambia de rollo. Los reportes deben ser comparados al momento de la descarga de la tarjeta para revisar el número de clips por rollo.\nEn lo posible colocar la carta de grises cuando existan cambios importantes en locaciones diferentes.\nEn ninguna situación la señal de cámara deberá ser clean en monitores. Es responsabilidad del DIT asegurarse de que la señal de cámara en monitores siempre tenga la info de cámara.\nLos reportes de cámara se realizarán por medio de la aplicación **ZoeLog** y serán entregados digitalmente al Data para su envío en el disco de tráfico y por correo.' })
        ]
      })
    },
    {
      key: 'data', name: 'Data workflow', icon: '⇄', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Data workflow', blocks: [
          B('paragraph', { style: 'lead', text: 'Todas las tarjetas de cámara y sonido serán administradas por el DIT, quien será el encargado de entregarlas al Data Manager para su descarga.' }),
          B('heading', { text: 'Media management' }),
          B('bullets', { text: 'El software a usar para la administración y descarga de archivos será **Silverstack**.\nTodas las tarjetas deberán ser registradas y descargadas a 2 destinos por medio de checksum **XXH128 (xxHash XXH3 family, 128 bit)**.\nEl Data Manager realizará un primer QC para reportar posibles errores en set como: elementos del crew en cuadro, reflejos en superficies, claquetas mal marcadas y demás anotaciones a tener en cuenta durante el procesamiento del material.\nEl Data Manager ingestará metadata correspondiente a la información de Escena-Plano-Toma, información de VFX, valores de plano e información de todos los lentes a los que no sea posible extraer la metadata automáticamente; esta información será exportada en un .CSV para su aplicación en el Laboratorio Digital.\nSe generarán reportes de Data Management y se enviarán diariamente al laboratorio por medio del disco de tráfico, adjuntando también los Reportes de Cámara, Script y Sonido.\nAl finalizar el día, el Data Manager enviará por correo electrónico el reporte de datos del día, adjuntando todos los reportes anteriormente mencionados (cámara, script, sonido y CSV generado por la consola de sonido).\nLa metadata dinámica de los lentes deberá verse registrada en Silverstack y es tarea del Data Manager asegurar su correcta visualización.\nPara los lentes que no tienen metadata dinámica, el Data Manager deberá ingresar manualmente los datos en Silverstack para su correcta visualización en reportes y metadata.' }),
          B('heading', { text: 'Discos y copias' }),
          B('bullets', { text: 'La estructura de carpetas deberá ser siempre la misma y se mantendrá igual en todos los discos del proyecto.\nDiariamente el Data Manager entregará al finalizar la jornada un disco de tráfico a producción para que sea trasladado a las oficinas de FilmFlow.\nEl disco de tráfico deberá ser entregado en las oficinas de FilmFlow a las 9 a.m. de lunes a sábado; cuando el rodaje contemple día sábado, este disco se recibirá el siguiente lunes.\nLos discos de tráfico no podrán viajar en carros que no sean proporcionados por producción.\nLa única persona autorizada para transportar los discos será quien producción asigne a esta labor.' }),
          B('paragraph', { text: 'Se generarán **5 copias de OCF** distribuidas de la siguiente manera:' }),
          B('numbered', { text: 'RAID 5 Master 30 TB (Set)\nDisco de tráfico 4 TB (Set)\nCarga a Netflix Footage Uploader - MPS (FilmFlow)\nServidor Laboratorio Dailies FilmFlow (copia temporal de trabajo)\nLTO-9: una (1) sola copia para entrega a cliente' }),
          B('paragraph', { text: 'El Data Manager diariamente usará la aplicación Netflix Footage Ingest en set para validar que cada reel descargado corresponda a su MHL; con esto se busca minimizar posibles errores en laboratorio al momento del upload del OCF.' }),
          B('note', { label: 'Seguridad', text: 'Los discos de tráfico no estarán encriptados y deberán viajar en maleta Pelican con candado; la clave del candado solo será manipulada por el Data Manager de set y el Data Manager de laboratorio.' })
        ]
      })
    },
    {
      key: 'upload', name: 'Carga y notificaciones', icon: '⇪', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Carga de material', blocks: [
          B('bullets', { text: 'Se subirán los Koko files a Pix System y Content Hub diariamente de acuerdo al orden establecido por post.' }),
          B('image', { src: '', caption: 'Ruta de carga de los Koko files', size: 'large', frame: true }),
          B('bullets', { text: 'Una vez el material es correctamente almacenado en los discos anteriormente mencionados se procederá a realizar el envío de OCF al MPS de Netflix.\nEl laboratorio de Dailies enviará un correo de notificación de liberación de tarjetas una vez todos los backups correspondientes al material del día de rodaje sean realizados de forma correcta.' }),
          B('heading', { text: 'Plantilla correo electrónico' }),
          B('keyvalue', { title: '', text: 'Asunto: COD_REPORTS_DATA_MANAGEMENT_DAY_00_AAAAMMDD\nRollos: A073 - A076 Alexa 35 · B051 - B053 Alexa 35\nRollo de sonido: 23Y03M20\nVideo clips: 108 · TRT 1:52:29 h\nTotal Video Storage: 3.35 TB\nAudio clips: 61 · TRT 1:30:58 h\nTotal Audio Storage: 3.73 GB' }),
          B('note', { label: 'Cierre del correo', text: 'LA DESCARGA DE TODO EL MATERIAL SE GENERÓ CON ÉXITO A LOS DISCOS DESTINADOS POR MEDIO DE VERIFICACIÓN.' })
        ]
      })
    },
    {
      key: 'storage', name: 'Cálculo de almacenamiento', icon: '▦', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Storage calculation', blocks: [
          B('storage', {
            title: 'Unidad principal', showFormula: true, cameras: [
              { label: 'Cámara A', name: 'ARRI ALEXA 35', cam: 'arri-alexa35', fmt: 'arriraw_hde', res: '4p6k_3x2_open_gate_4608x3164', fps: 24, codec: '', days: 36, hours: '1:30', tbph: 0 }
            ]
          }),
          B('paragraph', { text: 'Valores estimados con base en el data rate del códec seleccionado. El cálculo debe revisarse si cambian los días de rodaje o el tiempo rodado por día.' })
        ]
      })
    },
    {
      key: 'folders', name: 'Folder structure', icon: '▸', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Folder structure', blocks: [
          B('image', { src: '', caption: 'Naming & folder convention', size: 'full', frame: true }),
          B('bullets', { text: 'YYYYMMDD_SHOOTDAY_UNIT\n  Audio › Audio Rolls\n  Camera_Media › Camera Format\n  LUTs\n  Looks\n  Reports › Camera · DIT · Script_Notes · Sound\n  Stills' }),
          B('paragraph', { text: 'Main Unit, Second Unit y Splinter Unit se identifican como MU, SU. Ej.: 20231123_DAY075_MU. Cada día de rodaje contiene toda la documentación relevante entregada por el DIT.' })
        ]
      })
    },
    {
      key: 'pipeline', name: 'Color pipeline', icon: '◐', group: 'Data & Laboratorio',
      make: () => S({ title: 'General color pipeline', orientation: 'landscape', blocks: [colorPipe()] })
    },
    {
      key: 'flow', name: 'Diagrama de flujo', icon: '⇉', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Workflow', orientation: 'landscape', blocks: [
          B('stages', {
            columns: [
              { title: 'Trabajo en set', items: 'Alexa 35 | Cámaras A - B\nSound Devices | Grabación de audio\nTeradek 4K Bolt | Transmisión\nFlanders DM220 | OLED monitoring\nKoko | Video assist' },
              { title: 'On set · Near set data', items: 'Silverstack XT | Transfer + checksum xxHash\nRAID 5 OWC ThunderBay 4 | 40 TB · 30 TB usables\nSanDisk Extreme Pro 4 TB | Disco de tráfico\nPelican | Transporte con candado' },
              { title: 'Dailies colorist', items: 'Servidor 200 TB | FilmFlow laboratorio\nColor matching | Luces y corrección primaria\nDAV export | DRP · AMF · Stills' },
              { title: 'Entregas', items: 'Netflix MPS | Upload OCF · 3.5 GB bandwidth\nContent Hub | Dailies editoriales\nLTO-9 | Copia master para cliente' }
            ]
          }),
          B('note', { label: 'Monitores en set', text: 'Flanders DM220 x2: Dirección y Fotografía · Flanders DM160 x2: Crew y Productores.' })
        ]
      })
    },
    {
      key: 'lab', name: 'Especificaciones laboratorio', icon: '⚗', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Especificaciones laboratorio', blocks: [
          B('spec', { width: 'half', title: 'Dailies ejecutivos', text: 'Format: QuickTime\nCodec: H.264\nNetwork Optimization: Sí\nResolution: 1920x1080 HD\nQuality: Restrict to 15000 Kb/s\nAudio Codec: AAC\nBit Rate: Constant Bit Rate\nData Rate: 128 Kb/s\nChannels: MIX L&R\nBit Depth: 24' }),
          B('spec', { width: 'half', title: 'Editorial', text: 'Format: MXF OP-Atom\nCodec: DNxHD 115\nResolution: 1920x1080 HD\nAudio Sync: Same as Source\nMetadata: .ALE por cámara\nSource Name: Sí' }),
          B('naming', { title: 'Nomenclatura de clips', separator: '_', text: 'Código del proyecto = COD\nEscena = 083\nPlano = 1\nToma = 2\nCámara = A' }),
          B('bullets', { text: 'Los Dailies Ejecutivos serán compartidos por medio de Pix System, de acuerdo al orden de visualización proporcionado por Post.\nLos Dailies Editoriales serán compartidos por medio de Content Hub de acuerdo al orden de visualización proporcionado por Post.\nEl tiempo estimado para la entrega de los dailies dependerá de la hora en que producción entregue el disco en FilmFlow.' })
        ]
      })
    },
    {
      key: 'burnins', name: 'Burn-ins', icon: '▣', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Burn-ins', orientation: 'landscape', blocks: [
          B('image', { src: '', caption: '', size: 'full', frame: true, fill: true }),
          B('table', { header: true, text: 'Superior | Inferior\nLens · FPS · Clip name | Audio TC · Source TC · Shoot date & day · Source clip name' })
        ]
      })
    },
    {
      key: 'colorist', name: 'Dailies colorist workflow', icon: '◑', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Dailies colorist workflow', blocks: [
          B('paragraph', { style: 'lead', text: 'Con esto se busca obtener el mejor resultado en el proceso de color grade, aprovechando la etapa de creación de dailies como potencializador del color final, ganando procesos primarios para aprovechar el tiempo final en detalles.' }),
          B('heading', { text: 'Etapa de ingesta y logger' }),
          B('paragraph', { text: 'Para esta etapa se creará un proyecto de DaVinci en donde el Dailies Colorist ingestará todo el OCF correspondiente al día.\n\nUna vez los OCF están ingestados, creamos una secuencia que contenga todo el día de rodaje; esta tarea se repite durante todo el proceso.' }),
          B('heading', { text: 'Etapa de dailies color grade' }),
          B('paragraph', { text: 'Una vez preparado el timeline, el dailies colorist configura el proyecto usando el color management aprobado por la producción.\n\nCon el color management configurado aplicamos la estructura nodal diseñada, donde quedan todos los procesos necesarios para la colorización del proyecto; esto se diseña específicamente para cada show.\n\nYa con el setup y la estructura aplicada, el dailies colorist comienza a hacer ajustes primarios.\n\nCuando el dailies colorist haya terminado de colorizar la secuencia se enviará el DRP con todas las correcciones, un archivo AMF y STILLS por medio de Content Hub.' }),
          B('heading', { text: 'Stills en Google Drive de FilmFlow' }),
          B('numbered', { text: '**Stills set:** el Data Manager los subirá todas las noches finalizado el día de rodaje.\n**Stills dailies colorist:** el operador de dailies los subirá una vez el color sea aprobado y el render haya finalizado.' }),
          B('note', { text: 'El acceso a esta carpeta deberá estar debidamente autorizado por producción.' })
        ]
      })
    },
    {
      key: 'ambient', name: 'Ambient workflow', icon: '◎', group: 'Data & Laboratorio',
      make: () => S({
        title: 'Ambient workflow', blocks: [
          B('bullets', { text: 'El Supervisor de Script usará **LockitScript** para sus reportes diarios; estos serán cargados diariamente a la nube de Ambient LockitNetwork.' }),
          B('paragraph', { text: 'Con este flujo se pretende optimizar los tiempos del departamento editorial, logrando enviar toda la información importante generada en set por medio de metadatos fáciles de aplicar al material en los diferentes softwares de edición.' })
        ]
      })
    },
    {
      key: 'image', name: 'Página de imagen', icon: '▧', group: 'Estructura',
      make: () => S({ title: 'Imagen', orientation: 'landscape', blocks: [B('image', { src: '', caption: '', size: 'full', fill: true })] })
    }
  ];

  function presetByKey(k) { return PRESETS.find(p => p.key === k); }

  function defaultProject() {
    const keys = ['cover', 'summary', 'divider', 'camera', 'cards', 'audio', 'continuity', 'notes', 'divider2', 'data', 'upload', 'storage', 'folders', 'pipeline', 'flow', 'lab', 'burnins', 'colorist', 'ambient'];
    const sections = keys.map(k => {
      if (k === 'divider2') return { ...presetByKey('divider').make(), title: 'Data workflow', subtitle: 'Data · Laboratorio · Entregas', bigText: '02' };
      return presetByKey(k).make();
    });
    return {
      app: 'ffworkflow', schema: 1,
      name: 'Nombre del proyecto', code: 'COD', client: 'Productora · Plataforma', docTitle: 'Workflow',
      version: 'V1', date: new Date().toISOString().slice(0, 10), preparedBy: 'FilmFlow',
      confidential: 'Documento confidencial · Uso exclusivo de la producción',
      footer: 'FilmFlow · Laboratorio digital',
      theme: 'dark', accent: '#37A14F', pageSize: 'letter', decoration: 'full', numberSections: true,
      logo: '', coverImage: '', clientLogos: [],
      sections
    };
  }

  const BLOCK_TYPES = [
    { type: 'heading', name: 'Subtítulo', icon: 'H', make: () => B('heading', { text: 'Subtítulo' }) },
    { type: 'paragraph', name: 'Párrafo', icon: '¶', make: () => B('paragraph', { text: '' }) },
    { type: 'bullets', name: 'Viñetas', icon: '•', make: () => B('bullets', { text: '' }) },
    { type: 'numbered', name: 'Lista numerada', icon: '1.', make: () => B('numbered', { text: '' }) },
    { type: 'keyvalue', name: 'Datos (clave: valor)', icon: ':', make: () => B('keyvalue', { title: '', columns: 1, text: 'Dato: Valor' }) },
    { type: 'spec', name: 'Tarjeta de especificaciones', icon: '▤', make: () => B('spec', { width: 'half', title: 'Título', text: 'Dato: Valor' }) },
    { type: 'camera', name: 'Cámara', icon: '◉', make: () => B('camera', { width: 'half', label: 'Camera A', brand: 'ARRI', model: 'Alexa 35', chips: 'ARRIRAW, 24 fps', specs: 'Resolution: \nAspect Ratio: \nCodec: \nColor Space: \nLentes: \nCard Type: ' }) },
    { type: 'image', name: 'Imagen', icon: '▧', make: () => B('image', { src: '', caption: '', size: 'full', frame: false }) },
    { type: 'note', name: 'Nota destacada', icon: '!', make: () => B('note', { label: 'Importante', text: '' }) },
    { type: 'table', name: 'Tabla', icon: '▦', make: () => B('table', { header: true, text: 'Columna 1 | Columna 2\nDato | Dato' }) },
    { type: 'contacts', name: 'Contactos', icon: '✆', make: () => B('contacts', { items: [{ role: 'Cargo', name: 'Nombre', phone: '', email: '' }] }) },
    { type: 'naming', name: 'Nomenclatura', icon: '_', make: () => B('naming', { title: 'Nomenclatura', separator: '_', text: 'Proyecto = COD\nEscena = 001' }) },
    { type: 'storage', name: 'Cálculo de storage', icon: 'TB', make: () => B('storage', { title: 'Unidad principal', showFormula: true, cameras: [{ label: 'Cámara A', name: 'ARRI ALEXA 35', cam: 'arri-alexa35', fmt: 'arriraw_hde', res: '4p6k_3x2_open_gate_4608x3164', fps: 24, codec: '', days: 30, hours: '1:30', tbph: 0 }] }) },
    { type: 'colorpipe', name: 'Color pipeline', icon: '◐', make: colorPipe },
    { type: 'stages', name: 'Diagrama de flujo', icon: '⇉', make: () => B('stages', { columns: [{ title: 'Etapa 1', items: 'Elemento | detalle' }, { title: 'Etapa 2', items: 'Elemento | detalle' }] }) },
    { type: 'spacer', name: 'Espacio', icon: '↕', make: () => B('spacer', { size: 16 }) },
    { type: 'pagebreak', name: 'Salto de página', icon: '⤓', make: () => B('pagebreak', {}) },
  ];

  window.FFDefaults = { PRESETS, BLOCK_TYPES, defaultProject, uid, colorPipe, STORAGE };
})();
