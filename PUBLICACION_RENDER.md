# Publicación de Posada Grupo Ultralam 2026 en Render

El código de la invitación ya está en la rama aislada `posada-ultralam-2026` de este repositorio. No hay que descargar ni subir el ZIP.

## Render

1. Entrar con `agomez.ultralam@gmail.com` en https://dashboard.render.com/static/new
2. Seleccionar el espacio de trabajo **Invitaciones**. Si no aparece, verificar los accesos desde el panel de Render (la conexión de ChatGPT devolvió 404 para ese espacio).
3. Elegir el repositorio público `https://github.com/aperezultralam-lab/SANTA-AURORA` (si hace falta, opción **Public Git repository**).
4. Configurar:
   - Name: `posada-grupo-ultralam-2026`
   - Branch: `posada-ultralam-2026`
   - Build Command: `node build.js`
   - Publish Directory: `public`
   - Auto Deploy: `yes`
5. Crear el Static Site y esperar **Live**. Abrir su URL pública HTTPS.
6. Verificar que la portada, los logos, la fecha, la hora y el lugar cargan correctamente; compartir la URL por WhatsApp para verificar la imagen de vista previa.

## Confirmaciones en Google Sheets

No compartir como versión definitiva hasta implementar `apps-script/Code.gs`. El código actual deshabilita el botón de confirmación mientras no exista la URL de una aplicación web de Google Apps Script.

1. Abrir la hoja original `INVITACIONES POSADA 2026`: https://docs.google.com/spreadsheets/d/1Wfs_OGgfajWOhGor9v6vn55Irqdmzhp_8JwFgA1zpOU/edit
2. En Google Sheets > Extensiones > Apps Script, crear un proyecto nuevo (no sobrescribir el script previo si hay uno), copiar `apps-script/Code.gs` y autorizarlo.
3. Implementar como Web App; ejecutar como propietario, acceso **Cualquier persona**, y copiar la URL terminada en `/exec`.
4. En Render > Environment, agregar `APPS_SCRIPT_URL` con la URL pública de Apps Script (`/exec`) y volver a desplegar el sitio. El botón se habilita automáticamente cuando el valor es válido.
5. Registrar una confirmación de prueba y verificar la fila nueva en `Posada_Asistencias`; repetir el celular y confirmar que no se duplica. No se envían WhatsApp ni mensajes SMS.

**Estado 9 nov 2026:** Código e imagen preparados, publicación en Render bloqueada por falta de acceso al espacio `Invitaciones` (404). Confirmaciones pendientes de Apps Script.
