# Traer hoja de otro documento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copiar una hoja exacta de otro documento de Mis proyectos, reemplazando la hoja actual o añadiéndola como nueva.

**Architecture:** Un selector en overlay (`pickSheetFrom(mode)`) en `web/app.js` que lee la biblioteca con `native('libList')` / `native('libLoad')` (ya existen en Mac y web), y una función pura `cloneSection(s)` que devuelve la copia con ids nuevos. Dos puntos de entrada: botón ⇆ en el encabezado del editor de hoja y opción “Desde otro documento…” en el menú ＋ Añadir sección.

**Tech Stack:** JS vanilla en `web/` (sin build, sin test runner), CSS en `web/app.css`, WKWebView en Mac (sin cambios en Swift).

**Spec:** `docs/superpowers/specs/2026-11-24-traer-hoja-design.md`

## Global Constraints
- Copia exacta: todos los campos de la sección y de sus bloques (deep clone), con `id` nuevo para la sección y para cada bloque.
- El documento de origen nunca se escribe.
- El documento actual no aparece en la lista de documentos.
- Reemplazar pide `confirm()` nombrando la hoja actual y la de origen; añadir no pide confirmación.
- Toast al terminar: `Hoja copiada de <nombre> <versión>`.
- Textos en español, como el resto de la app.

## Review Focus
- Documento de origen con la hoja de Color pipeline antigua (solo imagen vacía): la copia pasa por `normalize` y queda como bloque colorpipe, igual que al abrir ese documento.
- Biblioteca con solo el documento actual: el selector muestra “No hay otros documentos en Mis proyectos.”
- Documento de origen que falla al cargar (`libLoad` devuelve null o JSON inválido): toast “No se pudo leer ese documento” y el selector sigue abierto.
- Reemplazar y luego seguir editando la hoja de origen: los cambios no se reflejan en el otro documento (ids y objetos independientes).
- Pantalla angosta (iPhone): el overlay ocupa toda la pantalla y la lista de hojas se puede desplazar.

---

### Task 1: Selector y copia de hoja

**Files:**
- Modify: `web/app.js` (nuevas funciones junto a `// ================= library`; botón en `renderSectionEditor` ~l.465; opción en el popover `#addSecBtn` ~l.1195)
- Modify: `web/app.css` (estilos `.sheet-pick` tras el bloque `/* library */`)
- Modify: `README.md` (una viñeta en Uso rápido)

**Interfaces:**
- Produces: `cloneSection(s) -> section` (deep clone, ids nuevos); `pickSheetFrom(mode: 'replace' | 'add', target?: section) -> Promise<void>`.

- [ ] **Step 1: `cloneSection(s)`** — `JSON.parse(JSON.stringify(s))`, `id = uid()` en la sección y en cada bloque. No añade “(copia)” al título.

- [ ] **Step 2: `pickSheetFrom(mode, target)`** — overlay con clases `lib-ov` > `lib sheet-pick`: encabezado (“Reemplazar con hoja de otro documento” / “Añadir hoja de otro documento”, botón ✕), buscador `lib-bar`, y dos columnas: documentos (lista de `libList` sin `P().id`, orden por `modified` desc, texto `name · docTitle · version` y `client` debajo) y hojas del documento elegido (cargado con `libLoad` + `normalize`; cada fila: número como en `sectionNumbers` pero calculado sobre ese documento, icono `KIND_ICON`, título o “Portada”, ▭ si horizontal). Al elegir hoja se habilita el botón final (“Reemplazar hoja” / “Añadir hoja”). En pantalla angosta (≤1000px) las columnas se apilan. Escape y clic en el fondo cierran.

- [ ] **Step 3: Aplicar** — replace: `confirm('¿Reemplazar “<target>” con “<origen>” de <doc>?')`, luego `P().sections.splice(idx, 1, copia)`; add: insertar tras `state.sel` (o al final). Después `changed(true); select(copia.id); toast(...)`.

- [ ] **Step 4: Entradas** — botón `⇆` (title “Reemplazar con hoja de otro documento”) entre ⧉ y ✕ en `renderSectionEditor`, llama `pickSheetFrom('replace', s)`. En el popover, tras los grupos de PRESETS: grupo “Otro documento” con botón `⇆ Desde otro documento…` que cierra el popover y llama `pickSheetFrom('add')`.

- [ ] **Step 5: README** — viñeta: “**Traer hoja de otro documento**: ⇆ en una hoja la reemplaza por una copia exacta de una hoja de otro proyecto; ＋ Añadir sección › Desde otro documento… la añade como nueva.”

- [ ] **Step 6: Verificar en la versión web** (Task 2) y commit.

```bash
git add web/app.js web/app.css README.md docs/superpowers
git commit -m "Traer hoja de otro documento (reemplazar o añadir)"
```

### Task 2: Verificación en navegador

- [ ] Servir `web/` (actualizar `.claude/launch.json` al path real de `web/`), importar `Workflows/HDT V4.ffworkflow` y `Workflows/EOD V1.ffworkflow` en IndexedDB vía `native('libSave')` desde la consola.
- [ ] Con EOD abierto, hoja General color pipeline › ⇆ › HDT V4 › 10 General color pipeline › Reemplazar: el bloque colorpipe de EOD queda con el contenido de HDT V4 (comparar JSON salvo ids), en la misma posición y número.
- [ ] ＋ Añadir sección › Desde otro documento… › una hoja con imágenes: se inserta tras la seleccionada.
- [ ] Recorrer las líneas de Review Focus (biblioteca con un solo doc, vista 375px).
- [ ] Sin errores en consola.
