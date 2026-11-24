# Traer una hoja de otro documento

## Para qué
Al crear un documento nuevo (p. ej. EOD), que parte de la plantilla base, se quiere reutilizar una hoja ya diseñada en otro documento (p. ej. la 10 · General color pipeline de HDT V4) sin rehacerla. Debe valer para cualquier hoja de cualquier documento de Mis proyectos.

## Objetivos
- Copia **exacta** de la hoja: todos los bloques con su contenido (textos, imágenes, nodos del color pipeline, cámaras…), y los ajustes de la hoja (título, etiqueta, orientación, uso de la hoja, columnas, numeración, página nueva, mostrar título, encendida/apagada).
- Dos formas de uso con el mismo selector:
  - **Reemplazar**: botón en el encabezado del editor de una hoja. La hoja actual queda igual a la elegida, en la misma posición (mantiene su número).
  - **Añadir**: opción “Desde otro documento…” al final del menú ＋ Añadir sección. Inserta la copia después de la hoja seleccionada.
- Funciona en la app del Mac y en la versión web (usa `libList` / `libLoad`, que ya existen en ambas).

## No objetivos
- No traer solo la estructura con contenidos vacíos.
- No copiar estilo del documento (modo, acento, logos): solo la hoja.
- No es un asistente al crear el documento; se usa en cualquier momento.
- Sin vínculo vivo: la copia no se actualiza si cambia el documento de origen.

## Anti-objetivos
- Modificar el documento de origen (solo se lee).
- Reemplazar sin confirmación, o sin poder deshacerlo: reemplazar pide confirmación con el nombre de ambas hojas.

## Approaches
- **A. Solo reemplazar** desde el editor de la hoja: cubre el caso EOD/HDT, pero no permite traer hojas que la plantilla no tenga.
- **B. Solo añadir** desde ＋ Añadir sección: cubre hojas nuevas, pero para el caso EOD obliga a borrar la hoja original a mano.
- **C. Ambas con un mismo selector** — **elegida por el usuario**: poco más trabajo que A y cubre los dos casos.
- Descartado: asistente hoja por hoja al crear el documento (muchos pasos para cambiar 1–2 hojas).

## Diseño
- Selector (overlay como Mis proyectos): lista de documentos de la biblioteca (excepto el actual), con buscador, ordenados por modificación, mostrando nombre · documento · versión · productora. Al elegir uno se cargan sus hojas con número, título, tipo e indicador ▭ horizontal; la portada y el índice se listan también. Botón final: “Reemplazar hoja” o “Añadir hoja” según el modo.
- Copia: `JSON.parse(JSON.stringify(sección))`, nuevos `id` para la sección y cada bloque.
- En modo reemplazar la copia recibe id nuevo y ocupa la posición de la hoja reemplazada; se selecciona tras copiar. Toast “Hoja copiada de HDT V4”.
- Si la hoja reemplazada es la seleccionada y se reemplaza por una de otro tipo (p. ej. portada), se acepta tal cual.

## Decisiones mías (revisables)
- El documento actual no aparece en la lista (para eso está ⧉ Duplicar).
- La confirmación de reemplazo es un `confirm()` simple, como el resto de la app.
- El botón de reemplazar es un icono ⇆ con título “Reemplazar con hoja de otro documento”.

## Para quien lo construya
Estilos del overlay reutilizando las clases de Mis proyectos (`lib-ov`, `lib-card`) donde encajen; texto de README actualizado.
