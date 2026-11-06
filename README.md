# FilmFlow Workflow

App de macOS para crear los documentos de flujo de trabajo (workflow) de FilmFlow y exportarlos a PDF.

## Instalar
Arrastra `build/FilmFlow Workflow.app` a la carpeta **Aplicaciones**.
Si macOS avisa que no puede verificar al desarrollador: clic derecho sobre la app → **Abrir**.

## Uso rápido
- **Proyecto**: nombre, código, productora, versión, fecha, modo **Oscuro/Claro**, color de acento, logos e imagen de portada.
- **Mis proyectos** (⌘P): todos los workflows se guardan solos dentro de la app y siguen siendo editables. Desde ahí: abrir, duplicar (para una nueva versión), exportar como archivo `.ffworkflow`, eliminar (va a la Papelera) o importar un archivo.
- **Secciones** (barra izquierda): arrastra para reordenar; el interruptor de cada hoja la enciende o apaga en el PDF. **＋ Añadir sección** inserta plantillas (Captura de cámara, Audio, Data workflow, Storage, Laboratorio, Burn-ins, etc.).
- **Cámaras**: en la sección de cámaras, **＋ Añadir cámara** agrega las que necesites (copia las especificaciones de la anterior) y puedes elegir 1, 2 o 3 por fila.
- **Una sola página / Columnas libres** (panel Sección): “Todo en una sola página” mete la sección en una hoja y la reduce si no cabe; “Columnas libres” deja elegir por bloque columna izquierda, derecha o ancho completo. El cálculo de storage con 4+ cámaras se muestra en 2 columnas.
- **Imágenes vacías**: un bloque de imagen sin archivo no sale en el PDF; una hoja que solo tiene imágenes vacías se omite (aparece marcada “sin img”).
- **Bloques**: párrafo, viñetas, datos `Clave: Valor`, cámara, tarjeta de especificaciones, tabla `col | col`, imagen, nota, contactos, nomenclatura, cálculo de storage, diagrama de flujo, salto de página. Botón de ancho (Completo / ½ / ⅓) para poner bloques lado a lado.
- **Imágenes**: arrastrar, pegar (⌘V) o “Elegir…”.
- **Formato de texto**: cada caja de texto tiene una barra con negrita (⌘B), cursiva (⌘I), subrayado (⌘U), tachado (⌘⇧X), resaltado (⌘⇧H), lista con viñetas (⌘⇧8), lista numerada (⌘⇧7), sangría (Tab / ⇧Tab), alineación y tamaño de texto. Se guarda como marcas: `**negrita**`, `*cursiva*`, `++subrayado++`, `~~tachado~~`, `==resaltado==`, `- viñeta`, `1. número`.
- La paginación es automática; las secciones pueden ser verticales u horizontales.
- ⌘S guardar ahora, ⌘N nuevo (desde la plantilla base), ⌘O importar archivo, ⌘⇧S exportar archivo, ⌘E exportar PDF.
- “Guardar como plantilla base” (en Proyecto) hace que los nuevos proyectos partan de tu versión.
- **Backup en iCloud Drive** (activado por defecto, se controla en Mis proyectos): copia automática en `iCloud Drive/FilmFlow Workflow/Proyectos`, historial diario de 30 días en `Historial/`, proyectos borrados en `Eliminados/`, y “Restaurar…” para traerlos de vuelta (por ejemplo en otro Mac).
- Los proyectos viven en `~/Library/Application Support/FilmFlow Workflow/Proyectos/`.

## Recompilar
`./build.sh` (requiere Xcode). El diseño del PDF está en `web/doc.css` y `web/renderer.js`; las plantillas de sección en `web/defaults.js`.

## Instalar en otros Mac
`./make-dmg.sh` genera `build/FilmFlow Workflow <versión>.dmg`. La primera vez en otro Mac: clic derecho › Abrir.

## Versión web (iPhone / iPad)
Se publica sola en https://milogarzon.github.io/workflow/ cada vez que se sube a GitHub un cambio en `web/` (GitHub Actions, `.github/workflows/pages.yml`).
- En iPhone/iPad: Safari › Compartir › “Agregar a inicio” para usarla como app.
- “Abrir desde iCloud” y “Guardar en iCloud” usan la carpeta **iCloud Drive › FilmFlow Workflow › Workflows**.
- La app del Mac sincroniza esa carpeta sola (cada 20 s y al activarse): toma lo guardado desde iPhone/iPad y publica ahí sus proyectos.
- PDF en iOS: botón PDF › Compartir › Guardar en Archivos.
